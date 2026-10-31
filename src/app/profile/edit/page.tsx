import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProfileEditor } from "@/components/account/profile/ProfileEditor";
import { BackLink } from "@/components/ui/BackLink";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { accountContent } from "@/content/account";
import { loadOwnProfileForm } from "@/lib/auth/profile-load";
import { PROFILE_GATE_EXEMPT, requireViewer } from "@/lib/auth/session";

const copy = accountContent.profile;

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};

/**
 * /profile/edit - the signed-in person edits their own profile, a section
 * at a time (ProfileEditor). Exempt from the profile gate: it is one of the
 * places an overdue profile is finished.
 *
 * ?welcome=1 was where new members used to land; it now goes to onboarding.
 */
export default async function EditProfilePage({ searchParams }: PageProps<"/profile/edit">) {
  const viewer = await requireViewer("/profile/edit", PROFILE_GATE_EXEMPT);
  if ((await searchParams).welcome === "1") redirect("/welcome");
  const form = await loadOwnProfileForm(viewer);
  if (!form) return null;

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <BackLink fallback="/profile" />
        <SectionHeading as="h1" eyebrow={copy.title} title={copy.editTitle}>
          <p className="text-base">{copy.editLead}</p>
        </SectionHeading>
        <div className="mt-10">
          <ProfileEditor
            initial={form.initial}
            instrumentOptions={form.instrumentOptions}
            show={form.show}
            isMusician={form.isMusician}
            required={form.status.applicable}
          />
        </div>
      </Container>
    </PageTransition>
  );
}
