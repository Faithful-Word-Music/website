import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";

import { Notice } from "@/components/account/Notices";
import { ProfileView } from "@/components/account/ProfileView";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { accountContent } from "@/content/account";
import { summarize } from "@/lib/auth/clerk";
import { MEMBER_ROLE } from "@/lib/auth/permissions";
import { missingProfileItems } from "@/lib/auth/profile-completeness";
import { normalizeEmail } from "@/lib/auth/request-status";
import { requireViewer } from "@/lib/auth/session";
import { activateRequestsFor, getProfile, getUserInstruments, getUserTitles, listRoles } from "@/lib/auth/store";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

/** /account - the signed-in person's own profile. Nobody else's is reachable from here. */
export default async function AccountPage() {
  const viewer = await requireViewer("/account");
  const user = await currentUser();
  if (!user) return null;
  const person = summarize(user);

  // The first visit after accepting an invitation closes the request that led to it.
  await activateRequestsFor(viewer.env, person.emails.map(normalizeEmail));

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
  const copy = accountContent.account;

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow={copy.eyebrow} title={`Welcome, ${profile.preferredName || person.firstName || "friend"}`} />

        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/account/edit">{copy.edit}</ButtonLink>
          <ButtonLink href="/account/security" variant="secondary">
            {copy.security}
          </ButtonLink>
          {viewer.canAccessAdmin ? (
            <ButtonLink href="/admin" variant="secondary">
              {copy.admin}
            </ButtonLink>
          ) : null}
        </div>

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
            person={person}
            profile={profile}
            instruments={instruments}
            titles={titles}
            roleKeys={viewer.roleKeys}
            roleLabels={roleLabels}
          />
        </div>
      </Container>
    </PageTransition>
  );
}
