import "server-only";

import { unstable_cache } from "next/cache";

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
} from "@/lib/sheet-music";
import { canAccessFile, MEMBER_VIEWER, PUBLIC_VIEWER, type Viewer } from "@/lib/sheet-music-access";
import { getSheetMusicIndex, type SheetMusicErrorReason } from "@/lib/sheet-music-index";
import {
  buildCompanions,
  buildPlayIndex,
  buildSongRecords,
  type Companion,
  mergeServices,
  pastServices,
  type PlayIndex,
} from "@/lib/song-history";
import { datedServices, songKey, songPath, songSlug } from "@/lib/song-list";
import { buildSongStats, type SongStats } from "@/lib/song-stats";
import { availableYears, buildYearRecap, type YearRecap } from "@/lib/year-recap";
import type { DatedService, ServiceSlot, SongListResult, SongRecord } from "@/types/song-list";

/** Cache tag for the stored archive; the nightly sync invalidates it. */
export const ARCHIVE_TAG = "song-archive";

/**
 * The stored archive, cached for an hour. The underlying data changes once a
 * night, when the sync runs and invalidates the tag.
 */
const getStoredServices = unstable_cache(loadStoredServices, ["song-archive-services"], {
  tags: [ARCHIVE_TAG],
  revalidate: 3600,
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
    services: mergeServices(stored ?? [], published, now),
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
  const result = await getSchedule();
  const loadedAt = Date.now();
  if (!result.ok) return { result, plays: null, loadedAt };

  const history = await getSongHistory(result.published, loadedAt);
  const known = mergeServices(
    pastServices(history.services, loadedAt),
    datedServices(result.months),
    loadedAt,
  );
  const onScreen = new Set(
    result.months.flatMap((month) =>
      month.services.flatMap((service) => service.songs.map((song) => songKey(song.title))),
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
    records: buildSongRecords(past),
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
export async function loadPast(): Promise<{
  past: DatedService[];
  persistent: boolean;
  loadedAt: number;
} | null> {
  const schedule = await getSchedule();
  const loadedAt = Date.now();
  const history = await getSongHistory(publishedOf(schedule), loadedAt);
  if (!schedule.ok && !history.persistent) return null;

  return {
    past: pastServices(history.services, loadedAt),
    persistent: history.persistent,
    loadedAt,
  };
}

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
export async function getYearRecapData(year?: number): Promise<YearRecapData> {
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
}

export type LibraryData =
  | { ok: true; songs: LibrarySong[]; loadedAt: number }
  | { ok: false };

/**
 * Songs added in the Service Planner's catalog - new songs that may not have
 * been sung yet. Empty (never an error) when the planner cannot be read.
 */
async function catalogSongs(): Promise<CatalogSong[]> {
  if (!plannerConfigured()) return [];
  try {
    return await listCatalogSongs(scheduleEnv());
  } catch (error) {
    console.error("[song-archive] Could not read the catalog:", error instanceof Error ? error.message : "unknown error");
    return [];
  }
}

/**
 * The Library, /library: every song that has a page - sung in a past
 * service, scheduled in an upcoming published one, or added to the catalog
 * in the Service Planner.
 */
export async function getLibraryData(): Promise<LibraryData> {
  const [history, schedule, index, catalog] = await Promise.all([
    loadPast(),
    getSchedule(),
    getSheetMusicIndex(),
    catalogSongs(),
  ]);
  if (!history) return { ok: false };
  const { past, loadedAt } = history;

  const upcoming = [
    ...(schedule.ok
      ? datedServices(schedule.months)
          .filter((service) => Date.parse(service.startsAt) > loadedAt)
          .flatMap((service) => service.songs)
      : []),
    ...catalog.map((song) => ({ title: song.title, number: song.number })),
  ];

  // Marked only when the song's page would offer a file to anyone.
  const hasSheetMusic = (song: { title: string; number: string | null }) => {
    if (!index.ok) return false;
    const indexSong = matchIndexSong(index.index, song, siteConfig.sheetMusic.hymnalCollection);
    return indexSong ? publicSheetMusic(songSlug(song.title), indexSong, PUBLIC_VIEWER).available : false;
  };

  return {
    ok: true,
    songs: buildLibrary(buildSongRecords(past), upcoming, hasSheetMusic),
    loadedAt,
  };
}

/** One time a song was (or will be) sung. */
export interface SongPlay {
  startsAt: string;
  slot: ServiceSlot;
  key: string | null;
}

export interface SongPageData {
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
  /** Services it is scheduled for, soonest first. */
  upcoming: Array<SongPlay & { title: string; number: string | null }>;
  title: string;
  number: string | null;
  loadedAt: number;
}

/**
 * The song at /library/songs/[slug]: sung in the archive, scheduled in a
 * published service, or added to the planner's catalog. null when the
 * address matches no song at all.
 */
async function findSong(slug: string): Promise<FoundSong | null> {
  const [history, schedule, catalog] = await Promise.all([loadPast(), getSchedule(), catalogSongs()]);
  const loadedAt = history?.loadedAt ?? Date.now();

  const record = history
    ? buildSongRecords(history.past).find((candidate) => songSlug(candidate.title) === slug)
    : undefined;

  const upcoming: FoundSong["upcoming"] = [];
  if (schedule.ok) {
    for (const service of schedule.published) {
      if (Date.parse(service.startsAt) <= loadedAt) continue;
      for (const song of service.songs) {
        if (songSlug(song.title) !== slug) continue;
        upcoming.push({
          startsAt: service.startsAt,
          slot: service.slot,
          key: song.key,
          title: song.title,
          number: song.number,
        });
      }
    }
  }
  upcoming.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  const listed = catalog.find((song) => songSlug(song.title) === slug);
  if (!record && upcoming.length === 0 && !listed) return null;

  return {
    history,
    record,
    upcoming,
    title: record?.title ?? upcoming[0]?.title ?? listed!.title,
    number: record?.number ?? upcoming.find((play) => play.number)?.number ?? listed?.number ?? null,
    loadedAt,
  };
}

/** The browser-safe sheet music for a song page; links point at the file route. */
function publicSheetMusic(slug: string, song: IndexSong, viewer: Viewer): PublicSheetMusic {
  return toPublicSheetMusic(
    song,
    (file) => canAccessFile(song, file, viewer),
    (file) => `${songPath(slug)}/sheet-music/${file.slug}`,
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
          { title: found.title, number: found.number },
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
export async function getSongPage(slug: string): Promise<SongPageData | null> {
  const [found, index] = await Promise.all([findSong(slug), getSheetMusicIndex()]);
  if (!found) return null;
  const { history, record, upcoming, title, number, loadedAt } = found;

  const indexSong = index.ok
    ? matchIndexSong(index.index, { title, number }, siteConfig.sheetMusic.hymnalCollection)
    : null;

  return {
    title,
    number,
    sheetMusic: indexSong ? publicSheetMusic(slug, indexSong, PUBLIC_VIEWER) : null,
    plays: [...(record?.plays ?? [])].reverse(),
    upcoming: upcoming.map(({ startsAt, slot, key }) => ({ startsAt, slot, key })),
    companions:
      history && record
        ? buildCompanions(history.past, record.id, siteConfig.songList.pairings)
        : [],
    stats: buildSongStats(
      history?.past ?? [],
      record?.id ?? songKey(title),
      upcoming.map((play) => play.startsAt),
      loadedAt,
    ),
    loadedAt,
  };
}

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
      ? schedule.published.filter((service) => Date.parse(service.startsAt) > loadedAt)
      : [],
    persistent: history.persistent,
    loadedAt,
  };
}
