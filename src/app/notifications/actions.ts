"use server";

import { revalidatePath } from "next/cache";

import { notificationsContent } from "@/content/notifications";
import { withPermission, type ActionResult } from "@/lib/auth/session";
import { setPreference } from "@/lib/notifications/service";
import { notificationDeps } from "@/lib/notifications/store";

/**
 * Notification settings: a person's own choice for one category on one
 * channel. Any signed-in person, and only ever their own - whose it is comes
 * from the session, never from the arguments. What may be chosen is decided
 * by the category's policy (src/lib/notifications/service.ts): a mandatory
 * category and a channel not offered are both refused here, whatever the page
 * showed.
 */
export async function setNotificationPreferenceAction(category: unknown, channel: unknown, enabled: unknown): Promise<ActionResult> {
  return withPermission(null, async (viewer) => {
    const copy = notificationsContent.settings;
    const result = await setPreference(viewer, { category, channel, enabled }, notificationDeps(viewer.env));
    if (!result.ok) {
      const error = result.problem === "locked" ? copy.locked : result.problem === "unavailable" ? copy.notOffered : notificationsContent.errors.update;
      return { ok: false, error };
    }
    revalidatePath("/notifications/settings");
    return { ok: true, value: null, message: copy.saved };
  });
}
