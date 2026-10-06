import { UserProfile } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

import { InstallAppSection } from "@/components/account/InstallApp";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { accountContent } from "@/content/account";
import { notificationsContent } from "@/content/notifications";
import { clerkProfileAppearance } from "@/lib/auth/appearance";
import { requireViewer } from "@/lib/auth/session";

const copy = accountContent.settings;
const notifications = notificationsContent.settings;

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
 * Account-level settings the site adds are reached from this page: notification
 * settings have their own (/notifications/settings), linked here; whether
 * other members may see your profile belongs here too, when it is built.
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
        {/* Notifications have pages of their own; this is the way to their settings. */}
        <section aria-labelledby="account-notifications" className="mt-10 [section+&]:mt-6">
          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h2 id="account-notifications" className="font-display text-xl text-ink">
                {notifications.accountLink}
              </h2>
              <p className="mt-1 text-sm text-muted">{notifications.accountLead}</p>
            </div>
            <ButtonLink href="/notifications/settings" variant="secondary" className="shrink-0">
              {notifications.accountLink}
            </ButtonLink>
          </Card>
        </section>
        <div className="mt-10 flex justify-center">
          <UserProfile routing="path" path="/account" appearance={clerkProfileAppearance} />
        </div>
      </Container>
    </PageTransition>
  );
}
