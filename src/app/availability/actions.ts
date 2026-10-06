"use server";

import { revalidatePath } from "next/cache";

import { availabilityContent } from "@/content/availability";
import { firstIssue } from "@/lib/auth/forms";
import { withPermission, type ActionResult } from "@/lib/auth/session";
import { PARTICIPANT_PERMISSION } from "@/lib/availability/access";
import { applyChoice, changeServiceAvailability, refreshAvailability as refresh, resolveTarget } from "@/lib/availability/change";
import { normalAvailabilitySchema, rangeSchema } from "@/lib/availability/forms";
import { loadPlannedServices } from "@/lib/availability/load";
import { serviceOccurrences } from "@/lib/availability/occurrences";
import { occurrencesInRange } from "@/lib/availability/range";
import { plural } from "@/lib/plural";
import { setNormalAvailability } from "@/lib/availability/store";

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
 *
 * Steps 2 to 5 for one service are changeServiceAvailability()
 * (src/lib/availability/change.ts), which the site search's quick action
 * shares (/api/account/availability): there is one way a service's
 * availability is changed, however it was asked for.
 */

const messages = availabilityContent.messages;

/** One whole service: Available, Unavailable, or back to Normal. */
export async function setServiceAvailability(input: unknown): Promise<ActionResult> {
  return withPermission(PARTICIPANT_PERMISSION, (viewer) => changeServiceAvailability(viewer, input));
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
      serviceOccurrences(from, to, await loadPlannedServices(viewer.env, from, to)),
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
      message: plural(messages.rangeSaved, count),
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
