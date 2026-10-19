import { identifySong, indexEntries, referenceEntries, songIdentity, songsForSlug, songUrlSlug, type IdentityEntry, type SongReference } from "@/lib/song-identity";
import "server-only";

import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { siteConfig } from "@/config/site";
import { loadStoredServices, saveServices, type SaveSummary } from "@/lib/archive-store";
import { buildLibrary, type LibrarySong } from "@/lib/library";
import { getSchedule, publishedHistory, scheduleEnv } from "@/lib/schedule";
import { listCatalogSongs, listPlans, plannerConfigured, type CatalogSong } from "@/lib/service-planner/store";
import {
  type IndexSong,
  matchIndexSong,
  type PublicSheetMusic,
  toPublicSheetMusic,
  versionedFileHref,
} from "@/lib/sheet-music";
import { canAccessFile, MEMBER_VIEWER, PUBLIC_VIEWER, type Viewer } from "@/lib/sheet-music-access";
import { getSheetMusicIndex, SHEET_MUSIC_TAG, type SheetMusicErrorReason } from "@/lib/sheet-music-index";
import {
  buildCompanions,
  buildPlayIndex,
  buildSongRecords,
  type Companion,
  mergeServices,
  pastServices,
  type PlayIndex,
} from "@/lib/song-history";
import { datedServices, songPath } from "@/lib/song-list";
import { buildSongStats, type SongStats } from "@/lib/song-stats";
import { availableYears, buildYearRecap, type YearRecap } from "@/lib/year-recap";
import type { DatedService, ServiceSlot, SongListResult, SongRecord } from "@/types/song-list";

/** Cache tag for the stored archive; the nightly sync invalidates it. */
export const ARCHIVE_TAG = "song-archive";

/** Cache tag for the Service Planner's catalog songs; adding a song invalidates it. */
export const CATALOG_TAG = "catalog-songs";

/**
 * The stored archive. The underlying data changes once a night, when the sync
 * runs and invalidates the tag, so the time limit is only a backstop
 * (siteConfig.songList.dataRevalidateSeconds).
 */
const getStoredServices = unstable_cache(loadStoredServices, ["song-archive-services"], {
  tags: [ARCHIVE_TAG],
  revalidate: siteConfig.songList.dataRevalidateSeconds,
});

export interface SongHistory {
  /** Every known service, archived and published, oldest first. */
  services: DatedService[];
  /** False when the archive could not be read and only published plans were used. */
  persistent: boolean;
}

/**
 * The complete song history: the permanent archive merged with the Service
 * Planner's published services.
 *
 * Published services are included straight away, so the history is current
 * even before the nightly sync has archived them. Within FRESH_DAYS of a
 * service the planner's version wins (a correction after the fact shows at
 * once); after that the archived copy is frozen (src/lib/song-history.ts).
 */
