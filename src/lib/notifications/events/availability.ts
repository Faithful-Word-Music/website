/**
 * Availability's notifications.
 *
 *   WHO HEARS    whoever looks after availability (manage_availability) -
 *                never the whole music team. When a leader changes someone
 *                else's, that person is told as well, in words of their own.
 *                Nobody is told about what they did themselves.
 *   WHAT COUNTS  a change to whether someone will be there. Choosing what
 *                already stood ("Unavailable" twice, "Normal" with nothing
 *                to undo) says nothing.
 *   HOW MANY     one notification for one real action: a date range is one
 *                absence however many services it covers.
 *
 * A quick correction (Available -> Unavailable -> Normal within minutes)
 * folds into one unread notification showing the latest (catalog.ts).
 *
 * The note someone writes with an exception is for the board; it is never
 * put in a notification.
 *
 * Each builder returns what to hand notify(): none, one, or - a leader
 * changing someone else's - two. src/lib/availability/change.ts, the one
 * place availability is written, sends them.
 *
 * Pure - no server-only import - so every rule here is unit tested.
 */

import { notificationsContent } from "@/content/notifications";
import { SERVICE_AVAILABILITY, type ServiceAvailability } from "@/lib/auth/profile-options";
import { effectiveAvailability, type AvailabilityChoice, type ExceptionStatus } from "@/lib/availability/effective";
import { availabilityHref } from "@/lib/availability/format";
import { occurrenceKey, type Occurrence } from "@/lib/availability/occurrences";
import { plural } from "@/lib/plural";
import { serviceTitle } from "@/lib/service-planner/format";
import { serviceAnchor } from "@/lib/site-search";

import { AUDIENCES, users } from "../audience";
import type { NotificationEventKey } from "../catalog";
import type { NotifyInput } from "../service";
import { fill } from "./text";

const copy = notificationsContent.events.availability;

/** Whose availability changed. `name` is their first name, or empty when it could not be found. */
export interface AvailabilityPerson {
  id: string;
  name: string;
}

interface Wording {
  /** For the leaders, when the person changed their own. */
  own: { title: string; body: string };
  /** For the person, when a leader changed theirs. */
  yours: { title: string; body: string };
  /** For the other leaders, when a leader changed someone's. */
  theirs: { title: string; body: string };
}

/**
 * Who is told, and how each is addressed:
 *
 *   their own      -> the leaders, but not the person
 *   someone else's -> the person, and the leaders other than whoever did it
 */
function tell(
  event: NotificationEventKey,
  actorId: string,
  person: AvailabilityPerson,
  wording: Wording,
  rest: Pick<NotifyInput, "entity" | "payload"> & { month?: string },
): NotifyInput[] {
  const { month, ...shared } = rest;
  const base = { event, actorUserId: actorId, ...shared };
  const board = availabilityHref({ month, person: person.id });
  if (person.id === actorId) {
    return [{ ...base, audience: AUDIENCES.availabilityManagers, except: [actorId], actionUrl: board, ...wording.own }];
  }
  return [
    { ...base, audience: users(person.id), except: [actorId], actionUrl: availabilityHref({ month, view: "me" }), ...wording.yours },
    { ...base, audience: AUDIENCES.availabilityManagers, except: [actorId, person.id], actionUrl: board, ...wording.theirs },
  ];
}

const nameOf = (person: AvailabilityPerson) => person.name.trim() || copy.someone;

const longDay = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric" });
/** A calendar date ("2026-10-18") as a day, read as the date it names. */
const day = (format: Intl.DateTimeFormat, date: string) => format.format(new Date(`${date}T12:00:00Z`));

type ServiceOccurrence = Pick<Occurrence, "date" | "slot" | "startsAt" | "normalKey" | "label">;

/** Whether choosing `choice` changes whether the person will be at this service. */
function changes(
  normal: readonly ServiceAvailability[],
  occurrence: Pick<Occurrence, "normalKey">,
  exception: ExceptionStatus | null | undefined,
  choice: AvailabilityChoice,
): boolean {
  const before = effectiveAvailability(normal, occurrence, exception).effective;
  const after = effectiveAvailability(normal, occurrence, choice === "normal" ? null : choice).effective;
  return before !== after;
}

