import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";

import { ProfileStatusNotice } from "@/components/account/profile/ProfileStatusNotice";
import { ReplayIntroduction } from "@/components/account/profile/ReplayIntroduction";
import { ProfileView } from "@/components/account/ProfileView";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { accountContent } from "@/content/account";
import { activateOwnRequests } from "@/lib/auth/activation";
import { summarize } from "@/lib/auth/clerk";
import { MEMBER_ROLE, MUSICIAN_ROLE } from "@/lib/auth/permissions";
import { LEAD_SONGS } from "@/lib/auth/profile-requirements";
import { toProfileRecord, visibleProfile } from "@/lib/auth/profile-visibility";
import { getSongLeading } from "@/lib/auth/requirements-store";
import { PROFILE_GATE_EXEMPT, requireViewer, viewerProfileStatus } from "@/lib/auth/session";
import { getProfile, getUserInstruments, getUserTitles, listRoles } from "@/lib/auth/store";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

/**
 * /profile - the signed-in person's own profile: who they are in the music
 * ministry, and whether anything required is still missing. Nobody else's
 * is reachable from here. (How they sign in lives on /account; what is
 * coming up for them on /dashboard.) Exempt from the profile gate.
 */
export default async function ProfilePage() {
  const viewer = await requireViewer("/profile", PROFILE_GATE_EXEMPT);
  const user = await currentUser();
  if (!user) return null;
  const person = summarize(user);

  await activateOwnRequests(viewer, person.emails);

  const [profile, instruments, titles, roles, leading, status] = await Promise.all([
    getProfile(viewer.env, viewer.userId),
    getUserInstruments(viewer.env, viewer.userId),
    getUserTitles(viewer.env, viewer.userId),
    listRoles(viewer.env),
    getSongLeading(viewer.env, viewer.userId),
    viewerProfileStatus(viewer),
  ]);

  const roleLabels = roles
    .filter((role) => viewer.roleKeys.includes(role.key) || role.key === MEMBER_ROLE)
    .map((role) => role.label);
  const isSongLeader = viewer.explicit.has(LEAD_SONGS);
  const hasLeading = Object.values(leading).some((value) => value !== null);
  const copy = accountContent.profile;
  const linkClass = "text-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-ink hover:decoration-gold";

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" title={copy.title}>
          <nav aria-label={copy.linksLabel} className="flex flex-wrap gap-x-5 gap-y-1 text-base">
            <Link href="/account" className={linkClass}>
              {copy.settingsLink}
            </Link>
            <Link href="/notifications/settings" className={linkClass}>
              {copy.notificationsLink}
            </Link>
            {viewer.can("view_availability") ? (
              <Link href="/availability#normal" className={linkClass}>
                {copy.availabilityLink}
              </Link>
            ) : null}
          </nav>
        </SectionHeading>

        <ProfileStatusNotice status={status} showComplete className="mt-8" />

        <div className="mt-8">
          <ProfileView
            profile={visibleProfile(
              toProfileRecord(person, profile, { titles, instruments, roleLabels, songLeading: isSongLeader || hasLeading ? leading : null }),
              "self",
            )}
            isMusician={viewer.roleKeys.includes(MUSICIAN_ROLE)}
            isSongLeader={isSongLeader}
            availabilityHref={viewer.can("view_availability") ? "/availability#normal" : undefined}
            actions={<ButtonLink href="/profile/edit">{copy.edit}</ButtonLink>}
          />
        </div>

        <div className="mt-8 text-sm">
          <ReplayIntroduction />
        </div>
      </Container>
    </PageTransition>
  );
}
