/**
 * Who may see which part of a person's profile. THE ONE PLACE this is decided.
 *
 * A profile is read by different audiences:
 *
 *   self     - the owner, on /profile. Sees everything.
 *   staff    - someone holding `view_profiles` (by default only
 *              administrators), on /admin/users/<id>. Sees everything a
 *              ministry needs to organise its people.
 *   members  - other signed-in members. Not reachable yet: member profiles
 *              (/people, /people/<id>) will come with their own permission.
 *              Only the fields listed for "members" below will ever reach them.
 *
 * Pages filter with visibleProfile() ON THE SERVER, before rendering, so a
 * field an audience may not see is never sent to its browser. ProfileView
 * then simply shows whatever it was given.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import type { Permission } from "./permissions";
import type { LearningStyle, Proficiency, ServiceAvailability, TheoryLevel, VoicePart } from "./profile-options";

export type ProfileAudience = "self" | "staff" | "members";

/** Everything a profile can show, gathered from Clerk and the site's tables. */
export interface ProfileRecord {
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  imageUrl: string;
  email: string | null;
  bio: string;
  phone: string;
  voicePart: VoicePart | null;
  readsSheetMusic: boolean | null;
  theoryLevel: TheoryLevel | null;
  learningStyle: LearningStyle | null;
  serviceAvailability: ServiceAvailability[];
  titles: Array<{ titleId: number; label: string; isPrimary: boolean }>;
  instruments: Array<{ instrumentId: number; label: string; proficiency: Proficiency; isPrimary: boolean }>;
  roleLabels: string[];
}

/** Gathers the pieces pages already load into one ProfileRecord. */
export function toProfileRecord(
  person: { firstName: string; lastName: string; email: string | null; imageUrl: string },
  profile: Omit<ProfileRecord, "firstName" | "lastName" | "email" | "imageUrl" | "titles" | "instruments" | "roleLabels">,
  extra: Pick<ProfileRecord, "titles" | "instruments" | "roleLabels">,
): ProfileRecord {
  return {
    firstName: person.firstName,
    middleName: profile.middleName,
    lastName: person.lastName,
    preferredName: profile.preferredName,
    imageUrl: person.imageUrl,
    email: person.email,
    bio: profile.bio,
    phone: profile.phone,
    voicePart: profile.voicePart,
    readsSheetMusic: profile.readsSheetMusic,
    theoryLevel: profile.theoryLevel,
    learningStyle: profile.learningStyle,
    serviceAvailability: profile.serviceAvailability,
    titles: extra.titles,
    instruments: extra.instruments,
    roleLabels: extra.roleLabels,
  };
}

/** A profile as one audience sees it: the fields it may not see are absent. */
export type VisibleProfile = Partial<Omit<ProfileRecord, "instruments">> & {
  /** Instruments; `proficiency` is absent when the audience may not see skill levels. */
  instruments?: Array<{ instrumentId: number; label: string; proficiency?: Proficiency; isPrimary: boolean }>;
};

type Field = keyof ProfileRecord | "instrumentProficiency";

const EVERYONE: readonly ProfileAudience[] = ["self", "staff", "members"];
const PRIVATE: readonly ProfileAudience[] = ["self", "staff"];

/**
 * The classification. "members" means any signed-in member, once member
 * profiles exist - so only put a field there if every member may see it.
 */
export const PROFILE_FIELD_AUDIENCES: Record<Field, readonly ProfileAudience[]> = {
  firstName: EVERYONE,
  middleName: EVERYONE,
  lastName: EVERYONE,
  preferredName: EVERYONE,
  imageUrl: EVERYONE,
  bio: EVERYONE,
  titles: EVERYONE,
  instruments: EVERYONE,
  voicePart: EVERYONE,

  email: PRIVATE,
  phone: PRIVATE,
  readsSheetMusic: PRIVATE,
  theoryLevel: PRIVATE,
  learningStyle: PRIVATE,
  // Normal services. Also shared, separately, with everyone on the
  // availability board (src/lib/availability/), who see each other's normal
  // pattern and exceptions there - the music team, not every member.
  serviceAvailability: PRIVATE,
  instrumentProficiency: PRIVATE,
  roleLabels: PRIVATE,
};

export function canSee(audience: ProfileAudience, field: Field): boolean {
  return PROFILE_FIELD_AUDIENCES[field].includes(audience);
}

/** The profile with every field this audience may not see removed. */
export function visibleProfile(profile: ProfileRecord, audience: ProfileAudience): VisibleProfile {
  const result: VisibleProfile = {};
  for (const field of Object.keys(profile) as Array<keyof ProfileRecord>) {
    if (!canSee(audience, field)) continue;
    if (field === "instruments") {
      const levels = canSee(audience, "instrumentProficiency");
      result.instruments = profile.instruments.map(({ proficiency, ...rest }) =>
        levels ? { ...rest, proficiency } : rest,
      );
    } else {
      (result as Record<string, unknown>)[field] = profile[field];
    }
  }
  return result;
}

/**
 * Which audience `viewer` is for `ownerId`'s profile, or null when they may
 * not see it at all. Decided by permission, never by role name. Member
 * profiles will add their permission here (returning "members").
 */
export function audienceFor(
  viewer: { userId: string; can(permission: Permission): boolean },
  ownerId: string,
): ProfileAudience | null {
  if (viewer.userId === ownerId) return "self";
  if (viewer.can("view_profiles")) return "staff";
  return null;
}