/** One service: Available, Unavailable, or back to Normal. `exception` is what stood for it before. */
export function availabilityServiceChanged(input: {
  actorId: string;
  person: AvailabilityPerson;
  normal: readonly ServiceAvailability[];
  occurrence: ServiceOccurrence;
  exception: ExceptionStatus | null;
  choice: AvailabilityChoice;
}): NotifyInput[] {
  const { person, occurrence, choice } = input;
  if (!changes(input.normal, occurrence, input.exception, choice)) return [];

  const anchor = serviceAnchor(occurrence.date, occurrence.slot);
  const values = {
    name: nameOf(person),
    state: copy.states[choice],
    service: serviceTitle({ ...occurrence, label: occurrence.label ?? null }),
    date: day(longDay, occurrence.date),
  };
  return tell(
    "availability.service_changed",
    input.actorId,
    person,
    {
      own: { title: fill(copy.service.title, values), body: fill(copy.service.body, values) },
      yours: { title: copy.service.yoursTitle, body: fill(copy.service.yoursBody, values) },
      theirs: { title: fill(copy.service.theirsTitle, values), body: fill(copy.service.theirsBody, values) },
    },
    {
      month: occurrence.date.slice(0, 7),
      entity: { type: "availability", id: `${person.id}:${anchor}` },
      payload: { userId: person.id, service: anchor, choice },
    },
  );
}

/**
 * A date range entered at once. `exceptions` is what stood before, by
 * occurrenceKey(). One notification, counting the services it really changed.
 */
export function availabilityRangeChanged(input: {
  actorId: string;
  person: AvailabilityPerson;
  normal: readonly ServiceAvailability[];
  from: string;
  to: string;
  occurrences: readonly ServiceOccurrence[];
  exceptions: ReadonlyMap<string, ExceptionStatus>;
  choice: AvailabilityChoice;
}): NotifyInput[] {
  const { person, choice, from, to } = input;
  const changed = input.occurrences.filter((occurrence) =>
    changes(input.normal, occurrence, input.exceptions.get(occurrenceKey(occurrence.date, occurrence.slot)), choice),
  );
  if (changed.length === 0) return [];

  const count = changed.length;
  const oneDay = from === to;
  const values = { name: nameOf(person), state: copy.states[choice], from: day(monthDay, from), to: day(monthDay, to) };
  const body = (forms: readonly [string, string]) => fill(plural(forms, count), values);
  return tell(
    "availability.range_changed",
    input.actorId,
    person,
    {
      own: {
        title: fill(choice === "unavailable" ? copy.range.absenceTitle : copy.range.title, values),
        body: body(oneDay ? copy.range.oneDayBody : copy.range.body),
      },
      yours: { title: copy.range.yoursTitle, body: body(oneDay ? copy.range.yoursOneDayBody : copy.range.yoursBody) },
      theirs: { title: fill(copy.range.title, values), body: body(oneDay ? copy.range.oneDayBody : copy.range.body) },
    },
    {
      month: from.slice(0, 7),
      entity: { type: "availability-range", id: `${person.id}:${from}_${to}` },
      payload: {
        userId: person.id,
        from,
        to,
        choice,
        services: changed.map((occurrence) => serviceAnchor(occurrence.date, occurrence.slot)),
      },
    },
  );
}

/** The services someone usually serves at. Nothing when the set is the same as before. */
export function availabilityNormalChanged(input: {
  actorId: string;
  person: AvailabilityPerson;
  before: readonly ServiceAvailability[];
  after: readonly ServiceAvailability[];
}): NotifyInput[] {
  const { person } = input;
  const key = (services: readonly ServiceAvailability[]) => [...new Set(services)].sort().join(",");
  if (key(input.before) === key(input.after)) return [];

  const services = SERVICE_AVAILABILITY.filter((option) => input.after.includes(option.value)).map((option) => option.label);
  const none = services.length === 0;
  const values = { name: nameOf(person), services: services.join(", ") };
  const own = { title: fill(copy.normal.title, values), body: fill(none ? copy.normal.noneBody : copy.normal.body, values) };
  return tell(
    "availability.normal_changed",
    input.actorId,
    person,
    {
      own,
      yours: { title: copy.normal.yoursTitle, body: none ? copy.normal.yoursNoneBody : fill(copy.normal.yoursBody, values) },
      theirs: own,
    },
    {
      entity: { type: "availability-user", id: person.id },
      payload: { userId: person.id, before: [...input.before], after: [...input.after] },
    },
  );
}
