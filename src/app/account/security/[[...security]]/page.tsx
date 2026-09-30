import { UserProfile } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { clerkProfileAppearance } from "@/lib/auth/appearance";
import { requireViewer } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Password & security",
  robots: { index: false, follow: false },
};

/**
 * /account/security - Clerk's own screen for the things Clerk owns: password,
 * email addresses and signed-in devices.
 */
export default async function SecurityPage() {
  await requireViewer("/account/security");

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow="Your account" title="Password & security">
          <p className="text-base">
            Change your password, email address and signed-in devices.{" "}
            <Link href="/account" className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark">
              Back to your account
            </Link>
          </p>
        </SectionHeading>
        <div className="mt-10 flex justify-center">
          <UserProfile routing="path" path="/account/security" appearance={clerkProfileAppearance} />
        </div>
      </Container>
    </PageTransition>
  );
}
