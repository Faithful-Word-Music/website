import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";

import { ProfileForm } from "@/components/account/ProfileForm";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { MUSICIAN_ROLE, SONG_LEADER_ROLE } from "@/lib/auth/permissions";
import { requireViewer } from "@/lib/auth/session";
import { getProfile, getUserInstruments, listOptions } from "@/lib/auth/store";

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};

/** /account/edit - the signed-in person edits their own profile. */
export default async function EditProfilePage() {
  const viewer = await requireViewer("/account/edit");
  const [user, profile, instruments, options] = await Promise.all([
    currentUser(),
    getProfile(viewer.env, viewer.userId),
    getUserInstruments(viewer.env, viewer.userId),
    listOptions(viewer.env, "instruments"),
  ]);
  if (!user) return null;

  // Archived instruments stay listed for anyone who already plays them.
  const chosen = new Set(instruments.map((item) => item.instrumentId));
  const instrumentOptions = options
    .filter((option) => !option.archived || chosen.has(option.id))
    .map((option) => ({ id: option.id, label: option.label }));

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow="Your account" title="Edit profile">
          <p className="text-base">Only you and the ministry&apos;s administrators can see your profile.</p>
        </SectionHeading>
        <div className="mt-10">
          <ProfileForm
            initial={{
              firstName: user.firstName ?? "",
              middleName: profile.middleName,
              lastName: user.lastName ?? "",
              preferredName: profile.preferredName,
              bio: profile.bio,
              phone: profile.phone,
              voicePart: profile.voicePart,
              serviceAvailability: profile.serviceAvailability,
              learningStyle: profile.learningStyle,
              theoryLevel: profile.theoryLevel,
              readsSheetMusic: profile.readsSheetMusic,
              instruments: instruments.map(({ instrumentId, proficiency, isPrimary }) => ({
                instrumentId,
                proficiency,
                isPrimary,
              })),
            }}
            instrumentOptions={instrumentOptions}
            isMusician={viewer.roleKeys.includes(MUSICIAN_ROLE)}
            isSongLeader={viewer.roleKeys.includes(SONG_LEADER_ROLE)}
          />
        </div>
      </Container>
    </PageTransition>
  );
}
