import { churchDay, churchMonth, churchYear, dayOfWeek } from "@/lib/service-time";
import { buildSongRecords } from "@/lib/song-history";
import { normalizeKey, songKey } from "@/lib/song-list";
import type { DatedService } from "@/types/song-list";

/**
 * The figures on one song's page, for /song-list/archive/[song]. Pure
 * functions only: the page passes in every past service and the song's
 * upcoming dates (see getSongPage).
 *
 * The records are young (they begin in October 2025), so every figure here
 * that needs a pattern - a usual gap, a usual place in the service - is left
 * out until there is enough to call it one.
 */

/** How many months the timeline shows at most, ending at the latest month it covers. */
export const TIMELINE_MONTHS = 24;
/** Times sung no more than this many days apart are one stint (see `rhythm`). */
export const STINT_DAYS = 21;
/** A song counts as due once this many usual gaps have passed... */
export const DUE_AFTER = 1.5;
/** ...and as recently sung within this fraction of one. */
export const RECENT_WITHIN = 0.5;
/** A place in the service is a habit when it holds at least this share of the times sung. */
export const HABIT_SHARE = 0.6;

/** Times sung no more than this many days apart are one visit (Sunday to Wednesday is 3, back is 4). */
export const VISIT_DAYS = 4;

export type Role = "opener" | "middle" | "closer";

/**
 * The regular services of a week (siteConfig.songList.regularServices), and
 * "other" for special meetings such as a conference.
 */
export type WeeklyService = "sundayMorning" | "sundayEvening" | "wednesday" | "other";
export const REGULAR_SERVICES = ["sundayMorning", "sundayEvening", "wednesday"] as const;

export function weeklyService(service: Pick<DatedService, "date" | "slot">): WeeklyService {
  const day = dayOfWeek(service.date);
  if (day === 0) return service.slot === "AM" ? "sundayMorning" : "sundayEvening";
  return day === 3 && service.slot === "PM" ? "wednesday" : "other";
}

export interface SongStats {
  /** Times sung, counting a song sung twice in one service twice. */
  count: number;
  /** Services it was sung in. */
  services: number;
  /** Every recorded service, whether or not this song was in it. */
  servicesTotal: number;
  first: string | null;
  last: string | null;
  /**
   * Where it stands among every song by times sung: 1 + the songs sung more.
   * null for a song sung fewer than twice, where a rank means nothing.
   */
  rank: { position: number; of: number; joint: boolean } | null;
  /**
   * Which services of the week it was sung at. Many songs - the inserts
   * especially - are sung at all three services of a week whenever they come
   * round, and `habit` is "all" for those.
   */
  weekly: Record<WeeklyService, number> & {
    /** Times it came round: times sung within VISIT_DAYS of each other count once. */
    visits: number;
    /** Visits that took in every regular service of the week. */
    fullWeeks: number;
    habit: WeeklyService | "all" | null;
  };
  /** Keys it was sung in, most used first. */
  keys: Array<{ key: string; count: number }>;
  /** How often it comes around. null until it has been sung in three separate stints. */
  rhythm: {
    /** The median gap from the start of one stint to the start of the next. */
    medianDays: number;
    longestDays: number;
    sinceDays: number;
    status: "scheduled" | "due" | "recent" | null;
  } | null;
  /**
   * First song, last song or in between. A service with a single song is
   * none of these, so the counts can add up to less than `count`.
   */
  placement: Record<Role, number> & { habit: Role | null };
  /** Month by month, oldest first. */
  timeline: Array<{ year: number; month: number; sung: number; upcoming: number }>;
  /** True when older months were cut to keep the timeline to TIMELINE_MONTHS. */
  timelineClipped: boolean;
}

const monthIndex = (instant: number) => churchYear(instant) * 12 + churchMonth(instant);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Everything the song page shows about song `id`. `past` is every service
 * that has already happened; `upcoming` the start of each scheduled service
 * the song is in.
 */
