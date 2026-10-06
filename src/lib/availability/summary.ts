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
 * A leader (manage_availability) also gets the team: for each of the next
 * few services, everyone expected and everyone away, and who has yet to set
 * their normal services - what a director needs to know before a service.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import type { ServiceAvailability } from "@/lib/auth/profile-options";

import {
  buildBoard,
  personStatus,
  indexExceptions,
  upcomingChanges,
  type ExceptionRecord,
  type PersonStatus,
  type RosterPerson,
  type UpcomingChange,
} from "./board";
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
  /**
   * For a leader (manage_availability) only: the whole team at the next few
   * services, rather than just who differs. Absent for everyone else.
   */
  team?: TeamAvailability;
}

/** How many services ahead a leader's team view covers: the same three as Coming up. */
export const SUMMARY_TEAM_SERVICES = 3;

export interface TeamService {
  date: string;
  slot: Occurrence["slot"];
  startsAt: string;
  kind: Occurrence["kind"];
  /** Everyone expected, by name - those there by exception marked as such by their state. */
  expected: PersonStatus[];
  /** Normally there, but away for this one. */
  away: PersonStatus[];
}

export interface TeamAvailability {
  services: TeamService[];
  /** On the board with no normal services set: nothing can be expected of them yet. */
  unset: Array<{ id: string; name: string }>;
  /** How many people are on the board. */
  size: number;
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
  /** The viewer holds manage_availability: include the team view. */
  leader?: boolean;
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

  return {
    self,
    ministry: ministry.slice(0, SUMMARY_LIMIT),
    totalMinistry: ministry.length,
    ...(input.leader ? { team: buildTeam(ahead.slice(0, SUMMARY_TEAM_SERVICES), input.roster, input.exceptions) } : {}),
  };
}

function buildTeam(
  occurrences: readonly Occurrence[],
  roster: readonly RosterPerson[],
  exceptions: readonly ExceptionRecord[],
): TeamAvailability {
  const board = buildBoard({ occurrences, roster, exceptions, subjectId: null, view: "everyone" });
  return {
    services: board.map((service) => ({
      date: service.date,
      slot: service.slot,
      startsAt: service.startsAt,
      kind: service.kind,
      expected: service.expected,
      away: service.changes.filter((person) => person.state === "unavailable-by-exception"),
    })),
    unset: roster
      .filter((person) => person.normal.length === 0)
      .map((person) => ({ id: person.id, name: person.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    size: roster.length,
  };
}
