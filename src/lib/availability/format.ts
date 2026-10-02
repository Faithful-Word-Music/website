/**
 * Wording for availability, shared by the page, its dialogs and the
 * Dashboard so a service and a state always read the same way.
 *
 * Pure - no server-only import. Dates are formatted in the church's
 * timezone, so the server and the browser always agree.
 */

import { siteConfig } from "@/config/site";
import { availabilityContent } from "@/content/availability";
import type { ServiceAvailability } from "@/lib/auth/profile-options";
import { SERVICE_AVAILABILITY } from "@/lib/auth/profile-options";
import { formatChurchTime } from "@/lib/service-time";

import type { BoardView } from "./board";
import type { AvailabilityState } from "./effective";
import type { Occurrence } from "./occurrences";

const copy = availabilityContent;
const { timeZone } = siteConfig.songList;

/** "Morning service" / "Special service". */
export function serviceName(occurrence: Pick<Occurrence, "kind" | "slot">): string {
  if (occurrence.kind === "special") return `${copy.special} (${occurrence.slot})`;
  return `${copy.slots[occurrence.slot]} service`;
}

export function stateLabel(state: AvailabilityState): string {
  return copy.states[state];
}

export function stateShort(state: AvailabilityState): string {
  return copy.stateShort[state];
}

const longDay = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" });
const shortDay = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });

/** "Sunday, October 18" */
export function serviceDay(occurrence: Pick<Occurrence, "startsAt">): string {
  return longDay.format(new Date(occurrence.startsAt));
}

/** "Sun, Oct 18 AM" */
export function serviceShort(occurrence: Pick<Occurrence, "startsAt" | "slot">): string {
  return `${shortDay.format(new Date(occurrence.startsAt))} ${occurrence.slot}`;
}

/** "Morning service · 10:30 AM" */
export function serviceLine(occurrence: Pick<Occurrence, "kind" | "slot" | "startsAt">): string {
  return `${serviceName(occurrence)} · ${formatChurchTime(occurrence.startsAt)}`;
}

/** "October 2026" for "2026-10". */
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(`${month}-01T12:00:00Z`),
  );
}

/** "Sunday morning · Sunday evening", in the fixed order. */
export function normalServicesLabel(normal: readonly ServiceAvailability[]): string[] {
  return SERVICE_AVAILABILITY.filter((option) => normal.includes(option.value)).map((option) => option.label);
}

/** "1 change" / "3 changes". */
export function changeCount(count: number): string {
  return (count === 1 ? copy.changeCount[0] : copy.changeCount[1]).replace("{count}", String(count));
}

/** The /availability address for a month, view and (for leaders) the person being managed. */
export function availabilityHref(options: { month?: string; view?: BoardView; person?: string | null }): string {
  const params = new URLSearchParams();
  if (options.month) params.set("month", options.month);
  if (options.view === "me") params.set("view", "me");
  if (options.person) params.set("person", options.person);
  const query = params.toString();
  return query ? `/availability?${query}` : "/availability";
}
