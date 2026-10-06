import "server-only";

import { revalidatePath } from "next/cache";

import { availabilityContent } from "@/content/availability";
import { getAccount } from "@/lib/auth/clerk";
import { firstIssue } from "@/lib/auth/forms";
import type { ActionResult, Viewer } from "@/lib/auth/session";
import {
  availabilityNormalChanged,
  availabilityRangeChanged,
  availabilityServiceChanged,
  type AvailabilityPerson,
} from "@/lib/notifications/events/availability";
import { notifyBestEffort } from "@/lib/notifications/send";
import type { NotifyInput } from "@/lib/notifications/service";
import { plural } from "@/lib/plural";

import { availabilityTarget, isEditable } from "./access";
import { planExceptionWrites, type AvailabilityChoice, type ExceptionStatus } from "./effective";
import { normalAvailabilitySchema, rangeSchema, serviceExceptionSchema } from "./forms";
import { loadPlannedServices } from "./load";
import { addDays, churchDate, findOccurrence, occurrenceKey, serviceOccurrences, type Occurrence } from "./occurrences";
import { myServices, QUICK_DAYS, type MyService } from "./quick";
import { occurrencesInRange } from "./range";
import {
  deleteExceptions,
  listExceptions,
  loadRosterRecords,
  setNormalAvailability,
  upsertExceptions,
  type RosterRecord,
} from "./store";

/**
 * Changing availability: the one write path. The Availability page's server
 * actions (src/app/availability/actions.ts) and the site search's quick
 * action (/api/account/availability) both come through here, so a change is
 * validated, authorised, written, refreshed AND ANNOUNCED the same way
 * wherever it was asked for: one service, a date range, or someone's normal
 * services. Notifications are sent from here and nowhere else, so no way of
 * changing availability can go unannounced or be announced twice.
 *
 * NO PERMISSION IS CHECKED HERE: every caller has already established that
 * the viewer holds view_availability (withPermission in the actions, the
 * route's own check). What IS decided here is whose availability a change is
 * for - availabilityTarget(), never a user ID taken on trust.
 */

const messages = availabilityContent.messages;

export type Target = { ok: true; person: RosterRecord } | { ok: false; error: string };

/**
 * Whose availability a change is for: the viewer's own (from the session)
 * unless `userId` names someone else, which needs manage_availability and a
 * person on the board.
 */
export async function resolveTarget(viewer: Viewer, userId: string | undefined): Promise<Target> {
  const roster = await loadRosterRecords(viewer.env);
  const target = availabilityTarget(viewer, userId, new Set(roster.map((person) => person.id)));
  if (target.kind === "forbidden") {
    console.warn(`[availability] Refused a change by ${viewer.userId}: ${target.reason}.`);
    const error =
      target.reason === "not-on-board"
        ? messages.notOnBoard
        : target.reason === "not-a-leader"
          ? messages.notLeader
          : messages.unknownPerson;
    return { ok: false, error };
  }
  return { ok: true, person: roster.find((person) => person.id === target.userId)! };
}

/** Writes a choice for these services: only real differences from normal are kept. */
export async function applyChoice(
  viewer: Viewer,
  person: RosterRecord,
  occurrences: readonly Occurrence[],
  choice: AvailabilityChoice,
  note: string | null,
): Promise<void> {
  const { upserts, deletes } = planExceptionWrites(person.normal, occurrences, choice);
  await upsertExceptions(
    viewer.env,
    person.id,
    upserts.map((occ) => ({ date: occ.date, slot: occ.slot, status: choice as "available" | "unavailable", note })),
    viewer.userId,
  );
  await deleteExceptions(viewer.env, person.id, deletes);
}

/** The pages that show availability. */
export function refreshAvailability() {
  revalidatePath("/availability");
  revalidatePath("/dashboard");
}

/**
 * One whole service: Available, Unavailable, or back to Normal. `input` is
 * whatever the browser sent; it is parsed here.
 */
export async function changeServiceAvailability(viewer: Viewer, input: unknown): Promise<ActionResult> {
  const parsed = serviceExceptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { date, slot, status, note, userId } = parsed.data;

  const target = await resolveTarget(viewer, userId);
  if (!target.ok) return target;

  // Special services (and cancellations) come from the Service Planner.
  const planned = await loadPlannedServices(viewer.env, date, date);
  const occurrence = findOccurrence(serviceOccurrences(date, date, planned), date, slot);
  if (!occurrence) return { ok: false, error: messages.noService };
  if (!isEditable(occurrence, Date.now())) return { ok: false, error: messages.started };

  const standing = await standingExceptions(viewer, target.person, date, date);
  await applyChoice(viewer, target.person, [occurrence], status, note);
  refreshAvailability();
  await announce(viewer, target.person, standing, (person, exceptions) =>
    availabilityServiceChanged({
      actorId: viewer.userId,
      person,
      normal: target.person.normal,
      occurrence,
      exception: exceptions.get(occurrenceKey(date, slot)) ?? null,
      choice: status,
    }),
  );
  return { ok: true, value: null, message: messages.saved };
}

