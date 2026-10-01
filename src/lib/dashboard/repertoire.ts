/**
 * What the song history says that is worth acting on from the Dashboard:
 *
 *   brushUpSongs()   - upcoming songs not sung for a long time, or not in
 *                      the records at all, for musicians and song leaders
 *                      to prepare;
 *   quarterGlance()  - a one-line summary of the quarter, for people who
 *                      see analytics.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import {
  FORGOTTEN_DAYS,
  previousQuarter,
  quarterAt,
  quarterLabel,
  quarterOf,
  sameQuarter,
  type Quarter,
} from "@/lib/quarterly-report";
import { buildSongRecords } from "@/lib/song-history";
import { songKey, songSlug } from "@/lib/song-list";
import type { DatedService } from "@/types/song-list";

const DAY_MS = 86_400_000;

/** How far ahead brush-up looks. */
export const BRUSH_UP_DAYS = 14;
/** At most this many brush-up songs. */
export const BRUSH_UP_LIMIT = 6;

export interface BrushUpSong {
  title: string;
  number: string | null;
  slug: string;
  /** Its first service in the coming fortnight. */
  startsAt: string;
  /** When it was last sung, or null when the records never had it. */
  lastSung: string | null;
}

/**
 * Songs in the next BRUSH_UP_DAYS that were last sung more than
 * FORGOTTEN_DAYS ago, or never in the records - most out of practice first.
 */
export function brushUpSongs(
  past: readonly DatedService[],
  upcoming: readonly DatedService[],
  now: number,
): BrushUpSong[] {
  const lastSung = new Map<string, string>();
  for (const record of buildSongRecords([...past])) {
    const last = record.plays[record.plays.length - 1];
    if (last) lastSung.set(record.id, last.startsAt);
  }

  const horizon = now + BRUSH_UP_DAYS * DAY_MS;
  const seen = new Set<string>();
  const songs: BrushUpSong[] = [];
  for (const service of [...upcoming].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
    const at = Date.parse(service.startsAt);
    if (at <= now || at > horizon) continue;
    for (const song of service.songs) {
      const key = songKey(song.title);
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      const last = lastSung.get(key) ?? null;
      if (last && now - Date.parse(last) < FORGOTTEN_DAYS * DAY_MS) continue;
      songs.push({
        title: song.title,
        number: song.number,
        slug: songSlug(song.title),
        startsAt: service.startsAt,
        lastSung: last,
      });
    }
  }

  // Never recorded first, then the longest since last sung.
  const lastAt = (song: BrushUpSong) => (song.lastSung === null ? 0 : Date.parse(song.lastSung));
  return songs.sort((a, b) => lastAt(a) - lastAt(b)).slice(0, BRUSH_UP_LIMIT);
}

export interface QuarterGlance {
  quarter: Quarter;
  label: string;
  /** True for the quarter in progress, false for the one just ended. */
  current: boolean;
  services: number;
  differentSongs: number;
  mostSung: { title: string; slug: string; count: number } | null;
}

/**
 * The quarter in progress so far - or, before its first service, the quarter
 * just ended, so the line never reads "0 services". null without any record.
 */
export function quarterGlance(past: readonly DatedService[], now: number): QuarterGlance | null {
  const happened = past.filter((service) => Date.parse(service.startsAt) <= now);
  const thisQuarter = quarterAt(now);
  const inQuarter = (quarter: Quarter) => happened.filter((service) => sameQuarter(quarterOf(service.date), quarter));

  let quarter = thisQuarter;
  let services = inQuarter(quarter);
  if (services.length === 0) {
    quarter = previousQuarter(thisQuarter);
    services = inQuarter(quarter);
  }
  if (services.length === 0) return null;

  const records = buildSongRecords(services);
  const top = [...records].sort((a, b) => b.plays.length - a.plays.length || a.title.localeCompare(b.title))[0];

  return {
    quarter,
    label: quarterLabel(quarter),
    current: sameQuarter(quarter, thisQuarter),
    services: services.length,
    differentSongs: records.length,
    mostSung: top && top.plays.length > 1 ? { title: top.title, slug: songSlug(top.title), count: top.plays.length } : null,
  };
}
