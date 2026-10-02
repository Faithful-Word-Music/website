"use server";

import { revalidatePath } from "next/cache";

import { availabilityContent } from "@/content/availability";
import { firstIssue } from "@/lib/auth/forms";
import { withPermission, type ActionResult, type Viewer } from "@/lib/auth/session";
import { availabilityTarget, isEditable, PARTICIPANT_PERMISSION } from "@/lib/availability/access";
import { planExceptionWrites, type AvailabilityChoice } from "@/lib/availability/effective";
import { normalAvailabilitySchema, rangeSchema, serviceExceptionSchema } from "@/lib/availability/forms";
import { loadSongListServices } from "@/lib/availability/load";
import { findOccurrence, regularKeyFor, serviceOccurrences, type Occurrence } from "@/lib/availability/occurrences";
import { occurrencesInRange } from "@/lib/availability/range";
import {
  deleteExceptions,
  loadRosterRecords,
  setNormalAvailability,
  upsertExceptions,
  type RosterRecord,
} from "@/lib/availability/store";

/**
 * Changing availability. Every action:
 *
 *   1. runs only for someone holding view_availability (withPermission);
 *   2. validates what the browser sent (src/lib/availability/forms.ts);
 *   3. works out whose availability it is with availabilityTarget(): your
 *      own comes from the session, and anyone else's needs
 *      manage_availability and a person on the board - a user ID from the
 *      browser is never trusted on its own;
 *   4. checks each service is real and has not started;
 *   5. writes, then refreshes the pages that show availability.
 */

const messages = availabilityContent.messages;

type Target = { ok: true; person: RosterRecord } | { ok: false; error: string };

async function resolveTarget(viewer: Viewer, userId: string | undefined): Promise<Target> {
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
async function applyChoice(
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

function refresh() {
  revalidatePath("/availability");
  revalidatePath("/dashboard");
}

/** One whole service: Available, Unavailable, or back to Normal. */
export async function setServiceAvailability(input: unknown): Promise<ActionResult> {
  return withPermission(PARTICIPANT_PERMISSION, async (viewer) => {
    const parsed = serviceExceptionSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { date, slot, status, note, userId } = parsed.data;

    const target = await resolveTarget(viewer, userId);
    if (!target.ok) return target;

    // Special services come from the song list; a regular one never needs it.
    const songList = regularKeyFor(date, slot) ? [] : await loadSongListServices();
    const occurrence = findOccurrence(serviceOccurrences(date, date, songList), date, slot);
    if (!occurrence) return { ok: false, error: messages.noService };
    if (!isEditable(occurrence, Date.now())) return { ok: false, error: messages.started };

    await applyChoice(viewer, target.person, [occurrence], status, note);
    refresh();
    return { ok: true, value: null, message: messages.saved };
  });
}

/** Every service in a date range at once - stored as one exception per service. */
export async function setRangeAvailability(input: unknown): Promise<ActionResult<{ count: number }>> {
  return withPermission(PARTICIPANT_PERMISSION, async (viewer) => {
    const parsed = rangeSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { from, to, status, note, userId } = parsed.data;

    const target = await resolveTarget(viewer, userId);
    if (!target.ok) return target;

    const occurrences = occurrencesInRange(
      serviceOccurrences(from, to, await loadSongListServices()),
      from,
      to,
      Date.now(),
    );
    if (occurrences.length === 0) return { ok: false, error: messages.noneInRange };

    await applyChoice(viewer, target.person, occurrences, status, note);
    refresh();
    const count = occurrences.length;
    return {
      ok: true,
      value: { count },
      message: (count === 1 ? messages.rangeSaved[0] : messages.rangeSaved[1]).replace("{count}", String(count)),
    };
  });
}

/** The services someone usually serves at. */
export async function setNormalPattern(input: unknown): Promise<ActionResult> {
  return withPermission(PARTICIPANT_PERMISSION, async (viewer) => {
    const parsed = normalAvailabilitySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const target = await resolveTarget(viewer, parsed.data.userId);
    if (!target.ok) return target;

    await setNormalAvailability(viewer.env, target.person.id, parsed.data.services);
    refresh();
    revalidatePath("/profile");
    return { ok: true, value: null, message: availabilityContent.normal.saved };
  });
}
