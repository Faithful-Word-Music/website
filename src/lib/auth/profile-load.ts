import "server-only";

import { currentUser } from "@clerk/nextjs/server";

import type { EditorInitial } from "@/components/account/profile/ProfileEditor";

import { MUSICIAN_ROLE } from "./permissions";
import type { ServiceAvailability } from "./profile-options";
import { LEAD_SONGS, type ProfileStatus } from "./profile-requirements";
import { getSongLeading } from "./requirements-store";
import { viewerProfileStatus, type Viewer } from "./session";
import { getProfile, getUserInstruments, listOptions } from "./store";

/**
 * Everything the profile editor and onboarding need for the signed-in
 * person, prefilled from what is saved - so revisiting a section or a step
 * never shows (or saves) a blank over an answer.
 */
export interface OwnProfileForm {
  initial: EditorInitial;
  instrumentOptions: Array<{ id: number; label: string }>;
  status: ProfileStatus;
  isMusician: boolean;
  isSongLeader: boolean;
  show: { music: boolean; leading: boolean };
  normal: { services: ServiceAvailability[]; reviewed: boolean };
  firstName: string;
}

export async function loadOwnProfileForm(viewer: Viewer): Promise<OwnProfileForm | null> {
  const [user, profile, instruments, options, leading, status] = await Promise.all([
    currentUser(),
    getProfile(viewer.env, viewer.userId),
    getUserInstruments(viewer.env, viewer.userId),
    listOptions(viewer.env, "instruments"),
    getSongLeading(viewer.env, viewer.userId),
    viewerProfileStatus(viewer),
  ]);
  if (!user) return null;

  // Archived instruments stay listed for anyone who already plays them.
  const chosen = new Set(instruments.map((item) => item.instrumentId));
  const instrumentOptions = options
    .filter((option) => !option.archived || chosen.has(option.id))
    .map((option) => ({ id: option.id, label: option.label }));

  const isMusician = viewer.roleKeys.includes(MUSICIAN_ROLE);
  const isSongLeader = viewer.explicit.has(LEAD_SONGS);

  return {
    initial: {
      about: {
        firstName: user.firstName ?? "",
        middleName: profile.middleName,
        lastName: user.lastName ?? "",
        preferredName: profile.preferredName,
        bio: profile.bio,
        phone: profile.phone,
      },
      music: {
        instruments: instruments.map(({ instrumentId, proficiency, isPrimary }) => ({ instrumentId, proficiency, isPrimary })),
        learningStyle: profile.learningStyle,
      },
      shared: { readsSheetMusic: profile.readsSheetMusic, voicePart: profile.voicePart, theoryLevel: profile.theoryLevel },
      leading,
    },
    instrumentOptions,
    status,
    isMusician,
    isSongLeader,
    // A role taken away hides its section but keeps its answers: nothing is deleted.
    show: { music: isMusician || instruments.length > 0, leading: isSongLeader },
    normal: { services: profile.serviceAvailability, reviewed: profile.availabilityReviewedAt !== null },
    firstName: profile.preferredName || user.firstName || "",
  };
}

