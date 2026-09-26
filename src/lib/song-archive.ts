import "server-only";

import { unstable_cache } from "next/cache";

import { loadStoredServices, saveServices, type SaveSummary } from "@/lib/archive-store";
import { getSongList } from "@/lib/google-sheets";
import {
  buildPlayIndex,
  buildSongRecords,
  mergeServices,
  pastServices,
  type PlayIndex,
} from "@/lib/song-history";
import { datedServices, songKey, songSlug } from "@/lib/song-list";
import { availableYears, buildYearRecap, type YearRecap } from "@/lib/year-recap";
import type {
  DatedService,
  ServiceSlot,
  SongListMonth,
  SongListResult,
  SongRecord,
} from "@/types/song-list";

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
  /** Every known service, stored and from the sheet, oldest first. */
  services: DatedService[];
  /** False when the archive database is unavailable and only the sheet was used. */
  persistent: boolean;
}

/**
 * The complete song history: the permanent archive merged with the sheet.
 *
 * The sheet's services are included straight away, so the history is current
 * even before the nightly sync has stored them. If the database is missing or
 * unreachable the sheet alone is used - about a year of history - and the page
 * still works.
 */
export async function getSongHistory(allMonths: SongListMonth[], now: number): Promise<SongHistory> {
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
    services: mergeServices(stored ?? [], datedServices(allMonths), now),
    persistent: stored !== null,
  };
}

export interface ScheduleData {
  result: SongListResult;
  /** When each song on the visible months was sung; null if the sheet failed. */
  plays: PlayIndex | null;
  /** When this data was loaded, for the first paint; the browser keeps its own clock after. */
  loadedAt: number;
}

/**
 * Everything the schedule page needs, in one call.
 *
 * For the hints, only PAST services come from the full history - so a hidden
 * tab being drafted for a future month never reaches the browser, not even as
 * a date. Future services come from the visible months alone.
 */
export async function getScheduleData(): Promise<ScheduleData> {
  const result = await getSongList();
  const loadedAt = Date.now();
  if (!result.ok) return { result, plays: null, loadedAt };

  const history = await getSongHistory(result.allMonths, loadedAt);
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
      /** False when only the sheet could be read (no permanent archive). */
      persistent: boolean;
      loadedAt: number;
    }
  | { ok: false };

/**
 * The song archive: every song sung in a service that has already happened,
 * from the permanent archive and the sheet combined.
 */
export async function getArchiveData(): Promise<ArchiveData> {
  const sheet = await getSongList();
  const loadedAt = Date.now();
  const history = await getSongHistory(sheet.ok ? sheet.allMonths : [], loadedAt);

  // With neither source available there is nothing honest to show.
  if (!sheet.ok && !history.persistent) return { ok: false };

  const past = pastServices(history.services, loadedAt);

  return {
    ok: true,
    records: buildSongRecords(past),
    serviceCount: past.length,
    since: past[0]?.startsAt ?? null,
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
  const sheet = await getSongList();
  const loadedAt = Date.now();
  const history = await getSongHistory(sheet.ok ? sheet.allMonths : [], loadedAt);
  if (!sheet.ok && !history.persistent) return { ok: false };

  const past = pastServices(history.services, loadedAt);
  return {
    ok: true,
    recap: year === undefined ? null : buildYearRecap(past, year, loadedAt),
    years: availableYears(past),
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
  loadedAt: number;
}

/**
 * Everything about one song, for /song-list/archive/[song]: its full history
 * from the archive, plus any upcoming services it is already scheduled for.
 *
 * A song scheduled for the first time has no history yet but still gets a
 * page, so links from the schedule never lead nowhere. Returns null for an
 * address that matches no song at all.
 */
export async function getSongPage(slug: string): Promise<SongPageData | null> {
  const [archive, sheet] = await Promise.all([getArchiveData(), getSongList()]);
  const loadedAt = archive.ok ? archive.loadedAt : Date.now();

  const record = archive.ok
    ? archive.records.find((candidate) => songSlug(candidate.title) === slug)
    : undefined;

  const upcoming: Array<SongPlay & { title: string; number: string | null }> = [];
  if (sheet.ok) {
    for (const service of datedServices(sheet.months)) {
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

  if (!record && upcoming.length === 0) return null;

  return {
    title: record?.title ?? upcoming[0].title,
    number: record?.number ?? upcoming.find((play) => play.number)?.number ?? null,
    plays: [...(record?.plays ?? [])].reverse(),
    upcoming: upcoming.map(({ startsAt, slot, key }) => ({ startsAt, slot, key })),
    loadedAt,
  };
}

/**
 * Copies every service that has already happened from the sheet into the
 * archive. Run nightly by Vercel Cron (see src/app/api/cron/sync-archive).
 */
export async function syncArchive(now: number): Promise<SaveSummary & { sheetServices: number }> {
  const result = await getSongList();
  if (!result.ok) {
    throw new Error(`The spreadsheet could not be read (${result.reason})`);
  }

  const services = pastServices(datedServices(result.allMonths), now);
  const summary = await saveServices(services, now);
  return { ...summary, sheetServices: services.length };
}