/**
 * Every service in a date range at once - stored as one exception per
 * service, and announced as ONE change: the absence, not each service.
 */
export async function changeRangeAvailability(viewer: Viewer, input: unknown): Promise<ActionResult<{ count: number }>> {
  const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { from, to, status, note, userId } = parsed.data;

  const target = await resolveTarget(viewer, userId);
  if (!target.ok) return target;

  const occurrences = occurrencesInRange(
    serviceOccurrences(from, to, await loadPlannedServices(viewer.env, from, to)),
    from,
    to,
    Date.now(),
  );
  if (occurrences.length === 0) return { ok: false, error: messages.noneInRange };

  const standing = await standingExceptions(viewer, target.person, from, to);
  await applyChoice(viewer, target.person, occurrences, status, note);
  refreshAvailability();
  await announce(viewer, target.person, standing, (person, exceptions) =>
    availabilityRangeChanged({
      actorId: viewer.userId,
      person,
      normal: target.person.normal,
      from,
      to,
      occurrences,
      exceptions,
      choice: status,
    }),
  );
  const count = occurrences.length;
  return { ok: true, value: { count }, message: plural(messages.rangeSaved, count) };
}

/** The services someone usually serves at. */
export async function changeNormalAvailability(viewer: Viewer, input: unknown): Promise<ActionResult> {
  const parsed = normalAvailabilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const target = await resolveTarget(viewer, parsed.data.userId);
  if (!target.ok) return target;

  await setNormalAvailability(viewer.env, target.person.id, parsed.data.services);
  refreshAvailability();
  revalidatePath("/profile");
  await announce(viewer, target.person, new Map(), (person) =>
    availabilityNormalChanged({
      actorId: viewer.userId,
      person,
      before: target.person.normal,
      after: parsed.data.services,
    }),
  );
  return { ok: true, value: null, message: availabilityContent.normal.saved };
}

// ---------------------------------------------------------------------------
// Telling the people a change affects (src/lib/notifications/events/availability.ts)
// ---------------------------------------------------------------------------

type Standing = Map<string, ExceptionStatus>;

/**
 * One person's exceptions as they stand BEFORE a change, by occurrenceKey():
 * what tells a real change from choosing what was already so. Null when they
 * could not be read - the change still goes ahead, and nobody is told.
 */
async function standingExceptions(viewer: Viewer, person: RosterRecord, from: string, to: string): Promise<Standing | null> {
  try {
    const all = await listExceptions(viewer.env, from, to);
    return new Map(
      all.filter((exception) => exception.userId === person.id).map((exception) => [occurrenceKey(exception.date, exception.slot), exception.status]),
    );
  } catch (error) {
    console.error("[availability] Could not read the exceptions before a change:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

/**
 * Sends what `build` says a change deserves - nothing, when it changed
 * nothing. Runs after the change is saved and never fails it. The person's
 * name is their preferred name, or their first name from Clerk, looked up
 * only when there is something to send.
 */
async function announce(
  viewer: Viewer,
  record: RosterRecord,
  standing: Standing | null,
  build: (person: AvailabilityPerson, exceptions: Standing) => NotifyInput[],
): Promise<void> {
  if (!standing) return;
  try {
    let inputs = build({ id: record.id, name: record.preferredName }, standing);
    if (inputs.length > 0 && !record.preferredName.trim()) {
      const account = await getAccount(record.id);
      if (account.ok && account.value.firstName) inputs = build({ id: record.id, name: account.value.firstName }, standing);
    }
    for (const input of inputs) await notifyBestEffort(viewer.env, input);
  } catch (error) {
    console.error("[availability] Could not announce a change:", error instanceof Error ? error.message : "unknown error");
  }
}

/**
 * The viewer's own coming services and how they stand for each - what the
 * quick action lists (quick.ts). `onBoard` is false for someone who holds
 * the permission without being a participant (an administrator, by the
 * Administrator role's blanket grant): they have no availability to change.
 */
export async function loadMyAvailability(viewer: Viewer): Promise<{ onBoard: boolean; services: MyService[] }> {
  const now = Date.now();
  const today = churchDate(now);
  const to = addDays(today, QUICK_DAYS);

  const roster = await loadRosterRecords(viewer.env);
  const person = roster.find((record) => record.id === viewer.userId);
  if (!person) return { onBoard: false, services: [] };

  const [planned, exceptions] = await Promise.all([
    loadPlannedServices(viewer.env, today, to),
    listExceptions(viewer.env, today, to),
  ]);
  return {
    onBoard: true,
    services: myServices({ occurrences: serviceOccurrences(today, to, planned), person, exceptions, now }),
  };
}
