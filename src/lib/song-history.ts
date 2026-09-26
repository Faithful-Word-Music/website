import { churchYear } from "@/lib/service-time";
import { songKey } from "@/lib/song-list";
import type { DatedService, SongRecord } from "@/types/song-list";

/**
 * Song history: which songs were sung when. Pure functions only.
 *
 * ---------------------------------------------------------------------------
 * WHERE HISTORY COMES FROM
 * ---------------------------------------------------------------------------
 * The spreadsheet keeps a rolling twelve months - each month's tab is reused
 * the following year. So the permanent record is the archive database, topped
 * up from the sheet (see src/lib/archive-sync.ts). The two are combined here
 * with one rule, used identically when saving and when reading:
 *
 *   A service is FRESH for 30 days after it takes place. While fresh, the
 *   sheet's version wins, so corrections made after the fact are picked up.
 *   After that the stored version is FROZEN: the sheet can no longer change
 *   it. That protects last year's October from being overwritten while
 *   someone rewrites the October tab for this year.
 */

export const FRESH_DAYS = 30;

/** Services are the same service if they share a date and a slot. */
export function serviceId(service: Pick<DatedService, "date" | "slot">): string {
  return `${service.date}|${service.slot}`;
}

/** Whether the sheet may still overwrite this service's stored copy. */
export function isFresh(service: Pick<DatedService, "startsAt">, now: number): boolean {
  return Date.parse(service.startsAt) > now - FRESH_DAYS * 86_400_000;
}

/**
 * Combines stored services with the sheet's, following the freshness rule.
 * The result is sorted oldest first.
 */
export function mergeServices(
  stored: DatedService[],
  fromSheet: DatedService[],
  now: number,
): DatedService[] {
  const merged = new Map<string, DatedService>();
  for (const service of stored) merged.set(serviceId(service), service);

  for (const service of fromSheet) {
    const id = serviceId(service);
    if (!merged.has(id) || isFresh(service, now)) merged.set(id, service);
  }

  return [...merged.values()].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
}

/** Services that have started by `now`. Only these count as "sung". */
export function pastServices(services: DatedService[], now: number): DatedService[] {
  return services.filter((service) => Date.parse(service.startsAt) <= now);
}

/** Groups every song sung across these services into one record per song. */
export function buildSongRecords(services: DatedService[]): SongRecord[] {
  const records = new Map<string, SongRecord>();
  const ordered = [...services].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );

  for (const service of ordered) {
    for (const song of service.songs) {
      const id = songKey(song.title);
      if (id === "") continue;

      const record = records.get(id) ?? { id, title: song.title, number: null, plays: [] };
      // Walking oldest to newest, so the latest spelling and number win.
      record.title = song.title;
      if (song.number) record.number = song.number;
      record.plays.push({ startsAt: service.startsAt, slot: service.slot, key: song.key });
      records.set(id, record);
    }
  }

  return [...records.values()];
}

/** A song that is habitually sung in the same service as another. */
export interface Companion {
  id: string;
  /** Title as most recently written. */
  title: string;
  number: string | null;
  /** Services where both songs were sung. */
  together: number;
  /** together ÷ services where either was sung, 0-1. */
  share: number;
  /** Start of the most recent service they shared. */
  lastTogether: string;
}

export interface CompanionRules {
  minTogether: number;
  minShare: number;
  limit: number;
}

/**
 * The songs habitually sung alongside song `id`.
 *
 * Most songs are paired differently every time, and for those this returns
 * nothing. A pair only counts when it is a real habit: sung together at least
 * `minTogether` times, AND together in at least `minShare` of the services
 * where either song was sung. The second rule keeps out songs that are simply
 * sung often - a hymn in every other service shares a few services with
 * everything, but that says nothing about this song.
 */
export function buildCompanions(
  services: DatedService[],
  id: string,
  rules: CompanionRules,
): Companion[] {
  const ordered = [...services].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );

  const plays = new Map<string, number>();
  const details = new Map<string, { title: string; number: string | null }>();
  const shared = new Map<string, { together: number; lastTogether: string }>();

  for (const service of ordered) {
    const ids = new Set<string>();
    for (const song of service.songs) {
      const songId = songKey(song.title);
      if (songId === "") continue;
      ids.add(songId);
      // Walking oldest to newest, so the latest spelling and number win.
      const detail = details.get(songId) ?? { title: song.title, number: null };
      detail.title = song.title;
      if (song.number) detail.number = song.number;
      details.set(songId, detail);
    }

    for (const songId of ids) plays.set(songId, (plays.get(songId) ?? 0) + 1);

    if (!ids.has(id)) continue;
    for (const other of ids) {
      if (other === id) continue;
      const entry = shared.get(other) ?? { together: 0, lastTogether: service.startsAt };
      entry.together += 1;
      entry.lastTogether = service.startsAt;
      shared.set(other, entry);
    }
  }

  const ownPlays = plays.get(id) ?? 0;
  const companions: Companion[] = [];

  for (const [other, { together, lastTogether }] of shared) {
    const share = together / (ownPlays + (plays.get(other) ?? 0) - together);
    if (together < rules.minTogether || share < rules.minShare) continue;
    const detail = details.get(other)!;
    companions.push({ id: other, ...detail, together, share, lastTogether });
  }

  return companions
    .sort(
      (a, b) =>
        b.share - a.share ||
        b.together - a.together ||
        Date.parse(b.lastTogether) - Date.parse(a.lastTogether),
    )
    .slice(0, rules.limit);
}

/**
 * The dates each song was sung, keyed by songKey(). This is what the schedule
 * page hands to the browser for the hints - small, and enough to compute every
 * hint against the live clock.
 */
export type PlayIndex = Record<string, string[]>;

export function buildPlayIndex(services: DatedService[], onlyIds?: Set<string>): PlayIndex {
  const index: PlayIndex = {};
  for (const service of services) {
    for (const song of service.songs) {
      const id = songKey(song.title);
      if (id === "" || (onlyIds && !onlyIds.has(id))) continue;
      (index[id] ??= []).push(service.startsAt);
    }
  }
  for (const plays of Object.values(index)) {
    plays.sort((a, b) => Date.parse(a) - Date.parse(b));
  }
  return index;
}

export type SongHint =
  | { kind: "first-ever" }
  | { kind: "first-this-year" }
  /** The previous time it was sung, which has already happened. */
  | { kind: "last-sung"; at: string }
  /** The previous time it is scheduled is itself still to come. */
  | { kind: "also-on"; at: string };

/**
 * What to say under a song scheduled at `serviceStartsAt`, looking back from
 * THAT service rather than from today:
 *
 *   never sung before it                  -> "First time ever"
 *   not sung earlier in that same year    -> "First time this year"
 *   previously sung, already happened     -> "Last sung 3 weeks ago"
 *   previously scheduled, still to come   -> "Also on Sun, Sep 27"
 */
export function songHint(
  plays: readonly string[] | undefined,
  serviceStartsAt: string,
  now: number,
): SongHint {
  const start = Date.parse(serviceStartsAt);
  let previous: number | null = null;

  for (const play of plays ?? []) {
    const at = Date.parse(play);
    if (at < start && (previous === null || at > previous)) previous = at;
  }

  if (previous === null) return { kind: "first-ever" };
  if (churchYear(previous) !== churchYear(start)) return { kind: "first-this-year" };

  const at = new Date(previous).toISOString();
  return previous <= now ? { kind: "last-sung", at } : { kind: "also-on", at };
}
