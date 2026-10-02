import { UserProfile } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

import { InstallAppSection } from "@/components/account/InstallApp";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { accountContent } from "@/content/account";
import { clerkProfileAppearance } from "@/lib/auth/appearance";
import { requireViewer } from "@/lib/auth/session";

const copy = accountContent.settings;

export const metadata: Metadata = {
  title: copy.title,
  robots: { index: false, follow: false },
};

/**
 * /account - account settings: how the person signs in, not who they are.
 *
 * Profile (/profile) is the person in the ministry - names, titles,
 * instruments. Account is the login behind it, which Clerk owns: email
 * addresses, password and signed-in devices, shown in Clerk's own screen.
 * Account-level settings the site adds later (notification preferences,
 * whether other members may see your profile) belong on this page too.
 *
 * "Install the app" sits above Clerk's screen, on devices that can install
 * the site as an app and are not already running it (src/lib/install.ts).
 */
export default async function AccountSettingsPage() {
  await requireViewer("/account");

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow={copy.eyebrow} title={copy.title}>
          <p className="text-base">
            {copy.lead}{" "}
            <Link href="/profile" className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark">
              {copy.profileLink}
            </Link>
          </p>
        </SectionHeading>
        <InstallAppSection className="mt-10" />
        <div className="mt-10 flex justify-center">
          <UserProfile routing="path" path="/account" appearance={clerkProfileAppearance} />
        </div>
      </Container>
    </PageTransition>
  );
}
