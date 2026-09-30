import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

import { KeepScrollOnAutofocus } from "@/components/account/KeepScrollOnAutofocus";
import { AccountsUnavailable, RequestAccountPrompt } from "@/components/account/Notices";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { accountContent } from "@/content/account";
import { requestAccountsStatus } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: accountContent.login.title,
  description: accountContent.login.lead,
  alternates: { canonical: "/login" },
  robots: { index: false, follow: false },
};

/**
 * /login - Clerk's sign-in form, dressed as the site. There is no sign-up
 * here: accounts are invite-only, so the only way in for someone new is
 * "Request one!".
 *
 * A visitor sent here from a members' page arrives with ?redirect_url=...,
 * which Clerk follows after signing in, so they land where they were going.
 */
export default async function LoginPage() {
  const status = await requestAccountsStatus();
  const { login } = accountContent;

  return (
    <PageTransition>
      <KeepScrollOnAutofocus />
      <Container size="narrow" className="max-w-md pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow={login.eyebrow} title={login.title} align="center">
          <p className="text-base">{login.lead}</p>
        </SectionHeading>

        <div className="mt-10">
          {status.available ? (
            <Card className="p-6 sm:p-8">
              <SignIn routing="path" path="/login" withSignUp={false} />
            </Card>
          ) : (
            <AccountsUnavailable />
          )}
        </div>

        <RequestAccountPrompt className="mt-6" />
      </Container>
    </PageTransition>
  );
}
