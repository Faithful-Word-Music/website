import { churchYear } from "@/lib/service-time";
import { matchesSong, normalizeKey, type SongFilter } from "@/lib/song-list";
import type { SongRecord } from "@/types/song-list";

/**
 * Turning song records into the archive table: counting within a period,
 * filtering and sorting. Pure functions; the archive page runs them in the
 * browser so every control responds instantly.
 */

export type ArchiveRange = "all" | "year" | "twelveMonths";
/** The named choices in the Sort menu; each maps to a column and direction. */
export type ArchiveSort = "mostSung" | "recent" | "longestAgo" | "title" | "number";

export interface SongSummary {
  id: string;
  title: string;
  number: string | null;
  /** Times sung within the period. */
  count: number;
  /** Most recent time sung within the period. */
  last: string;
  /** Keys it was sung in within the period, most used first. */
  keys: Array<{ key: string; count: number }>;
}

function inRange(startsAt: string, range: ArchiveRange, now: number): boolean {
  const at = Date.parse(startsAt);
  if (range === "year") return churchYear(at) === churchYear(now);
  if (range === "twelveMonths") return at > now - 365 * 86_400_000;
  return true;
}

/** One summary per song sung at least once in the period. */
export function summarize(records: SongRecord[], range: ArchiveRange, now: number): SongSummary[] {
  const summaries: SongSummary[] = [];

  for (const record of records) {
    const plays = record.plays.filter((play) => inRange(play.startsAt, range, now));
    if (plays.length === 0) continue;

    const keys = new Map<string, { key: string; count: number }>();
    let last = plays[0].startsAt;
    for (const play of plays) {
      if (Date.parse(play.startsAt) > Date.parse(last)) last = play.startsAt;
      if (!play.key) continue;
      const normalized = normalizeKey(play.key);
      const entry = keys.get(normalized) ?? { key: play.key.trim(), count: 0 };
      entry.count += 1;
      keys.set(normalized, entry);
    }

    summaries.push({
      id: record.id,
      title: record.title,
      number: record.number,
      count: plays.length,
      last,
      keys: [...keys.values()].sort((a, b) => b.count - a.count),
    });
  }

  return summaries;
}

export function filterSummaries(summaries: SongSummary[], filter: SongFilter): SongSummary[] {
  if (filter.query.trim() === "" && filter.key.trim() === "") return summaries;
  return summaries.filter((summary) =>
    matchesSong(
      { title: summary.title, number: summary.number, keys: summary.keys.map((entry) => entry.key) },
      filter,
    ),
  );
}

/** A table column the archive can be sorted by, and in which direction. */
export type SortColumn = "number" | "title" | "count" | "last";
export type SortDirection = "asc" | "desc";
export interface ArchiveSortState {
  column: SortColumn;
  direction: SortDirection;
}

/** Newest first: the question the archive is usually asked is "what have we sung lately?" */
export const DEFAULT_SORT: ArchiveSortState = { column: "last", direction: "desc" };

/**
 * The direction a column starts in when first clicked - the one people expect:
 * counts and dates biggest/newest first, titles A-Z, hymn numbers from 1.
 */
export const FIRST_DIRECTION: Record<SortColumn, SortDirection> = {
  number: "asc",
  title: "asc",
  count: "desc",
  last: "desc",
};

/** Named orders, for code that needs a fixed one (the search suggests the most sung first). */
export const SORT_PRESETS: Record<ArchiveSort, ArchiveSortState> = {
  recent: { column: "last", direction: "desc" },
  longestAgo: { column: "last", direction: "asc" },
  mostSung: { column: "count", direction: "desc" },
  title: { column: "title", direction: "asc" },
  number: { column: "number", direction: "asc" },
};

const byTitle = (a: SongSummary, b: SongSummary) =>
  a.title.localeCompare(b.title, "en", { sensitivity: "base", numeric: true });

/** Songs without a hymnal number have no position to sort by, so they come last either way. */
function compareNumbers(a: SongSummary, b: SongSummary, sign: number): number {
  const x = a.number ? Number.parseInt(a.number, 10) : NaN;
  const y = b.number ? Number.parseInt(b.number, 10) : NaN;
  const xMissing = Number.isNaN(x);
  const yMissing = Number.isNaN(y);
  if (xMissing || yMissing) return xMissing === yMissing ? 0 : xMissing ? 1 : -1;
  return (x - y) * sign;
}

export function sortSummaries(summaries: SongSummary[], sort: ArchiveSortState): SongSummary[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  const lastOf = (summary: SongSummary) => Date.parse(summary.last);

  const compare = (a: SongSummary, b: SongSummary): number => {
    switch (sort.column) {
      case "number":
        return compareNumbers(a, b, sign) || byTitle(a, b);
      case "title":
        return byTitle(a, b) * sign;
      case "count":
        // Ties go to the more recently sung, whichever way the count runs.
        return (a.count - b.count) * sign || lastOf(b) - lastOf(a) || byTitle(a, b);
      case "last":
        return (lastOf(a) - lastOf(b)) * sign || byTitle(a, b);
    }
  };

  return [...summaries].sort(compare);
}
