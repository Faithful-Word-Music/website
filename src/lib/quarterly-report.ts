import { siteConfig } from "@/config/site";
import { christmasSeason, christmasSongs, inChristmasSeason, thanksgiving } from "@/lib/church-calendar";
import { churchDay, churchMonth, churchYear } from "@/lib/service-time";
import { buildSongRecords } from "@/lib/song-history";
import { normalizeKey, songKey } from "@/lib/song-list";
import { buildSongStats, VISIT_DAYS, weeklyService } from "@/lib/song-stats";
import type { DatedService, SongRecord } from "@/types/song-list";

/**
 * The music director's quarterly report, emailed on the first day of each
 * quarter (see src/app/api/cron/quarterly-report). Pure functions only: the
 * route passes in every past service, the upcoming ones and the time.
 *
 * It covers the quarter that has just ended, and looks ahead to the one just
 * starting. Every section that needs history it does not have yet - the
 * records begin in October 2025 - is left empty or null rather than guessed.
 */

/** How many songs the "most sung" list shows. */
export const TOP_SONGS = 10;
/** The most any other list names. */
export const LIST_LIMIT = 8;
/** Came round this many times in one quarter (about every three weeks): possibly overused. */
export const OVERUSED_VISITS = 4;
/** Sung at least this many times ever, to count as a favourite that can be forgotten... */
export const FAVOURITE_MIN = 4;
/** ...once it has not been sung for this many days. */
export const FORGOTTEN_DAYS = 180;
/** A scheduled song sung again within this many days is flagged (same-week runs aside). */
export const RECENT_REPEAT_DAYS = 28;
/** How many keys the key summary names. */
export const TOP_KEYS = 6;
/** How many openers and closers are named. */
export const TOP_PLACES = 5;
/** The variety chart shows at most this many quarters, ending with the one reported. */
export const TREND_QUARTERS = 5;
/** New songs are only named once the records reach back this far before the quarter. */
export const NEW_SONG_HISTORY_DAYS = 365;
/** A quarter's records count as complete if they begin within this many days of its start. */
const COVERAGE_GRACE_DAYS = 7;

const DAY_MS = 86_400_000;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---------------------------------------------------------------------------
// Quarters
// ---------------------------------------------------------------------------

/** A calendar quarter; `index` 0 is January to March. */
export interface Quarter {
  year: number;
  index: number;
}

/** The quarter a "YYYY-MM-DD" date falls in. */
export function quarterOf(date: string): Quarter {
  return { year: Number(date.slice(0, 4)), index: Math.floor((Number(date.slice(5, 7)) - 1) / 3) };
}

/** The quarter an instant falls in, on the church's calendar. */
export function quarterAt(instant: number): Quarter {
  return { year: churchYear(instant), index: Math.floor(churchMonth(instant) / 3) };
}

export function previousQuarter({ year, index }: Quarter): Quarter {
  return index === 0 ? { year: year - 1, index: 3 } : { year, index: index - 1 };
}

export function sameQuarter(a: Quarter, b: Quarter): boolean {
  return a.year === b.year && a.index === b.index;
}

/** "2026-Q3" - also the key that stops a quarter's report being sent twice. */
export function quarterId({ year, index }: Quarter): string {
  return `${year}-Q${index + 1}`;
}

/** "Jul–Sep 2026" */
export function quarterLabel({ year, index }: Quarter): string {
  return `${MONTH_NAMES[index * 3]}–${MONTH_NAMES[index * 3 + 2]} ${year}`;
}

