import { UserProfile } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

import { InstallAppSection } from "@/components/account/InstallApp";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { accountContent } from "@/content/account";
import { notificationsContent } from "@/content/notifications";
import { clerkProfileAppearance } from "@/lib/auth/appearance";
import { PROFILE_GATE_EXEMPT, requireViewer } from "@/lib/auth/session";

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
  // Exempt from the profile gate: signing in, passwords and devices must always be reachable.
  const viewer = await requireViewer("/account", PROFILE_GATE_EXEMPT);
  const places = [
    { href: "/profile", title: copy.places.profile.title, lead: copy.places.profile.lead },
    { href: "/notifications/settings", title: notifications.accountLink, lead: notifications.accountLead },
    ...(viewer.can("view_availability")
      ? [{ href: "/availability#normal", title: copy.places.availability.title, lead: copy.places.availability.lead }]
      : []),
  ];

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
        {/* The site's own settings, each on its own page; then how you sign in, which Clerk owns. */}
        <nav aria-label={copy.placesLabel} className="mt-10">
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {places.map((place) => (
              <li key={place.href}>
                <Link href={place.href} className="group block h-full rounded-card focus-visible:outline-none">
                  <Card className="h-full p-5 transition-colors group-hover:border-gold group-focus-visible:ring-2 group-focus-visible:ring-gold/40 sm:p-6">
                    <h2 className="font-display text-xl text-ink">{place.title}</h2>
                    <p className="mt-1 text-sm text-muted">{place.lead}</p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <InstallAppSection className="mt-10" />
        <section aria-labelledby="account-signin" className="mt-12">
          <h2 id="account-signin" className="font-display text-2xl text-ink">
            {copy.signInTitle}
          </h2>
          <p className="mt-1 text-sm text-muted">{copy.signInLead}</p>
          <div className="mt-6 flex justify-center">
            <UserProfile routing="path" path="/account" appearance={clerkProfileAppearance} />
          </div>
        </section>
      </Container>
    </PageTransition>
  );
}
