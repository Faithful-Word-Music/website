import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";

import { ProfileForm } from "@/components/account/ProfileForm";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { accountContent } from "@/content/account";
import { MUSICIAN_ROLE } from "@/lib/auth/permissions";
import { requireViewer } from "@/lib/auth/session";
import { getProfile, getUserInstruments, listOptions } from "@/lib/auth/store";

const copy = accountContent.profile;

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};

/**
 * /profile/edit - the signed-in person edits their own profile.
 *
 * ?welcome=1 is where a brand-new member lands straight after creating their
 * account from an invitation (signUpFallbackRedirectUrl in layout.tsx): the
 * same form, introduced as setting up, and saving (or skipping) carries on
 * to their Dashboard.
 */
export default async function EditProfilePage({ searchParams }: PageProps<"/profile/edit">) {
  const viewer = await requireViewer("/profile/edit");
  const welcome = (await searchParams).welcome === "1";
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
        {welcome ? (
          <SectionHeading as="h1" eyebrow={copy.welcome.eyebrow} title={copy.welcome.title}>
            <p className="text-base">{copy.welcome.lead}</p>
          </SectionHeading>
        ) : (
          <SectionHeading as="h1" eyebrow={copy.title} title={copy.editTitle}>
            <p className="text-base">{copy.editLead}</p>
          </SectionHeading>
        )}
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
            welcome={welcome}
          />
        </div>
      </Container>
    </PageTransition>
  );
}
