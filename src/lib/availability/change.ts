import "server-only";

import { revalidatePath } from "next/cache";

import { availabilityContent } from "@/content/availability";
import { firstIssue } from "@/lib/auth/forms";
import type { ActionResult, Viewer } from "@/lib/auth/session";

import { availabilityTarget, isEditable } from "./access";
import { planExceptionWrites, type AvailabilityChoice } from "./effective";
import { serviceExceptionSchema } from "./forms";
import { loadPlannedServices } from "./load";
import { addDays, churchDate, findOccurrence, serviceOccurrences, type Occurrence } from "./occurrences";
import { myServices, QUICK_DAYS, type MyService } from "./quick";
import { deleteExceptions, listExceptions, loadRosterRecords, upsertExceptions, type RosterRecord } from "./store";

/**
 * Changing availability: the one write path. The Availability page's server
 * actions (src/app/availability/actions.ts) and the site search's quick
 * action (/api/account/availability) both come through here, so a change is
 * validated, authorised, written and refreshed the same way wherever it was
 * asked for.
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

  await applyChoice(viewer, target.person, [occurrence], status, note);
  refreshAvailability();
  return { ok: true, value: null, message: messages.saved };
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
