/**
 * The shared availability board: for each service, who is different from
 * normal. Everyone behaving as usual stays quiet - the board answers "who
 * differs?", plus the one person being looked at (usually yourself) in full.
 *
 * Built on effectiveAvailability() (effective.ts), so the calendar, the
 * Dashboard and anything later agree on every state.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import type { ServiceAvailability } from "@/lib/auth/profile-options";
import type { ServiceSlot } from "@/types/song-list";

import { effectiveAvailability, type AvailabilityState, type EffectiveAvailability, type ExceptionStatus } from "./effective";
import { occurrenceKey, type Occurrence } from "./occurrences";

/** Someone on the board, with their normal services. Names come from Clerk; nothing is copied. */
export interface RosterPerson {
  id: string;
  name: string;
  normal: ServiceAvailability[];
}

/** A stored exception: one person, one whole service. */
export interface ExceptionRecord {
  userId: string;
  date: string;
  slot: ServiceSlot;
  status: ExceptionStatus;
  note: string | null;
}

export type BoardView = "everyone" | "me";

export interface PersonStatus {
  id: string;
  name: string;
  state: AvailabilityState;
  note: string | null;
}

export interface BoardService extends Occurrence {
  key: string;
  /** The person being looked at (yourself, or whoever a leader is managing); null when they are not on the board. */
  subject: (EffectiveAvailability & { note: string | null }) | null;
  /** People whose availability differs from normal for this service - only the subject under "Me". */
  changes: PersonStatus[];
  /** Everyone expected (effectively available), by name. */
  expected: PersonStatus[];
}

const exceptionKey = (userId: string, date: string, slot: ServiceSlot) => `${userId}|${occurrenceKey(date, slot)}`;

/** Exceptions by person and service, for quick lookup. */
export function indexExceptions(exceptions: readonly ExceptionRecord[]): Map<string, ExceptionRecord> {
  return new Map(exceptions.map((row) => [exceptionKey(row.userId, row.date, row.slot), row]));
}

/** One person's availability for one service, from the index. */
export function personStatus(
  person: RosterPerson,
  occurrence: Occurrence,
  index: ReadonlyMap<string, ExceptionRecord>,
): EffectiveAvailability & { note: string | null } {
  const row = index.get(exceptionKey(person.id, occurrence.date, occurrence.slot));
  const result = effectiveAvailability(person.normal, occurrence, row?.status);
  // A note only means something alongside a real change.
  return { ...result, note: result.exception ? (row?.note ?? null) : null };
}

export function buildBoard(input: {
  occurrences: readonly Occurrence[];
  roster: readonly RosterPerson[];
  exceptions: readonly ExceptionRecord[];
  /** Whose own status to show (and whose changes "Me" keeps). */
  subjectId: string | null;
  view: BoardView;
}): BoardService[] {
  const index = indexExceptions(input.exceptions);
  const roster = [...input.roster].sort((a, b) => a.name.localeCompare(b.name));
  const subject = roster.find((person) => person.id === input.subjectId) ?? null;

  return input.occurrences.map((occurrence) => {
    const statuses = roster.map((person) => ({ person, status: personStatus(person, occurrence, index) }));
    const changes = statuses
      .filter(({ person, status }) => status.exception && (input.view === "everyone" || person.id === input.subjectId))
      .map(({ person, status }) => ({ id: person.id, name: person.name, state: status.state, note: status.note }));
    const expected = statuses
      .filter(({ status }) => status.effective)
      .map(({ person, status }) => ({ id: person.id, name: person.name, state: status.state, note: status.note }));

    return {
      ...occurrence,
      key: occurrenceKey(occurrence.date, occurrence.slot),
      subject: subject ? personStatus(subject, occurrence, index) : null,
      changes,
      expected,
    };
  });
}

/** One upcoming change, for the "upcoming changes" lists. */
export interface UpcomingChange extends PersonStatus {
  date: string;
  slot: ServiceSlot;
  startsAt: string;
  kind: Occurrence["kind"];
}

/**
 * The real changes from normal among `occurrences`, in time order - only
 * `personId`'s when given. An exception for a date with no service, or one
 * that now matches normal, is not a change and is left out.
 */
export function upcomingChanges(
  occurrences: readonly Occurrence[],
  roster: readonly RosterPerson[],
  exceptions: readonly ExceptionRecord[],
  personId?: string,
): UpcomingChange[] {
  const index = indexExceptions(exceptions);
  const people = personId ? roster.filter((person) => person.id === personId) : roster;
  const result: UpcomingChange[] = [];
  for (const occurrence of occurrences) {
    for (const person of [...people].sort((a, b) => a.name.localeCompare(b.name))) {
      const status = personStatus(person, occurrence, index);
      if (!status.exception) continue;
      result.push({
        id: person.id,
        name: person.name,
        state: status.state,
        note: status.note,
        date: occurrence.date,
        slot: occurrence.slot,
        startsAt: occurrence.startsAt,
        kind: occurrence.kind,
      });
    }
  }
  return result;
}