/** First and last day, "YYYY-MM-DD". */
export function quarterBounds({ year, index }: Quarter): { from: string; to: string } {
  const lastDay = new Date(Date.UTC(year, index * 3 + 3, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    from: `${year}-${pad(index * 3 + 1)}-01`,
    to: `${year}-${pad(index * 3 + 3)}-${pad(lastDay)}`,
  };
}

/** The quarter a report sent at `now` covers: the one that has just ended. */
export function reportQuarter(now: number): Quarter {
  return previousQuarter(quarterAt(now));
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface ReportSong {
  id: string;
  /** Title as most recently written. */
  title: string;
  number: string | null;
}

export interface QuarterTotals {
  services: number;
  /** Every song sung, counting repeats. */
  songsSung: number;
  differentSongs: number;
  /** Share of the songs sung that came from the hymnal (had a number), 0-1. */
  hymnShare: number;
  /** Share of the songs sung taken up by the ten most sung, 0-1. Lower is more varied. */
  topTenShare: number;
}

export interface QuarterlyReport {
  quarter: Quarter;
  id: string;
  label: string;
  from: string;
  to: string;
  /** Date of the first recorded service, or null for no records at all. */
  recordsBegan: string | null;

  totals: QuarterTotals;
  /** The quarter before, and the same quarter a year earlier; null without complete records. */
  previous: QuarterTotals | null;
  lastYear: QuarterTotals | null;
  /**
   * This quarter and those before it, oldest first, back to TREND_QUARTERS or
   * the first quarter the records fully cover.
   */
  trend: Array<{ quarter: Quarter; label: string; totals: QuarterTotals; current: boolean }>;
  /** Different songs sung in the twelve months up to the end of the quarter. */
  activeRepertoire: number;

  topSongs: Array<ReportSong & { count: number; allTime: number }>;
  /**
   * Came round OVERUSED_VISITS times or more this quarter. `usual` is its
   * average per quarter before this one, null when there is no earlier quarter.
   */
  overused: Array<ReportSong & { visits: number; usual: number | null }>;
  /** Past its usual gap by half again or more, and not scheduled. Most overdue first. */
  due: Array<ReportSong & { sinceDays: number; usualDays: number }>;
  /** Sung FAVOURITE_MIN+ times but not for FORGOTTEN_DAYS, and not scheduled. */
  forgotten: Array<ReportSong & { count: number; last: string }>;
  /**
   * Songs sung for the first time in the records this quarter. null until the
   * records reach NEW_SONG_HISTORY_DAYS before the quarter: with less, a hymn
   * simply not sung for a while would look new.
   */
  newSongs: Array<ReportSong & { first: string; count: number; visits: number; scheduled: boolean }> | null;

  /** Keys used this quarter, most used first; `share` 0-1. */
  keys: Array<{ key: string; count: number; share: number }>;
  /** Songs sung with no key written. */
  keyless: number;
  openers: Array<ReportSong & { count: number }>;
  closers: Array<ReportSong & { count: number }>;
  /** Pairs sung together this quarter that are a habit over the whole history. */
  pairs: Array<{ a: ReportSong; b: ReportSong; together: number }>;

  lookahead: {
    quarter: Quarter;
    label: string;
    /** The same quarter a year ago; null when nothing is recorded for it. */
    lastYear: {
      topSongs: Array<ReportSong & { count: number }>;
      /** Sung then and not since: candidates to bring back for the season. */
      seasonal: Array<ReportSong & { count: number; last: string }>;
      /** Services outside the regular week (conferences, holidays), with their songs. */
      specials: Array<{ startsAt: string; songs: string[] }>;
    } | null;
    /**
     * The Christmas season, when the new quarter holds it: its first date and
     * last year's Christmas songs, most sung first. null in other quarters.
     */
    christmas: {
      from: string;
      thanksgiving: string;
      songs: Array<ReportSong & { count: number }>;
    } | null;
    /** Services in the new quarter already posted. */
    scheduledServices: number;
    /** Scheduled songs that were sung only a short while before. */
    repeats: Array<ReportSong & { startsAt: string; previous: string; days: number }>;
    /** Christmas songs scheduled outside the Christmas season. */
    outOfSeason: Array<ReportSong & { startsAt: string }>;
  };
}

/** Times sung no more than VISIT_DAYS apart count as one time round. */
function countVisits(instants: number[]): number {
  let visits = 0;
  let lastDay: number | null = null;
  for (const at of [...instants].sort((a, b) => a - b)) {
    const day = churchDay(at);
    if (lastDay === null || day - lastDay > VISIT_DAYS) visits += 1;
    lastDay = day;
  }
  return visits;
}

function totalsFor(services: DatedService[]): QuarterTotals {
  const records = buildSongRecords(services);
  let songsSung = 0;
  let hymns = 0;
  for (const service of services) {
    for (const song of service.songs) {
      songsSung += 1;
      if (song.number) hymns += 1;
    }
  }
  const topTen = records
    .map((record) => record.plays.length)
    .sort((a, b) => b - a)
    .slice(0, 10)
    .reduce((sum, count) => sum + count, 0);

  return {
    services: services.length,
    songsSung,
    differentSongs: records.length,
    hymnShare: songsSung ? hymns / songsSung : 0,
    topTenShare: songsSung ? topTen / songsSung : 0,
  };
}

/** Most first; ties go to the more recently sung. */
function byCount<T extends { count: number; last: number }>(a: T, b: T): number {
  return b.count - a.count || b.last - a.last;
}

/**
 * Everything in the report sent at `now`. `past` is every service that has
 * already happened; `upcoming` the services already posted that have not.
 */
export function buildQuarterlyReport(
  past: DatedService[],
  upcoming: DatedService[],
  now: number,
): QuarterlyReport {
  const all = past
    .filter((service) => Date.parse(service.startsAt) <= now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const ahead = upcoming
    .filter((service) => Date.parse(service.startsAt) > now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  const quarter = reportQuarter(now);
  const { from, to } = quarterBounds(quarter);
  const recordsBegan = all[0]?.date ?? null;
  const inQuarter = (q: Quarter) => all.filter((service) => sameQuarter(quarterOf(service.date), q));
  const covers = (q: Quarter) =>
    recordsBegan !== null && dayNumber(recordsBegan) <= dayNumber(quarterBounds(q).from) + COVERAGE_GRACE_DAYS;

  const services = inQuarter(quarter);
  const everything = buildSongRecords(all);
  /** Songs only ever sung in the Christmas season (see church-calendar.ts). */
  const christmas = christmasSongs(all);
  const records = new Map(everything.map((record) => [record.id, record]));
  const song = (id: string): ReportSong => {
    const record = records.get(id);
    return { id, title: record?.title ?? id, number: record?.number ?? null };
  };
  const lastOf = (record: SongRecord) => Date.parse(record.plays[record.plays.length - 1].startsAt);

  const scheduled = new Map<string, string[]>();
  for (const service of ahead) {
    for (const entry of service.songs) {
      const id = songKey(entry.title);
      if (id !== "") scheduled.set(id, [...(scheduled.get(id) ?? []), service.startsAt]);
    }
  }

  // --- Totals ---------------------------------------------------------------
  const previousQ = previousQuarter(quarter);
  const lastYearQ = { year: quarter.year - 1, index: quarter.index };
  const yearAgo = dayNumber(to) - 365;
  const activeRepertoire = new Set(
    all
      .filter((service) => dayNumber(service.date) > yearAgo && dayNumber(service.date) <= dayNumber(to))
      .flatMap((service) => service.songs.map((entry) => songKey(entry.title)))
      .filter((id) => id !== ""),
  ).size;

  // --- This quarter's songs -------------------------------------------------
  const quarterRecords = buildSongRecords(services);
  const topSongs = quarterRecords
    .map((record) => ({ ...song(record.id), count: record.plays.length, last: lastOf(record) }))
    .sort(byCount)
    .slice(0, TOP_SONGS)
    .map((entry) => ({ ...entry, allTime: records.get(entry.id)?.plays.length ?? 0 }));

  const quartersBefore = recordsBegan ? (dayNumber(from) - dayNumber(recordsBegan)) / (365.25 / 4) : 0;
  const overused = quarterRecords
    .map((record) => {
      const visits = countVisits(record.plays.map((play) => Date.parse(play.startsAt)));
      const earlier = (records.get(record.id)?.plays ?? [])
        .map((play) => Date.parse(play.startsAt))
        .filter((at) => churchDay(at) < dayNumber(from));
      const usual = quartersBefore >= 1 ? countVisits(earlier) / quartersBefore : null;
      return { ...song(record.id), visits, usual };
    })
    // Christmas songs fill the Christmas season by design; that is not overuse.
    .filter((entry) => entry.visits >= OVERUSED_VISITS && !christmas.has(entry.id))
    .sort((a, b) => b.visits - a.visits || a.title.localeCompare(b.title))
    .slice(0, LIST_LIMIT);

  // --- Songs to bring back --------------------------------------------------
  // Each song's rhythm needs only the services it was in.
  const servicesWith = new Map<string, DatedService[]>();
  for (const service of all) {
    for (const id of new Set(service.songs.map((entry) => songKey(entry.title)))) {
      if (id !== "") servicesWith.set(id, [...(servicesWith.get(id) ?? []), service]);
    }
  }

  // Christmas songs wait for their season, so they are never due or forgotten.
  const due = everything
    .filter((record) => !christmas.has(record.id))
    .flatMap((record) => {
      const { rhythm } = buildSongStats(servicesWith.get(record.id) ?? [], record.id, scheduled.get(record.id) ?? [], now);
      return rhythm?.status === "due"
        ? [{ ...song(record.id), sinceDays: rhythm.sinceDays, usualDays: Math.round(rhythm.medianDays) }]
        : [];
    })
    .sort((a, b) => b.sinceDays / b.usualDays - a.sinceDays / a.usualDays)
    .slice(0, LIST_LIMIT);
  const dueIds = new Set(due.map((entry) => entry.id));

  const forgotten = everything
    .filter(
      (record) =>
        record.plays.length >= FAVOURITE_MIN &&
        churchDay(now) - churchDay(lastOf(record)) >= FORGOTTEN_DAYS &&
        !scheduled.has(record.id) &&
        !dueIds.has(record.id) &&
        !christmas.has(record.id),
    )
    .map((record) => ({ ...song(record.id), count: record.plays.length, last: lastOf(record) }))
    .sort(byCount)
    .slice(0, LIST_LIMIT)
    .map(({ last, ...entry }) => ({ ...entry, last: new Date(last).toISOString() }));

  const newSongs =
    recordsBegan !== null && dayNumber(recordsBegan) <= dayNumber(from) - NEW_SONG_HISTORY_DAYS + COVERAGE_GRACE_DAYS
      ? everything
          .filter((record) => sameQuarter(quarterAt(Date.parse(record.plays[0].startsAt)), quarter))
          .map((record) => {
            const inQ = quarterRecords.find((entry) => entry.id === record.id)!;
            return {
              ...song(record.id),
              first: record.plays[0].startsAt,
              count: inQ.plays.length,
              visits: countVisits(inQ.plays.map((play) => Date.parse(play.startsAt))),
              scheduled: scheduled.has(record.id),
            };
          })
          .sort((a, b) => Date.parse(a.first) - Date.parse(b.first))
      : null;

  // --- Keys and places ------------------------------------------------------
  const keyCounts = new Map<string, { key: string; count: number }>();
  let keyless = 0;
  let keyed = 0;
  const openers = new Map<string, number>();
  const closers = new Map<string, number>();
  for (const service of services) {
    service.songs.forEach((entry, index) => {
      if (entry.key?.trim()) {
        const id = normalizeKey(entry.key);
        const count = keyCounts.get(id) ?? { key: entry.key.trim(), count: 0 };
        count.count += 1;
        keyCounts.set(id, count);
        keyed += 1;
      } else {
        keyless += 1;
      }
      const id = songKey(entry.title);
      const last = service.songs.length - 1;
      if (id === "" || last === 0) return;
      if (index === 0) openers.set(id, (openers.get(id) ?? 0) + 1);
      if (index === last) closers.set(id, (closers.get(id) ?? 0) + 1);
    });
  }
  const keys = [...keyCounts.values()]
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, TOP_KEYS)
    .map((entry) => ({ ...entry, share: entry.count / keyed }));
  const topPlaces = (counts: Map<string, number>) =>
    [...counts]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1] || song(a[0]).title.localeCompare(song(b[0]).title))
      .slice(0, TOP_PLACES)
      .map(([id, count]) => ({ ...song(id), count }));

  // --- Habitual pairs -------------------------------------------------------
  // The same rule as "Often sung with" on the song pages (siteConfig pairings).
  const { minTogether, minShare } = siteConfig.songList.pairings;
  const inServices = new Map<string, number>();
  const together = new Map<string, number>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);
  for (const service of all) {
    const ids = [...new Set(service.songs.map((entry) => songKey(entry.title)))].filter((id) => id !== "");
    for (const id of ids) inServices.set(id, (inServices.get(id) ?? 0) + 1);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = pairKey(ids[i], ids[j]);
        together.set(key, (together.get(key) ?? 0) + 1);
      }
    }
  }
  const pairsThisQuarter = new Set<string>();
  for (const service of services) {
    const ids = [...new Set(service.songs.map((entry) => songKey(entry.title)))].filter((id) => id !== "");
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) pairsThisQuarter.add(pairKey(ids[i], ids[j]));
    }
  }
  const pairs = [...pairsThisQuarter]
    .map((key) => {
      const [a, b] = key.split("\n");
      const count = together.get(key) ?? 0;
      const share = count / ((inServices.get(a) ?? 0) + (inServices.get(b) ?? 0) - count);
      return { a: song(a), b: song(b), together: count, share };
    })
    .filter((pair) => pair.together >= minTogether && pair.share >= minShare)
    .sort((x, y) => y.together - x.together || y.share - x.share)
    .slice(0, TOP_PLACES);

  // --- Looking ahead --------------------------------------------------------
  const next = quarterAt(now);
  const nextLastYear = { year: next.year - 1, index: next.index };
  const then = inQuarter(nextLastYear);
  let lookaheadLastYear: QuarterlyReport["lookahead"]["lastYear"] = null;
  if (then.length > 0) {
    const thenEnd = dayNumber(quarterBounds(nextLastYear).to);
    const thenRecords = buildSongRecords(then);
    lookaheadLastYear = {
      topSongs: thenRecords
        .map((record) => ({ ...song(record.id), count: record.plays.length, last: lastOf(record) }))
        .sort(byCount)
        .slice(0, TOP_SONGS),
      // Christmas songs have their own list (lookahead.christmas).
      seasonal: thenRecords
        .filter((record) => {
          const lastEver = lastOf(records.get(record.id)!);
          return churchDay(lastEver) <= thenEnd && !scheduled.has(record.id) && !christmas.has(record.id);
        })
        .map((record) => ({ ...song(record.id), count: record.plays.length, last: record.plays[record.plays.length - 1].startsAt }))
        // The most sung then, listed in the order they were sung.
        .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
        .slice(0, LIST_LIMIT * 2)
        .sort((a, b) => Date.parse(a.last) - Date.parse(b.last)),
      specials: then
        .filter((service) => weeklyService(service) === "other")
        .map((service) => ({ startsAt: service.startsAt, songs: service.songs.map((entry) => entry.title) })),
    };
  }

  const nextServices = ahead.filter((service) => sameQuarter(quarterOf(service.date), next));
  const repeats: QuarterlyReport["lookahead"]["repeats"] = [];
  const sungAt = new Map<string, number[]>();
  for (const service of [...all, ...ahead]) {
    for (const entry of service.songs) {
      const id = songKey(entry.title);
      if (id !== "") sungAt.set(id, [...(sungAt.get(id) ?? []), Date.parse(service.startsAt)]);
    }
  }
  for (const service of nextServices) {
    const start = Date.parse(service.startsAt);
    for (const entry of service.songs) {
      const id = songKey(entry.title);
      // Carols come round every week or two all season long; that is the season.
      if (christmas.has(id) && inChristmasSeason(service.date)) continue;
      const previous = Math.max(-Infinity, ...(sungAt.get(id) ?? []).filter((at) => at < start));
      if (!Number.isFinite(previous)) continue;
      const days = churchDay(start) - churchDay(previous);
      // Sunday-to-Wednesday runs of the same song are deliberate, not repeats.
      if (days <= VISIT_DAYS || days > RECENT_REPEAT_DAYS) continue;
      repeats.push({ ...song(id), startsAt: service.startsAt, previous: new Date(previous).toISOString(), days });
    }
  }

  // The rule: Christmas songs only from the first service after Thanksgiving.
  const outOfSeason = ahead.flatMap((service) =>
    inChristmasSeason(service.date)
      ? []
      : service.songs
          .map((entry) => songKey(entry.title))
          .filter((id) => christmas.has(id))
          .map((id) => ({ ...song(id), startsAt: service.startsAt })),
  );

  let christmasAhead: QuarterlyReport["lookahead"]["christmas"] = null;
  const season = christmasSeason(next.year);
  if (sameQuarter(quarterOf(season.from), next)) {
    const lastSeason = christmasSeason(next.year - 1);
    const sungThen = all.filter((service) => service.date >= lastSeason.from && service.date <= lastSeason.to);
    christmasAhead = {
      from: season.from,
      thanksgiving: thanksgiving(next.year),
      songs: buildSongRecords(sungThen)
        .filter((record) => christmas.has(record.id))
        .map((record) => ({ ...song(record.id), count: record.plays.length, last: lastOf(record) }))
        .sort(byCount),
    };
  }

  const trend: QuarterlyReport["trend"] = [];
  for (let q = quarter, index = 0; index < TREND_QUARTERS && covers(q); q = previousQuarter(q), index++) {
    trend.unshift({ quarter: q, label: quarterLabel(q), totals: totalsFor(inQuarter(q)), current: index === 0 });
  }

  return {
    quarter,
    id: quarterId(quarter),
    label: quarterLabel(quarter),
    from,
    to,
    recordsBegan,
    totals: totalsFor(services),
    previous: covers(previousQ) ? totalsFor(inQuarter(previousQ)) : null,
    lastYear: covers(lastYearQ) ? totalsFor(inQuarter(lastYearQ)) : null,
    trend,
    activeRepertoire,
    topSongs,
    overused,
    due,
    forgotten,
    newSongs,
    keys,
    keyless,
    openers: topPlaces(openers),
    closers: topPlaces(closers),
    pairs,
    lookahead: {
      quarter: next,
      label: quarterLabel(next),
      lastYear: lookaheadLastYear,
      christmas: christmasAhead,
      scheduledServices: nextServices.length,
      repeats: repeats.slice(0, LIST_LIMIT * 2),
      outOfSeason,
    },
  };
}
