"use server";

import { withPermission, type ActionResult } from "@/lib/auth/session";
import { PARTICIPANT_PERMISSION } from "@/lib/availability/access";
import { changeNormalAvailability, changeRangeAvailability, changeServiceAvailability } from "@/lib/availability/change";

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
 *   5. writes, then refreshes the pages that show availability;
 *   6. tells whoever looks after availability (and the person, when a leader
 *      changed theirs) - best effort, after the change is saved.
 *
 * Steps 2 to 6 are src/lib/availability/change.ts, which the site search's
 * quick action shares (/api/account/availability): there is one way
 * availability is changed and announced, however it was asked for.
 */

/** One whole service: Available, Unavailable, or back to Normal. */
export async function setServiceAvailability(input: unknown): Promise<ActionResult> {
  return withPermission(PARTICIPANT_PERMISSION, (viewer) => changeServiceAvailability(viewer, input));
}

/** Every service in a date range at once - stored as one exception per service. */
export async function setRangeAvailability(input: unknown): Promise<ActionResult<{ count: number }>> {
  return withPermission(PARTICIPANT_PERMISSION, (viewer) => changeRangeAvailability(viewer, input));
}

/** The services someone usually serves at. */
export async function setNormalPattern(input: unknown): Promise<ActionResult> {
  return withPermission(PARTICIPANT_PERMISSION, (viewer) => changeNormalAvailability(viewer, input));
}
