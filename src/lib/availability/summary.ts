/**
 * The Dashboard's Availability section: a short summary and a way into the
 * full calendar on /availability - never a copy of it.
 *
 *   - their normal services
 *   - the next service and whether they are expected at it
 *   - their own upcoming changes
 *   - the ministry's other changes over the next two weeks
 *
 * Someone who may see the board without being on it (an administrator with
 * no music role) gets only the ministry's changes.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import type { ServiceAvailability } from "@/lib/auth/profile-options";

import { personStatus, indexExceptions, upcomingChanges, type ExceptionRecord, type RosterPerson, type UpcomingChange } from "./board";
import type { AvailabilityState } from "./effective";
import { churchDate, addDays, type Occurrence } from "./occurrences";
import { isEditable } from "./access";

/** How far ahead the ministry's changes are shown on the Dashboard. */
export const SUMMARY_MINISTRY_DAYS = 14;
/** How many of anything the section lists. */
export const SUMMARY_LIMIT = 5;

export interface AvailabilitySummary {
  /** Null when the viewer is not on the board themself. */
  self: {
    normal: ServiceAvailability[];
    next: { date: string; slot: Occurrence["slot"]; startsAt: string; kind: Occurrence["kind"]; state: AvailabilityState } | null;
    changes: UpcomingChange[];
    /** How many there are in all, when more than `changes` holds. */
    totalChanges: number;
  } | null;
  /** Other people's changes in the next SUMMARY_MINISTRY_DAYS. */
  ministry: UpcomingChange[];
  totalMinistry: number;
}

/**
 * @param occurrences the services from today on (at least the ministry window;
 *        further for the viewer's own changes)
 */
export function buildAvailabilitySummary(input: {
  occurrences: readonly Occurrence[];
  roster: readonly RosterPerson[];
  exceptions: readonly ExceptionRecord[];
  viewerId: string;
  now: number;
}): AvailabilitySummary {
  const ahead = input.occurrences.filter((occ) => isEditable(occ, input.now));
  const me = input.roster.find((person) => person.id === input.viewerId) ?? null;
  const index = indexExceptions(input.exceptions);

  let self: AvailabilitySummary["self"] = null;
  if (me) {
    const next = ahead[0] ?? null;
    const changes = upcomingChanges(ahead, input.roster, input.exceptions, me.id);
    self = {
      normal: me.normal,
      next: next
        ? { date: next.date, slot: next.slot, startsAt: next.startsAt, kind: next.kind, state: personStatus(me, next, index).state }
        : null,
      changes: changes.slice(0, SUMMARY_LIMIT),
      totalChanges: changes.length,
    };
  }

  const horizon = addDays(churchDate(input.now), SUMMARY_MINISTRY_DAYS);
  const ministry = upcomingChanges(
    ahead.filter((occ) => occ.date <= horizon),
    input.roster.filter((person) => person.id !== input.viewerId),
    input.exceptions,
  );

  return { self, ministry: ministry.slice(0, SUMMARY_LIMIT), totalMinistry: ministry.length };
}
