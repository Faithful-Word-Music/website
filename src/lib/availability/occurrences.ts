/**
 * The services availability is about: which services happen when, and which
 * of someone's normal services each one is.
 *
 * A service is identified by its date and AM/PM - the same identity the song
 * archive uses (services UNIQUE(service_date, slot)) and the same "date|slot"
 * key - never by a song-list row id, which is only for rendering.
 *
 *   regular   the services held every week (siteConfig.songList.regularServices),
 *             generated for any date range - they exist whether or not the
 *             song list has reached them yet.
 *   special   a dated service in the song list on a day and time that is not a
 *             regular service (a conference meeting, a holiday service). It is
 *             matched against the "special" normal-availability choice. Nothing
 *             here creates special services; they come from the song list.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import { siteConfig } from "@/config/site";
import type { ServiceAvailability } from "@/lib/auth/profile-options";
import { churchDay, dayOfWeek, startsAtFor } from "@/lib/service-time";
import type { ServiceSlot } from "@/types/song-list";

export type OccurrenceKind = "regular" | "special";

export interface Occurrence {
  /** "2026-10-18" in church time. */
  date: string;
  slot: ServiceSlot;
  kind: OccurrenceKind;
  /** The start instant, "2026-10-18T10:30:00-07:00". */
  startsAt: string;
  /** Which normal-availability choice covers this service. */
  normalKey: ServiceAvailability;
}

const DAY_MS = 86_400_000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `value` is a real calendar date written "YYYY-MM-DD". */
export function isDateString(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

/** "2026-10-18" + 3 -> "2026-10-21". */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const at = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((at(to) - at(from)) / DAY_MS);
}

/** Today's date on the church's calendar. */
export function churchDate(now: number): string {
  return new Date(churchDay(now) * DAY_MS).toISOString().slice(0, 10);
}

/** The stable key of one service: "2026-10-18|AM". */
export function occurrenceKey(date: string, slot: ServiceSlot): string {
  return `${date}|${slot}`;
}

/** Which normal-availability choice a regular service is; null for any other day and time. */
export function regularKeyFor(date: string, slot: ServiceSlot): ServiceAvailability | null {
  const day = dayOfWeek(date);
  if (day === 0) return slot === "AM" ? "sunday_am" : "sunday_pm";
  if (day === 3 && slot === "PM") return "wednesday_pm";
  return null;
}

function isRegular(date: string, slot: ServiceSlot): boolean {
  const day = dayOfWeek(date);
  return siteConfig.songList.regularServices.some((regular) => regular.day === day && regular.slot === slot);
}

/** Every regular service from `from` to `to`, both included, in time order. */
export function regularOccurrences(from: string, to: string): Occurrence[] {
  const result: Occurrence[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const day = dayOfWeek(date);
    for (const regular of siteConfig.songList.regularServices) {
      if (regular.day !== day) continue;
      const normalKey = regularKeyFor(date, regular.slot);
      // A regular service the normal choices do not name (if one is ever
      // added to the config) is still a service: treat it like a special one.
      result.push({
        date,
        slot: regular.slot,
        kind: "regular",
        startsAt: startsAtFor(date, regular.slot),
        normalKey: normalKey ?? "special",
      });
    }
  }
  return sortOccurrences(result);
}

/**
 * Adds the song list's special services (dated services that are not regular
 * ones) to `occurrences`, within the same range. A regular service in the song
 * list is already there and is not repeated.
 */
export function withSpecialServices(
  occurrences: readonly Occurrence[],
  services: ReadonlyArray<{ date: string | null; slot: ServiceSlot | null }>,
  range: { from: string; to: string },
): Occurrence[] {
  const seen = new Set(occurrences.map((occ) => occurrenceKey(occ.date, occ.slot)));
  const result = [...occurrences];
  for (const service of services) {
    if (!service.date || !service.slot) continue;
    if (service.date < range.from || service.date > range.to) continue;
    const key = occurrenceKey(service.date, service.slot);
    if (seen.has(key) || isRegular(service.date, service.slot)) continue;
    seen.add(key);
    result.push({
      date: service.date,
      slot: service.slot,
      kind: "special",
      startsAt: startsAtFor(service.date, service.slot),
      normalKey: "special",
    });
  }
  return sortOccurrences(result);
}

/** The services from `from` to `to`: every regular one, plus the song list's special ones. */
export function serviceOccurrences(
  from: string,
  to: string,
  songListServices: ReadonlyArray<{ date: string | null; slot: ServiceSlot | null }> = [],
): Occurrence[] {
  return withSpecialServices(regularOccurrences(from, to), songListServices, { from, to });
}

/** Finds one service by its date and slot, or null when no service is held then. */
export function findOccurrence(occurrences: readonly Occurrence[], date: string, slot: ServiceSlot): Occurrence | null {
  return occurrences.find((occ) => occ.date === date && occ.slot === slot) ?? null;
}

function sortOccurrences(occurrences: Occurrence[]): Occurrence[] {
  return occurrences.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** The first and last date of a month, "2026-10" -> { from: "2026-10-01", to: "2026-10-31" }. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** "2026-10" moved by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const moved = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Whether `value` is a month written "YYYY-MM". */
export function isMonthString(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