export function buildSongStats(
  past: DatedService[],
  id: string,
  upcoming: readonly string[],
  now: number,
): SongStats {
  const ordered = [...past].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  const plays: string[] = [];
  const weekly: Record<WeeklyService, number> = { sundayMorning: 0, sundayEvening: 0, wednesday: 0, other: 0 };
  const visits: Array<Set<WeeklyService>> = [];
  let lastDay: number | null = null;
  const placement: Record<Role, number> = { opener: 0, middle: 0, closer: 0 };
  const keys = new Map<string, { key: string; count: number }>();
  let services = 0;

  for (const service of ordered) {
    let found = false;
    service.songs.forEach((song, index) => {
      if (songKey(song.title) !== id) return;
      found = true;
      plays.push(service.startsAt);
      const kind = weeklyService(service);
      weekly[kind] += 1;
      const day = churchDay(Date.parse(service.startsAt));
      if (lastDay === null || day - lastDay > VISIT_DAYS) visits.push(new Set());
      visits[visits.length - 1].add(kind);
      lastDay = day;

      const last = service.songs.length - 1;
      if (last > 0) placement[index === 0 ? "opener" : index === last ? "closer" : "middle"] += 1;

      if (!song.key?.trim()) return;
      const normalized = normalizeKey(song.key);
      const entry = keys.get(normalized) ?? { key: song.key.trim(), count: 0 };
      entry.count += 1;
      keys.set(normalized, entry);
    });
    if (found) services += 1;
  }

  const count = plays.length;

  let rank: SongStats["rank"] = null;
  if (count >= 2) {
    const counts = buildSongRecords(ordered).map((record) => record.plays.length);
    rank = {
      position: 1 + counts.filter((other) => other > count).length,
      of: counts.length,
      joint: counts.filter((other) => other === count).length > 1,
    };
  }

  // The gaps are between DAYS sung, so a morning and evening on one Sunday is not a gap of zero.
  const days = [...new Set(plays.map((play) => churchDay(Date.parse(play))))];
  // Some songs are sung in stints - a psalm three times in one month - and the
  // gaps inside a stint say nothing about how often the song comes round. So
  // the usual gap runs from the start of one stint to the start of the next.
  const stints = days.filter((day, index) => index === 0 || day - days[index - 1] > STINT_DAYS);
  let rhythm: SongStats["rhythm"] = null;
  if (stints.length >= 3) {
    const gaps = days.slice(1).map((day, index) => day - days[index]);
    const medianDays = median(stints.slice(1).map((day, index) => day - stints[index]));
    const sinceDays = churchDay(now) - days[days.length - 1];
    rhythm = {
      medianDays,
      longestDays: Math.max(...gaps),
      sinceDays,
      status:
        upcoming.length > 0
          ? "scheduled"
          : sinceDays > medianDays * DUE_AFTER
            ? "due"
            : sinceDays < medianDays * RECENT_WITHIN
              ? "recent"
              : null,
    };
  }

  const placed = placement.opener + placement.middle + placement.closer;
  const [top] = (Object.entries(placement) as Array<[Role, number]>).sort((a, b) => b[1] - a[1]);
  const habit = count >= 2 && placed > 0 && top[1] / placed >= HABIT_SHARE ? top[0] : null;

  const fullWeeks = visits.filter((visit) => REGULAR_SERVICES.every((kind) => visit.has(kind))).length;
  const [usual] = (Object.entries(weekly) as Array<[WeeklyService, number]>).sort((a, b) => b[1] - a[1]);
  const weeklyHabit =
    fullWeeks > 0 && fullWeeks / visits.length >= HABIT_SHARE
      ? "all"
      : count >= 2 && usual[1] / count >= HABIT_SHARE
        ? usual[0]
        : null;

  // The timeline runs from when records began to this month, or to the last upcoming service.
  const upcomingAt = upcoming.map((at) => Date.parse(at));
  const recordsBegan = ordered.length > 0 ? Date.parse(ordered[0].startsAt) : now;
  const end = Math.max(monthIndex(now), ...upcomingAt.map(monthIndex));
  let start = Math.min(monthIndex(recordsBegan), end);
  const timelineClipped = end - start + 1 > TIMELINE_MONTHS;
  if (timelineClipped) start = end - TIMELINE_MONTHS + 1;

  const timeline: SongStats["timeline"] = [];
  for (let index = start; index <= end; index++) {
    timeline.push({ year: Math.floor(index / 12), month: index % 12, sung: 0, upcoming: 0 });
  }
  for (const play of plays) {
    const cell = timeline[monthIndex(Date.parse(play)) - start];
    if (cell) cell.sung += 1;
  }
  for (const at of upcomingAt) {
    const cell = timeline[monthIndex(at) - start];
    if (cell) cell.upcoming += 1;
  }

  return {
    count,
    services,
    servicesTotal: ordered.length,
    first: plays[0] ?? null,
    last: plays[plays.length - 1] ?? null,
    rank,
    weekly: { ...weekly, visits: visits.length, fullWeeks, habit: weeklyHabit },
    keys: [...keys.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    rhythm,
    placement: { ...placement, habit },
    timeline,
    timelineClipped,
  };
}
