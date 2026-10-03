/**
 * The published schedule, shaped for the song list: calendar months of
 * services. Pure - unit tested; src/lib/schedule.ts feeds it from the
 * database.
 *
 * Only PUBLISHED services ever reach here with songs. A regular service still
 * being planned shows as a placeholder ("Songs not posted yet") so a month
 * never looks shorter than it is - its draft songs are never included.
 */

import { songListContent } from "@/content/song-list";
import { churchDate, monthRange, occurrenceKey, type Occurrence } from "@/lib/availability/occurrences";
import { emptyPositions, slotSongs, type StoredPlan } from "@/lib/service-planner/model";
import { dateLabelFor } from "@/lib/service-time";
import { serviceAnchor } from "@/lib/site-search";
import type { DatedService, Service, SongListMonth } from "@/types/song-list";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-10" -> "October", or "January 2027" when it is not `currentYear`. */
export function monthTitle(month: string, currentYear: number): string {
  const [year, number] = month.split("-").map(Number);
  const name = MONTH_NAMES[number - 1];
  return year === currentYear ? name : `${name} ${year}`;
}

/** A published plan as a song-list service. */
export function planToService(plan: StoredPlan): Service {
  const empty = emptyPositions(plan.slots);
  return {
    id: serviceAnchor(plan.date, plan.slot),
    dateLabel: dateLabelFor(plan.date),
    serviceLabel: plan.label ?? songListContent.serviceMarkerLabels[plan.slot],
    slot: plan.slot,
    date: plan.date,
    startsAt: plan.startsAt,
    songs: slotSongs(plan.slots),
    pendingSongs: empty.length,
    pendingPositions: empty,
  };
}

/** A published plan as history: only when it has songs. */
export function planToDated(plan: StoredPlan): DatedService | null {
  const songs = slotSongs(plan.slots);
  if (songs.length === 0) return null;
  return {
    date: plan.date,
    slot: plan.slot,
    startsAt: plan.startsAt,
    songs,
    ...(plan.label ? { label: plan.label } : {}),
    ...(plan.kind === "special" ? { kind: "special" as const } : {}),
  };
}

/** The months the song list shows: this one, then each later month with a published service. */
export function visibleMonths(published: readonly StoredPlan[], now: number): string[] {
  const thisMonth = churchDate(now).slice(0, 7);
  const later = new Set(published.map((plan) => plan.date.slice(0, 7)).filter((month) => month > thisMonth));
  return [thisMonth, ...[...later].sort()];
}

/**
 * The song list's months.
 *
 * @param published  every published service (any date)
 * @param expected   the services held in the visible months: regular ones,
 *                   with cancelled ones already left out (serviceOccurrences)
 */
export function buildScheduleMonths(input: {
  published: readonly StoredPlan[];
  expected: (range: { from: string; to: string }) => readonly Occurrence[];
  now: number;
}): SongListMonth[] {
  const { published, expected, now } = input;
  const currentYear = Number(churchDate(now).slice(0, 4));

  return visibleMonths(published, now).map((month) => {
    const range = monthRange(month);
    const inMonth = published.filter((plan) => plan.date >= range.from && plan.date <= range.to);
    const publishedKeys = new Set(inMonth.map((plan) => occurrenceKey(plan.date, plan.slot)));

    const placeholders: Service[] = expected(range)
      .filter((occ) => occ.kind === "regular" && Date.parse(occ.startsAt) > now)
      .filter((occ) => !publishedKeys.has(occurrenceKey(occ.date, occ.slot)))
      .map((occ) => ({
        id: serviceAnchor(occ.date, occ.slot),
        dateLabel: dateLabelFor(occ.date),
        serviceLabel: occ.label ?? songListContent.serviceMarkerLabels[occ.slot],
        slot: occ.slot,
        date: occ.date,
        startsAt: occ.startsAt,
        songs: [],
        pendingSongs: 0,
        placeholder: true,
      }));

    const services = [...inMonth.map(planToService), ...placeholders].sort(
      (a, b) => Date.parse(a.startsAt ?? "") - Date.parse(b.startsAt ?? ""),
    );
    const title = monthTitle(month, currentYear);

    return {
      title,
      heading: `${MONTH_NAMES[Number(month.slice(5)) - 1]} Song List`,
      services,
      fallbackRows: null,
    };
  });
}
