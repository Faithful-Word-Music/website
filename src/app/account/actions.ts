"use server";

import { revalidatePath } from "next/cache";

import { updateAccountName } from "@/lib/auth/clerk";
import { firstIssue, profileSchema } from "@/lib/auth/forms";
import { MUSICIAN_ROLE } from "@/lib/auth/permissions";
import { withPermission, type ActionResult } from "@/lib/auth/session";
import { getProfile, saveProfile } from "@/lib/auth/store";

/**
 * Saves the signed-in person's OWN profile. The user ID comes from the
 * session, never from the form, so nobody can edit someone else's profile
 * through this.
 *
 * Name goes to Clerk (it owns names); everything else to the site's database.
 */
export async function saveOwnProfile(input: unknown): Promise<ActionResult> {
  return withPermission(null, async (viewer) => {
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const values = parsed.data;

    const named = await updateAccountName(viewer.userId, { firstName: values.firstName, lastName: values.lastName });
    if (!named.ok) return { ok: false, error: "Your name could not be saved. Please try again." };

    // "How do you play?" is only on a musician's form; for anyone else keep
    // whatever was saved before rather than wiping it.
    const existing = await getProfile(viewer.env, viewer.userId);
    const isMusician = viewer.roleKeys.includes(MUSICIAN_ROLE);

    // At most one primary instrument.
    let primaryTaken = false;
    const instruments = values.instruments.map((item) => {
      const isPrimary = item.isPrimary && !primaryTaken;
      if (isPrimary) primaryTaken = true;
      return { ...item, isPrimary };
    });

    await saveProfile(
      viewer.env,
      viewer.userId,
      {
        middleName: values.middleName,
        preferredName: values.preferredName,
        bio: values.bio,
        phone: values.phone,
        voicePart: values.voicePart,
        serviceAvailability: [...new Set(values.serviceAvailability)],
        learningStyle: isMusician ? values.learningStyle : existing.learningStyle,
        theoryLevel: values.theoryLevel,
        readsSheetMusic: values.readsSheetMusic,
      },
      instruments,
    );

    revalidatePath("/account");
    return { ok: true, value: null, message: "Your profile has been saved." };
  });
}
