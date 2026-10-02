/**
 * Effective availability - THE ONE PLACE it is decided:
 *
 *   normal services + a dated exception for that service = effective availability
 *
 *   1. Is the person normally available for this kind of service
 *      (their user_profiles.service_availability choices)?
 *   2. Is there an exception for this one service (its date and AM/PM)?
 *   3. If so, the exception decides; otherwise their normal pattern does.
 *
 * Availability is always about a whole service: available for all of it, or
 * not available for it. There are no partial services, times or songs here.
 *
 * The Dashboard, the /availability calendar, and later the Service Planner
 * and member profiles all ask this module - none of them work it out alone.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import type { ServiceAvailability } from "@/lib/auth/profile-options";

import type { Occurrence } from "./occurrences";

export type ExceptionStatus = "available" | "unavailable";

/** The longest note an exception may carry. Notes are seen by the whole music team. */
export const NOTE_LIMIT = 280;

export type AvailabilityState =
  | "normally-available"
  | "normally-unavailable"
  | "available-by-exception"
  | "unavailable-by-exception";

export interface EffectiveAvailability {
  /** Their normal pattern includes this kind of service. */
  normal: boolean;
  /** Whether they are available for this service, all things considered. */
  effective: boolean;
  /** The exception that changes this service from normal, if any. */
  exception: ExceptionStatus | null;
  state: AvailabilityState;
}

/**
 * One person's availability for one whole service. An exception that says
 * the same as their normal pattern (say, after they changed the pattern)
 * changes nothing, and is reported as no exception at all.
 */
export function effectiveAvailability(
  normalServices: readonly ServiceAvailability[],
  occurrence: Pick<Occurrence, "normalKey">,
  exception?: ExceptionStatus | null,
): EffectiveAvailability {
  const normal = normalServices.includes(occurrence.normalKey);
  const differs = exception != null && (exception === "available") !== normal;
  if (!differs) {
    return { normal, effective: normal, exception: null, state: normal ? "normally-available" : "normally-unavailable" };
  }
  return {
    normal,
    effective: !normal,
    exception,
    state: normal ? "unavailable-by-exception" : "available-by-exception",
  };
}

/** What someone chose for a service: an exception either way, or back to normal. */
export type AvailabilityChoice = ExceptionStatus | "normal";

/**
 * What to store when someone chooses `choice` for each of `occurrences`:
 * only real differences from their normal pattern are kept, so the board
 * holds nothing but changes. "Normal" - or a choice that matches normal -
 * removes any exception for that service.
 */
export function planExceptionWrites(
  normalServices: readonly ServiceAvailability[],
  occurrences: readonly Occurrence[],
  choice: AvailabilityChoice,
): { upserts: Occurrence[]; deletes: Occurrence[] } {
  const upserts: Occurrence[] = [];
  const deletes: Occurrence[] = [];
  for (const occurrence of occurrences) {
    const normal = normalServices.includes(occurrence.normalKey);
    if (choice === "normal" || (choice === "available") === normal) deletes.push(occurrence);
    else upserts.push(occurrence);
  }
  return { upserts, deletes };
}
