"use server";

import { revalidatePath } from "next/cache";

import { profileSetupContent, requirementLabel } from "@/content/profile-setup";
import { updateAccountName } from "@/lib/auth/clerk";
import {
  aboutSchema,
  firstIssue,
  musicSchema,
  PROFILE_SECTIONS,
  sharedMusicSchema,
  songLeadingSchema,
  type ProfileSection,
} from "@/lib/auth/forms";
import { MUSICIAN_ROLE } from "@/lib/auth/permissions";
import {
  applicableRequirements,
  LEAD_SONGS,
  missingInSection,
  participation,
  type RequirementFacts,
  type RequirementKey,
} from "@/lib/auth/profile-requirements";
import { markOnboardingStep, resetOnboardingSteps, saveSongLeading } from "@/lib/auth/requirements-store";
import { ACTION_ERRORS, withPermissionExempt, type ActionResult, type Viewer } from "@/lib/auth/session";
import { updateProfileFields } from "@/lib/auth/store";
import { ACK_STEPS, OPTIONAL_STEPS, STARTED, type AckStep } from "@/lib/auth/onboarding";

/**
 * Saving the signed-in person's OWN profile, one section at a time - from
 * the profile editor and from onboarding (/welcome), which share these.
 * The user ID always comes from the session, never from the form.
 *
 * Each section writes only its own fields, so saving one never touches
 * another (or normal availability, which has its own write path). Names go
 * to Clerk, which owns them; everything else to the site's database.
 *
 * Exempt from the profile gate: this is how an overdue profile is finished.
 * A saved answer counts at once - the gate is worked out afresh on every
 * request, on every device.
 */

const copy = profileSetupContent.sections;

function refreshProfile(): void {
  revalidatePath("/profile");
  revalidatePath("/profile/edit");
  revalidatePath("/welcome");
  revalidatePath("/dashboard");
}

const isMusician = (viewer: Viewer) => viewer.roleKeys.includes(MUSICIAN_ROLE);

/**
 * Refuses a save that would leave a required answer for this person empty -
 * checked here, on the server, whatever the form sent. Optional questions
 * may still be left blank or cleared.
 */
function refuseMissing(
  viewer: Viewer,
  section: "about" | "music" | "shared" | "leading",
  values: Partial<RequirementFacts>,
): { ok: false; error: string } | null {
  const needs = new Set<RequirementKey>(applicableRequirements(participation({ roleKeys: viewer.roleKeys, explicit: viewer.explicit })));
  const missing = missingInSection(section, values, needs);
  if (missing.length === 0) return null;
  return { ok: false, error: copy.requiredMissing.replace("{items}", missing.map((key) => requirementLabel(key).toLowerCase()).join(", ")) };
}
const leadsSongs = (viewer: Viewer) => viewer.explicit.has(LEAD_SONGS);

export async function saveProfileSection(section: ProfileSection, input: unknown): Promise<ActionResult> {
  return withPermissionExempt(null, async (viewer) => {
    if (!(PROFILE_SECTIONS as readonly string[]).includes(section)) return { ok: false, error: ACTION_ERRORS.failed };

    switch (section) {
      case "about": {
        const parsed = aboutSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
        const values = parsed.data;
        const refused = refuseMissing(viewer, "about", { firstName: values.firstName, lastName: values.lastName });
        if (refused) return refused;
        const named = await updateAccountName(viewer.userId, { firstName: values.firstName, lastName: values.lastName });
        if (!named.ok) return { ok: false, error: copy.nameFailed };
        await updateProfileFields(viewer.env, viewer.userId, {
          middleName: values.middleName,
          preferredName: values.preferredName,
          bio: values.bio,
          phone: values.phone,
        });
        break;
      }
      case "music": {
        const parsed = musicSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
        const refusedMusic = refuseMissing(viewer, "music", parsed.data);
        if (refusedMusic) return refusedMusic;
        // "How do you play?" belongs to musicians; anyone else's earlier answer is kept, not wiped.
        await updateProfileFields(
          viewer.env,
          viewer.userId,
          isMusician(viewer) ? { learningStyle: parsed.data.learningStyle } : {},
          parsed.data.instruments,
        );
        break;
      }
      case "shared": {
        const parsed = sharedMusicSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
        const refusedShared = refuseMissing(viewer, "shared", parsed.data);
        if (refusedShared) return refusedShared;
        await updateProfileFields(viewer.env, viewer.userId, parsed.data);
        break;
      }
      case "leading": {
        // Only for someone who may be assigned to lead songs.
        if (!leadsSongs(viewer)) return { ok: false, error: ACTION_ERRORS.forbidden };
        const parsed = songLeadingSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
        const refusedLeading = refuseMissing(viewer, "leading", { leading: parsed.data });
        if (refusedLeading) return refusedLeading;
        await saveSongLeading(viewer.env, viewer.userId, parsed.data);
        break;
      }
    }

    refreshProfile();
    return { ok: true, value: null, message: copy.saved };
  });
}

/**
 * Records that an onboarding step was seen - continuing or skipping, both
 * count. For About you and Your ministry this only moves the walkthrough on:
 * their required answers count only once saved (onboarding.ts).
 */
export async function completeOnboardingStep(step: AckStep): Promise<ActionResult> {
  return withPermissionExempt(null, async (viewer) => {
    if (!(ACK_STEPS as readonly string[]).includes(step)) return { ok: false, error: ACTION_ERRORS.failed };
    await markOnboardingStep(viewer.env, viewer.userId, step);
    revalidatePath("/welcome");
    return { ok: true, value: null };
  });
}

/** "Replay the introduction": the optional walkthrough starts again; nothing saved is touched. */
export async function replayIntroduction(): Promise<ActionResult> {
  return withPermissionExempt(null, async (viewer) => {
    await resetOnboardingSteps(viewer.env, viewer.userId, OPTIONAL_STEPS);
    await markOnboardingStep(viewer.env, viewer.userId, STARTED);
    revalidatePath("/welcome");
    return { ok: true, value: null };
  });
}