export async function getSongHistory(published: DatedService[], now: number): Promise<SongHistory> {
  let stored: DatedService[] | null = null;

  try {
    stored = await getStoredServices();
  } catch (error) {
    console.error(
      "[song-archive] Could not read the archive database:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  return {
    services: await identifiedServices(mergeServices(stored ?? [], published, now)),
    persistent: stored !== null,
  };
}

/** The published services of a schedule result, or none when it failed. */
function publishedOf(result: SongListResult): DatedService[] {
  return result.ok ? result.published : [];
}

export interface ScheduleData {
  result: SongListResult;
  /** When each song on the visible months was sung; null if the schedule failed. */
  plays: PlayIndex | null;
  /** When this data was loaded, for the first paint; the browser keeps its own clock after. */
  loadedAt: number;
}

/**
 * Everything the schedule page needs, in one call.
 *
 * For the hints, only PAST services come from the full history; future ones
 * come from the visible months alone. Drafts never reach here at all.
 */
export async function getScheduleData(): Promise<ScheduleData> {
  const raw = await getSchedule();
  const loadedAt = Date.now();
  if (!raw.ok) return { result: raw, plays: null, loadedAt };
  const history = await getSongHistory(raw.published, loadedAt);
  const identities = referenceEntries([
    ...history.services.flatMap((service) => service.songs),
    ...raw.months.flatMap((month) => month.services.flatMap((service) => service.songs)),
  ], await songDirectory());
  const result = {
    ...raw,
    months: raw.months.map((month) => ({ ...month, services: month.services.map((service) => ({
      ...service, songs: service.songs.map((song) => identifySong(song, identities)),
    })) })),
    published: raw.published.map((service) => ({ ...service, songs: service.songs.map((song) => identifySong(song, identities)) })),
  };

  const known = mergeServices(
    pastServices(history.services, loadedAt),
    datedServices(result.months),
    loadedAt,
  );
  const onScreen = new Set(
    result.months.flatMap((month) =>
      month.services.flatMap((service) => service.songs.map((song) => songIdentity(song))),
    ),
  );

  return { result, plays: buildPlayIndex(known, onScreen), loadedAt };
}

export type ArchiveData =
  | {
      ok: true;
      /** One record per song ever sung, with every time it was sung. */
      records: SongRecord[];
      /** Number of services recorded. */
      serviceCount: number;
      /** Start of the earliest recorded service, or null if there are none. */
      since: string | null;
      /** False when only published plans could be read (no permanent archive). */
      persistent: boolean;
      loadedAt: number;
    }
  | { ok: false };

/**
 * The song archive: every song sung in a service that has already happened,
 * from the permanent archive and the published plans combined.
 */
export async function getArchiveData(): Promise<ArchiveData> {
  const history = await loadPast();
  if (!history) return { ok: false };
  const { past, persistent, loadedAt } = history;

  return {
    ok: true,
    records: songRecordsOf(past),
    serviceCount: past.length,
    since: past[0]?.startsAt ?? null,
    persistent,
    loadedAt,
  };
}

/**
 * Every service that has already happened, from the archive and the published
 * plans combined. null when neither source is available, as there is nothing
 * honest to show then.
 */
export const loadPast = cache(async (): Promise<{
  past: DatedService[];
  persistent: boolean;
  loadedAt: number;
} | null> => {
  const schedule = await getSchedule();
  const loadedAt = Date.now();
  const history = await getSongHistory(publishedOf(schedule), loadedAt);
  if (!schedule.ok && !history.persistent) return null;

  return {
    past: pastServices(history.services, loadedAt),
    persistent: history.persistent,
    loadedAt,
  };
});

/**
 * One record per song for a list of services - built once per request for
 * the same list (loadPast's), however many parts of the page ask.
 */
const songRecordsOf = cache((services: DatedService[]): SongRecord[] => buildSongRecords(services));

export type YearRecapData =
  | {
      ok: true;
      /** null when nothing is recorded for that year. */
      recap: YearRecap | null;
      /** Every year with a recorded service, oldest first. */
      years: number[];
      loadedAt: number;
    }
  | { ok: false };

/**
 * A year of singing, for /song-list/year/[year]: the same history as the
 * archive (services that have already happened), summed up for one year.
 * Pass no year to learn only which years exist.
 */
export const getYearRecapData = cache(async (year?: number): Promise<YearRecapData> => {
  const schedule = await getSchedule();
  const loadedAt = Date.now();
  const history = await getSongHistory(publishedOf(schedule), loadedAt);
  if (!schedule.ok && !history.persistent) return { ok: false };

  const past = pastServices(history.services, loadedAt);
  return {
    ok: true,
    recap: year === undefined ? null : buildYearRecap(past, year, loadedAt),
    years: availableYears(past),
    loadedAt,
  };
});

export type LibraryData =
  | { ok: true; songs: LibrarySong[]; loadedAt: number }
  | { ok: false };

/**
 * The catalog as the public pages read it, shared across requests so that
 * re-rendering a page does not wake the database. Keyed by environment (the
 * argument). Only used when the Sheet Music Index was read, so the catalog's
 * links to it are complete; adding a song (CATALOG_TAG) or refreshing the
 * sheet music clears it.
 */
const getCachedCatalog = unstable_cache(
  // `indexVersion` is only part of the key: when the Index's songs change, the
  // catalog is linked to them afresh, as it was when it was read every time.
  async (env: ReturnType<typeof scheduleEnv>, indexVersion: string): Promise<CatalogSong[]> => {
    void indexVersion;
    const index = await getSheetMusicIndex();
    if (!index.ok) throw new Error("The Sheet Music Index is unavailable");
    return listCatalogSongs(env, indexEntries(index.index.songs));
  },
  ["catalog-songs"],
  { tags: [CATALOG_TAG, SHEET_MUSIC_TAG], revalidate: siteConfig.songList.dataRevalidateSeconds },
);

/** A short fingerprint of what the catalog is linked by: each Index song's ID, title, number and collection. */
function indexVersionOf(songs: Parameters<typeof indexEntries>[0]): string {
  const hash = createHash("sha256");
  for (const { id, title, hymnNumber, collection } of songs) hash.update(`${id}\u0000${title}\u0000${hymnNumber ?? ""}\u0000${collection ?? ""}\u0001`);
  return hash.digest("base64url");
}

/**
 * Songs added in the Service Planner's catalog - new songs that may not have
 * been sung yet. Empty (never an error) when the planner cannot be read.
 * Read once per request.
 */
const catalogSongs = cache(async (): Promise<CatalogSong[]> => {
  if (!plannerConfigured()) return [];
  try {
    const index = await getSheetMusicIndex();
    // Without the Index, read directly (as before) rather than keep a partial answer.
    if (!index.ok) return await listCatalogSongs(scheduleEnv(), []);
    return await getCachedCatalog(scheduleEnv(), indexVersionOf(index.index.songs));
  } catch (error) {
    console.error("[song-archive] Could not read the catalog:", error instanceof Error ? error.message : "unknown error");
    return [];
  }
});

/**
 * The Library, /library: every song that has a page - sung in a past
 * service, scheduled in an upcoming published one, or added to the catalog
 * in the Service Planner.
 */
/** Canonical identities plus persisted catalog aliases, shared by every public read. */
export const songDirectory = cache(async (): Promise<IdentityEntry[]> => {
  const [index, catalog] = await Promise.all([getSheetMusicIndex(), catalogSongs()]);
  const entries = index.ok ? indexEntries(index.index.songs) : [];
  for (const song of catalog) {
    const entry = entries.find((entry) => entry.id === song.songId);
    const alias = song.catalogId && song.catalogId !== song.songId ? [song.catalogId] : [];
    if (entry) entry.aliases = [...(entry.aliases ?? []), ...alias];
    else entries.push({ id: song.songId, title: song.title, number: song.number, collection: song.collection, aliases: alias });
  }
  return entries;
});

async function identifiedServices(services: DatedService[], known?: readonly IdentityEntry[]): Promise<DatedService[]> {
  const entries = referenceEntries(services.flatMap((service) => service.songs), known ?? await songDirectory());
  return services.map((service) => ({ ...service, songs: service.songs.map((song) => identifySong(song, entries)) }));
}

export async function getLibraryData(): Promise<LibraryData> {
  const [history, schedule, index, catalog, entries] = await Promise.all([
    loadPast(), getSchedule(), getSheetMusicIndex(), catalogSongs(), songDirectory(),
  ]);
  if (!history && !index.ok && !catalog.length && !schedule.ok) return { ok: false };
  const loadedAt = history?.loadedAt ?? Date.now();
  const upcoming = [
    ...(history?.past.flatMap((service) => service.songs) ?? []),
    ...(schedule.ok ? schedule.published.filter((service) => Date.parse(service.startsAt) > loadedAt).flatMap((service) => service.songs) : []),
    ...catalog,
  ];
  const hasSheetMusic = (song: SongReference) => {
    if (!index.ok) return false;
    const matched = matchIndexSong(index.index, song, siteConfig.sheetMusic.hymnalCollection);
    return matched ? publicSheetMusic(songUrlSlug(song), matched, PUBLIC_VIEWER).available : false;
  };
  return { ok: true, songs: buildLibrary(songRecordsOf(history?.past ?? []), upcoming, hasSheetMusic, entries), loadedAt };
}

/** More than one result is a legacy disambiguation page, never a redirect. */
export const getSongChoices = cache(async (slug: string): Promise<LibrarySong[]> => {
  const library = await getLibraryData();
  return library.ok ? songsForSlug(slug, library.songs) : [];
});

/** One time a song was (or will be) sung. */
export interface SongPlay {
  startsAt: string;
  slot: ServiceSlot;
  key: string | null;
}

export interface SongPageData {
  songId: string;
  collection: string | null;
  slug: string;
  title: string;
  number: string | null;
  /** Every time it has been sung, newest first. */
  plays: SongPlay[];
  /** Services it is scheduled for that have not happened yet, soonest first. */
  upcoming: SongPlay[];
  /** Songs habitually sung in the same service; usually none. */
  companions: Companion[];
  stats: SongStats;
  /**
   * What the Sheet Music Index knows about it, with links to the files this
   * visitor may open. null when the song is not in the Index, or the Index
   * cannot be read.
   */
  sheetMusic: PublicSheetMusic | null;
  loadedAt: number;
}

interface FoundSong {
  history: Awaited<ReturnType<typeof loadPast>>;
  record: SongRecord | undefined;
  upcoming: Array<SongPlay & SongReference>;
  song: LibrarySong;
  loadedAt: number;
}

const findSong = cache(async (slug: string): Promise<FoundSong | null> => {
  const [choices, history, schedule, directory] = await Promise.all([getSongChoices(slug), loadPast(), getSchedule(), songDirectory()]);
  if (choices.length !== 1) return null;
  const song = choices[0];
  const loadedAt = history?.loadedAt ?? Date.now();
  const entries = referenceEntries([
    ...(history?.past.flatMap((service) => service.songs) ?? []),
    ...(schedule.ok ? schedule.published.flatMap((service) => service.songs) : []),
  ], directory);
  const record = history ? songRecordsOf(history.past).find((record) => record.id === song.id) : undefined;
  const upcoming: FoundSong["upcoming"] = [];
  if (schedule.ok) for (const service of schedule.published) {
    if (Date.parse(service.startsAt) <= loadedAt) continue;
    for (const ref of service.songs) {
      if (songIdentity(ref, entries) !== song.id) continue;
      upcoming.push({ ...identifySong(ref, entries), startsAt: service.startsAt, slot: service.slot });
    }
  }
  upcoming.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return { history, record, upcoming, song, loadedAt };
});

/** The browser-safe sheet music for a song page; links point at the file route. */
function publicSheetMusic(slug: string, song: IndexSong, viewer: Viewer): PublicSheetMusic {
  return toPublicSheetMusic(
    song,
    (file) => canAccessFile(song, file, viewer),
    (file) => versionedFileHref(`${songPath(slug)}/sheet-music/${file.slug}`, file),
    (file) => canAccessFile(song, file, MEMBER_VIEWER),
  );
}

/**
 * The Index entry behind a song page, Drive File IDs included - for the file
 * route only, which must still check canAccessFile() before serving anything.
 */
export async function getIndexSongForPage(
  slug: string,
): Promise<{ ok: true; song: IndexSong | null } | { ok: false; reason: SheetMusicErrorReason }> {
  const index = await getSheetMusicIndex();
  if (!index.ok) return index;

  const found = await findSong(slug);
  return {
    ok: true,
    song: found
      ? matchIndexSong(
          index.index,
          found.song,
          siteConfig.sheetMusic.hymnalCollection,
        )
      : null,
  };
}

/**
 * Everything about one song, for /library/songs/[song]: its full history
 * from the archive, plus any upcoming services it is already scheduled for,
 * and what the Sheet Music Index has for it.
 *
 * A song scheduled for the first time has no history yet but still gets a
 * page, so links from the schedule never lead nowhere. Returns null for an
 * address that matches no song at all.
 */
export const getSongPage = cache(async (slug: string): Promise<SongPageData | null> => {
  const [found, index] = await Promise.all([findSong(slug), getSheetMusicIndex()]);
  if (!found) return null;
  const { history, record, upcoming, song, loadedAt } = found;
  const { title, number } = song;

  const indexSong = index.ok
    ? matchIndexSong(index.index, song, siteConfig.sheetMusic.hymnalCollection)
    : null;

  return {
    songId: song.id,
    collection: song.collection,
    slug: song.slug,
    title,
    number,
    sheetMusic: indexSong ? publicSheetMusic(song.slug, indexSong, PUBLIC_VIEWER) : null,
    plays: [...(record?.plays ?? [])].reverse(),
    upcoming: upcoming.map(({ startsAt, slot, key }) => ({ startsAt, slot, key })),
    companions:
      history && record
        ? buildCompanions(history.past, record.id, siteConfig.songList.pairings)
        : [],
    stats: buildSongStats(
      history?.past ?? [],
      song.id,
      upcoming.map((play) => play.startsAt),
      loadedAt,
    ),
    loadedAt,
  };
});

/**
 * Copies every published service that has already happened into the
 * permanent archive. Run nightly by Vercel Cron (see
 * src/app/api/cron/sync-archive).
 *
 * Only Production's plans are archived: the archive tables are shared by
 * every environment, and a test plan made locally or on a Preview must never
 * become church history.
 */
export async function syncArchive(now: number): Promise<SaveSummary & { plannedServices: number }> {
  if (scheduleEnv() !== "production") {
    return { added: 0, refreshed: 0, frozen: 0, plannedServices: 0 };
  }
  if (!plannerConfigured()) throw new Error("DATABASE_URL is not set");

  const plans = await listPlans("production", { statuses: ["published"] });
  const services = pastServices(publishedHistory(plans), now);
  const summary = await saveServices(services, now);
  return { ...summary, plannedServices: services.length };
}

export interface ReportInputs {
  /** Every service that has already happened. */
  past: DatedService[];
  /** Published services that have not happened yet. */
  upcoming: DatedService[];
  persistent: boolean;
  loadedAt: number;
}

/**
 * The raw material for the quarterly report (see src/lib/quarterly-report.ts):
 * the whole history, and what is already scheduled. null when neither the
 * planner nor the archive can be read.
 */
export async function getReportInputs(): Promise<ReportInputs | null> {
  const schedule = await getSchedule();
  const loadedAt = Date.now();
  const history = await getSongHistory(publishedOf(schedule), loadedAt);
  if (!schedule.ok && !history.persistent) return null;

  return {
    past: pastServices(history.services, loadedAt),
    upcoming: schedule.ok
      ? await identifiedServices(schedule.published.filter((service) => Date.parse(service.startsAt) > loadedAt), referenceEntries(history.services.flatMap((service) => service.songs), await songDirectory()))
      : [],
    persistent: history.persistent,
    loadedAt,
  };
}
