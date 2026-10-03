/**
 * How far ahead the Service Planner looks - the same rule for Plan and for
 * Inserts, so both pages show only what needs planning, a month at a time:
 *
 *   - The planning month is always in view.
 *   - The month after it comes into view `leadDays` before its first day
 *     (siteConfig.servicePlanner.planningLeadDays), never sooner on its own.
 *   - "Start planning <month>" brings the next month in early, one more each
 *     time it is pressed (`ahead`), and "Not yet" sends the last one away
 *     again. Nothing else beyond the planning month is ever shown.
 *
 * Months are "YYYY-MM"; days are "YYYY-MM-DD", in church time. Pure - unit
 * tested.
 */

import { addDays } from "@/lib/availability/occurrences";

/** "Start planning" can bring in up to a year ahead. */
export const MAX_AHEAD = 12;

/** The month after `month`: "2026-12" -> "2027-01". */
export function monthAfter(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
}

/** The last day of `month`. */
export function monthEnd(month: string): string {
  return addDays(`${monthAfter(month)}-01`, -1);
}

/** The months in view, in order: the planning month, then the next when near, then `ahead` more. */
export function planningMonths(planningMonth: string, today: string, leadDays: number, ahead: number): string[] {
  const near = today >= addDays(`${monthAfter(planningMonth)}-01`, -leadDays) ? 1 : 0;
  const months = [planningMonth];
  for (let added = 0; added < near + ahead; added++) months.push(monthAfter(months[months.length - 1]));
  return months;
}

/** `?ahead=` as asked for: a whole number from 0 to MAX_AHEAD. */
export function parseAhead(value: string | string[] | undefined): number {
  const requested = Number(typeof value === "string" ? value : NaN);
  return Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_AHEAD) : 0;
}

/** "November", for "Start planning November". */
export function monthName(month: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long" }).format(new Date(`${month}-01T12:00:00Z`));
}
