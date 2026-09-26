import { SORT_PRESETS, sortSummaries, summarize } from "@/lib/archive-view";
import { churchMonth, churchYear } from "@/lib/service-time";
import { buildSongRecords } from "@/lib/song-history";
import { normalizeKey, songKey } from "@/lib/song-list";
import type { DatedService, ServiceSlot } from "@/types/song-list";

/**
 * A year of singing at a glance, for /song-list/year/[year]. Pure functions
 * only: the page passes in every past service (see getYearRecapData) and the
 * year to sum up.
 *
 * A service's year and month are read from its date as the sheet gives it,
 * which is already on the church's calendar.
 */

/** How many songs the "most sung" board shows. */
export const TOP_SONGS = 10;
/** How many keys get their own bar; the rest are counted together. */
export const TOP_KEYS = 8;
/** How many of the songs sung only once are named on the page; the rest open in a list. */
export const ONCE_EXAMPLES = 6;

export interface RecapSong {
  id: string;
  title: string;
  number: string | null;
}

export interface YearRecap {
  year: number;
  /**
   * Why the year is not a whole one: still under way, or the records began
   * partway through it (they start in October 2025). null for a full year.
   */
  partial: "in-progress" | "records-began" | null;
  /** The first and latest service counted. */
  from: string;
  to: string;
  services: number;
  /** Every song sung, counting repeats. */
  songsSung: number;
  differentSongs: number;
  /** Different hymnal numbers sung. */
  differentHymns: number;
  /** Most sung first; ties go to the more recently sung. */
  topSongs: Array<RecapSong & { count: number; key: string | null }>;
  /** Most used first. The last entry may be "other" keys counted together. */
  keys: Array<{ key: string; count: number; other?: true }>;
  /** Songs sung in each month, January first. null before records began or after today. */
  months: Array<number | null>;
  /** The month or months (0-11, tied) with the most songs sung; empty for an empty year. */
  busiestMonths: number[];
  /** The song sung most in each kind of service. */
  favourites: Record<ServiceSlot, (RecapSong & { count: number }) | null>;
  /** Every song sung exactly once, most recent first, with when it was sung. */
  once: Array<RecapSong & { startsAt: string }>;
  /**
   * The song whose return this year followed the longest gap - measured
   * across the whole history, so a song last sung the year before counts.
   */
  longestWait: (RecapSong & { days: number; before: string; after: string }) | null;
  /** The first song sung this year. */
  firstSong: (RecapSong & { startsAt: string }) | null;
}

const yearOf = (service: DatedService) => Number(service.date.slice(0, 4));
const monthOf = (service: DatedService) => Number(service.date.slice(5, 7)) - 1;

/** Every year with at least one service, oldest first. */
export function availableYears(services: DatedService[]): number[] {
  return [...new Set(services.map(yearOf))].sort((a, b) => a - b);
}

/** The most sung song in these services; ties go to the latest sung. */
function favourite(services: DatedService[]): (RecapSong & { count: number }) | null {
  const [top] = sortSummaries(summarize(buildSongRecords(services), "all", 0), SORT_PRESETS.mostSung);
  return top ? { id: top.id, title: top.title, number: top.number, count: top.count } : null;
}

/**
 * The year's recap, or null if no service in that year is known.
 * `history` is every past service, from any year, oldest first or not.
 */
export function buildYearRecap(history: DatedService[], year: number, now: number): YearRecap | null {
  const all = [...history].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const services = all.filter((service) => yearOf(service) === year);
  if (services.length === 0) return null;

  const records = buildSongRecords(services);
  const summaries = sortSummaries(summarize(records, "all", now), SORT_PRESETS.mostSung);

  // Songs per month. Months before the records began, or not yet reached, have no figure.
  const firstEver = all[0];
  const recordsBeganThisYear = yearOf(firstEver) === year && monthOf(firstEver) > 0;
  const currentYear = churchYear(now);
  const currentMonth = churchMonth(now);
  const months: Array<number | null> = Array.from({ length: 12 }, (_, month) => {
    if (recordsBeganThisYear && month < monthOf(firstEver)) return null;
    if (year === currentYear && month > currentMonth) return null;
    return 0;
  });
  for (const service of services) {
    months[monthOf(service)] = (months[monthOf(service)] ?? 0) + service.songs.length;
  }
  const most = Math.max(0, ...months.map((count) => count ?? 0));
  const busiestMonths = most > 0 ? months.flatMap((count, month) => (count === most ? [month] : [])) : [];

  // Keys, grouped the way the key search matches them ("Ab" and "A♭" together).
  const keyCounts = new Map<string, { key: string; count: number }>();
  for (const service of services) {
    for (const song of service.songs) {
      if (!song.key?.trim()) continue;
      const id = normalizeKey(song.key);
      const entry = keyCounts.get(id) ?? { key: song.key.trim(), count: 0 };
      entry.count += 1;
      keyCounts.set(id, entry);
    }
  }
  const byUse = [...keyCounts.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const keys: YearRecap["keys"] = byUse.slice(0, TOP_KEYS);
  // Only fold the rest together when that saves more than one row.
  if (byUse.length > TOP_KEYS + 1) {
    const rest = byUse.slice(TOP_KEYS).reduce((sum, entry) => sum + entry.count, 0);
    keys.push({ key: `${byUse.length - TOP_KEYS} others`, count: rest, other: true });
  } else {
    keys.push(...byUse.slice(TOP_KEYS));
  }

  // The longest gap before a song came back, looking back into earlier years too.
  let longestWait: YearRecap["longestWait"] = null;
  const lastSung = new Map<string, number>();
  for (const service of all) {
    const at = Date.parse(service.startsAt);
    for (const song of service.songs) {
      const id = songKey(song.title);
      if (id === "") continue;
      const before = lastSung.get(id);
      if (before !== undefined && yearOf(service) === year) {
        const days = Math.round((at - before) / 86_400_000);
        if (!longestWait || days > longestWait.days) {
          longestWait = {
            id,
            title: song.title,
            number: song.number,
            days,
            before: new Date(before).toISOString(),
            after: service.startsAt,
          };
        }
      }
      lastSung.set(id, at);
    }
  }

  const once = summaries.filter((summary) => summary.count === 1);
  const opening = services.find((service) => service.songs.length > 0);
  const firstSong = opening?.songs[0];

  return {
    year,
    partial: year >= currentYear ? "in-progress" : recordsBeganThisYear ? "records-began" : null,
    from: services[0].startsAt,
    to: services[services.length - 1].startsAt,
    services: services.length,
    songsSung: services.reduce((sum, service) => sum + service.songs.length, 0),
    differentSongs: summaries.length,
    differentHymns: new Set(summaries.flatMap((summary) => summary.number ?? [])).size,
    topSongs: summaries.slice(0, TOP_SONGS).map((summary) => ({
      id: summary.id,
      title: summary.title,
      number: summary.number,
      count: summary.count,
      key: summary.keys[0]?.key ?? null,
    })),
    keys,
    months,
    busiestMonths,
    favourites: {
      AM: favourite(services.filter((service) => service.slot === "AM")),
      PM: favourite(services.filter((service) => service.slot === "PM")),
    },
    once: [...once]
      .sort((a, b) => Date.parse(b.last) - Date.parse(a.last))
      .map(({ id, title, number, last }) => ({ id, title, number, startsAt: last })),
    longestWait,
    firstSong:
      opening && firstSong
        ? {
            id: songKey(firstSong.title),
            title: firstSong.title,
            number: firstSong.number,
            startsAt: opening.startsAt,
          }
        : null,
  };
}
