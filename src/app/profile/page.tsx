import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";

import { Notice } from "@/components/account/Notices";
import { ProfileView } from "@/components/account/ProfileView";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { accountContent } from "@/content/account";
import { activateOwnRequests } from "@/lib/auth/activation";
import { summarize } from "@/lib/auth/clerk";
import { MEMBER_ROLE, MUSICIAN_ROLE } from "@/lib/auth/permissions";
import { missingProfileItems } from "@/lib/auth/profile-completeness";
import { toProfileRecord, visibleProfile } from "@/lib/auth/profile-visibility";
import { requireViewer } from "@/lib/auth/session";
import { getProfile, getUserInstruments, getUserTitles, listRoles } from "@/lib/auth/store";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

/**
 * /profile - the signed-in person's own profile: who they are in the music
 * ministry. Nobody else's is reachable from here. (How they sign in lives on
 * /account; what is coming up for them on /dashboard.)
 */
export default async function ProfilePage() {
  const viewer = await requireViewer("/profile");
  const user = await currentUser();
  if (!user) return null;
  const person = summarize(user);

  await activateOwnRequests(viewer, person.emails);

  const [profile, instruments, titles, roles] = await Promise.all([
    getProfile(viewer.env, viewer.userId),
    getUserInstruments(viewer.env, viewer.userId),
    getUserTitles(viewer.env, viewer.userId),
    listRoles(viewer.env),
  ]);

  const roleLabels = roles
    .filter((role) => viewer.roleKeys.includes(role.key) || role.key === MEMBER_ROLE)
    .map((role) => role.label);
  const missing = missingProfileItems({
    roleKeys: viewer.roleKeys,
    hasName: Boolean(person.firstName && person.lastName),
    hasImage: person.hasImage,
    instrumentCount: instruments.length,
    learningStyle: profile.learningStyle,
    theoryLevel: profile.theoryLevel,
    readsSheetMusic: profile.readsSheetMusic,
  });
  const copy = accountContent.profile;

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" title={copy.title}>
          <p className="text-base">
            <Link href="/account" className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-gold">
              {copy.settingsLink}
            </Link>
          </p>
        </SectionHeading>

        {missing.length > 0 ? (
          <Notice title={copy.completeTitle} className="mt-8">
            <p>{copy.completeBody}</p>
            <ul className="mt-2 list-inside list-disc">
              {missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Notice>
        ) : null}

        <div className="mt-8">
          <ProfileView
            profile={visibleProfile(toProfileRecord(person, profile, { titles, instruments, roleLabels }), "self")}
            isMusician={viewer.roleKeys.includes(MUSICIAN_ROLE)}
            actions={<ButtonLink href="/profile/edit">{copy.edit}</ButtonLink>}
          />
        </div>
      </Container>
    </PageTransition>
  );
}
