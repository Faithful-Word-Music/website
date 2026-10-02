/**
 * "Unavailable October 15-22": a date range is a convenient way to enter an
 * absence, not something stored. It resolves to the whole services it covers,
 * and each becomes its own exception - so a range never needs a recurrence
 * engine, and every service can still be changed on its own afterwards.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import { isEditable } from "./access";
import type { Occurrence } from "./occurrences";

/** The longest range accepted at once, in days (both ends included). */
export const MAX_RANGE_DAYS = 120;

/**
 * The services a range covers that can still be changed: from `from` to `to`
 * (both dates included), and not yet started.
 */
export function occurrencesInRange(
  occurrences: readonly Occurrence[],
  from: string,
  to: string,
  now: number,
): Occurrence[] {
  return occurrences.filter((occ) => occ.date >= from && occ.date <= to && isEditable(occ, now));
}
