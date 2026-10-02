import { z } from "zod";

import { isPermission } from "./permissions";
import {
  LEARNING_STYLES,
  PROFICIENCIES,
  PROFILE_LIMITS,
  THEORY_LEVELS,
  VOICE_PARTS,
} from "./profile-options";

/**
 * Validation for every account form. The server actions parse with these;
 * nothing a browser sends is trusted as-is.
 */

const text = (max: number, label: string) =>
  z.string().trim().max(max, `Please keep ${label} under ${max} characters.`);

const values = <T extends { value: string }>(options: readonly T[]) =>
  options.map((option) => option.value) as [T["value"], ...T["value"][]];

export const profileSchema = z.object({
  firstName: text(PROFILE_LIMITS.firstName, "your first name").min(1, "Please enter your first name."),
  middleName: text(PROFILE_LIMITS.middleName, "your middle name"),
  lastName: text(PROFILE_LIMITS.lastName, "your last name").min(1, "Please enter your last name."),
  preferredName: text(PROFILE_LIMITS.preferredName, "your preferred name"),
  bio: text(PROFILE_LIMITS.bio, "your bio"),
  phone: text(PROFILE_LIMITS.phone, "your phone number").regex(
    /^[\d\s()+.-]*$/,
    "Please use only digits, spaces and + ( ) - in your phone number.",
  ),
  voicePart: z.enum(values(VOICE_PARTS)).nullable(),
  // Normal service availability is not part of the profile form: it is
  // edited on /availability (src/lib/availability/forms.ts).
  learningStyle: z.literal(LEARNING_STYLES.map((style) => style.value)).nullable(),
  theoryLevel: z.enum(values(THEORY_LEVELS)).nullable(),
  readsSheetMusic: z.boolean().nullable(),
  instruments: z
    .array(
      z.object({
        instrumentId: z.number().int().positive(),
        proficiency: z.enum(values(PROFICIENCIES)),
        isPrimary: z.boolean(),
      }),
    )
    .max(20),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

export const optionLabelSchema = text(PROFILE_LIMITS.optionLabel, "the name").min(1, "Please enter a name.");

export const roleSchema = z.object({
  label: text(PROFILE_LIMITS.roleLabel, "the role name").min(1, "Please enter a name for the role."),
  description: text(PROFILE_LIMITS.roleDescription, "the description"),
  permissions: z.array(z.string().refine(isPermission, "Unknown permission.")).max(50),
});

export const overrideSchema = z.object({
  permission: z.string().refine(isPermission, "Unknown permission."),
  effect: z.enum(["grant", "deny"]),
  note: text(PROFILE_LIMITS.overrideNote, "the note"),
});

export const reviewNoteSchema = text(PROFILE_LIMITS.reviewNote, "the note");

export const inviteSchema = z.object({
  email: z.string().trim().min(1, "Please enter an email address.").max(254).pipe(z.email("Please enter a valid email address.")),
});

/** Clerk user IDs look like "user_2abc..."; anything else is refused before it reaches Clerk. */
export const clerkUserIdSchema = z.string().regex(/^user_[A-Za-z0-9]{10,64}$/);
export const clerkInvitationIdSchema = z.string().regex(/^inv_[A-Za-z0-9]{10,64}$/);

/** Turns a zod error into one readable sentence for a form. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}
