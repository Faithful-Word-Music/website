/**
 * Your own availability, a service at a time - what the site search's
 * "Update my availability…" lists and offers (AvailabilityCommand.tsx,
 * through /api/account/availability).
 *
 * Nothing here decides availability: a service's state is personStatus()
 * (board.ts, on effectiveAvailability), exactly as the Availability page
 * shows it, and a choice is written by the page's own action
 * (changeServiceAvailability in change.ts). This only says which coming
 * services to list and which choices are worth offering for each.
 *
 * Pure - no server-only import - so it is unit tested.
 */

import { songKey } from "@/lib/song-list";
import type { ServiceSlot } from "@/types/song-list";

import { isEditable } from "./access";
import { indexExceptions, personStatus, type ExceptionRecord, type RosterPerson } from "./board";
import type { AvailabilityChoice, AvailabilityState } from "./effective";
import { serviceDay, serviceLine, serviceShort } from "./format";
import type { Occurrence, OccurrenceKind } from "./occurrences";

/** How far ahead the quick action looks. Further out is the Availability page's (and its date ranges'). */
export const QUICK_DAYS = 56;
/** The most services it lists. */
export const QUICK_LIMIT = 30;

/** One coming service, as the person stands for it now. */
export interface MyService {
  date: string;
  slot: ServiceSlot;
  kind: OccurrenceKind;
  startsAt: string;
  /** A name the planner gave it ("Missions Conference"), or null. */
  label: string | null;
  state: AvailabilityState;
  /** The note on their exception for it, when there is one. */
  note: string | null;
}

/**
 * The person's coming services that can still be changed, soonest first:
 * real services only (`occurrences` comes from serviceOccurrences, special
 * and cancelled ones accounted for), none that has started.
 */
export function myServices(input: {
  occurrences: readonly Occurrence[];
  person: Pick<RosterPerson, "id" | "normal">;
  exceptions: readonly ExceptionRecord[];
  now: number;
}): MyService[] {
  const index = indexExceptions(input.exceptions.filter((row) => row.userId === input.person.id));
  const person: RosterPerson = { ...input.person, name: "" };
  return input.occurrences
    .filter((occurrence) => isEditable(occurrence, input.now))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, QUICK_LIMIT)
    .map((occurrence) => {
      const status = personStatus(person, occurrence, index);
      return {
        date: occurrence.date,
        slot: occurrence.slot,
        kind: occurrence.kind,
        startsAt: occurrence.startsAt,
        label: occurrence.label ?? null,
        state: status.state,
        note: status.note,
      };
    });
}

/**
 * The choices worth offering for a service, given how the person stands now:
 * only ones that would change something.
 *
 *   as usual, serving      -> away
 *   as usual, not serving  -> there
 *   changed either way     -> back to usual (which is the other answer)
 */
export function choicesFor(state: AvailabilityState): AvailabilityChoice[] {
  switch (state) {
    case "normally-available":
      return ["unavailable"];
    case "normally-unavailable":
      return ["available"];
    case "available-by-exception":
    case "unavailable-by-exception":
      return ["normal"];
  }
}

/** What a service is found by: its day, its name and time, and the short form ("Sun, Oct 18 AM"). */
export function serviceWords(service: Pick<MyService, "kind" | "slot" | "startsAt" | "label">): string {
  return [serviceDay(service), serviceLine(service), serviceShort(service), service.label ?? ""].join(" ");
}

/** The services answering what was typed: every typed word found somewhere in the service's words. All of them, with nothing typed. */
export function matchMyServices<T extends Pick<MyService, "kind" | "slot" | "startsAt" | "label">>(services: readonly T[], query: string): T[] {
  const words = songKey(query).split(" ").filter(Boolean);
  if (words.length === 0) return [...services];
  return services.filter((service) => {
    const haystack = songKey(serviceWords(service));
    return words.every((word) => haystack.includes(word));
  });
}
