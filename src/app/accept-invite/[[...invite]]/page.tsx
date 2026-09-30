import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

import { KeepScrollOnAutofocus } from "@/components/account/KeepScrollOnAutofocus";
import { AccountsUnavailable, RequestAccountPrompt } from "@/components/account/Notices";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { accountContent } from "@/content/account";
import { requestAccountsStatus } from "@/lib/auth/session";

const copy = accountContent.acceptInvite;

export const metadata: Metadata = {
  title: copy.title,
  robots: { index: false, follow: false },
};

/**
 * /accept-invite - where a Clerk invitation email lands (with ?__clerk_ticket=...).
 *
 * This is the only place an account can be created, and only with a valid
 * invitation: the Clerk dashboard's Access mode is Invite-only, so Clerk
 * itself refuses anyone without one, whatever this page shows. Invalid,
 * expired or already-used links are reported by Clerk's form; the note below
 * it says what to do next.
 */
export default async function AcceptInvitePage({ params, searchParams }: PageProps<"/accept-invite/[[...invite]]">) {
  const status = await requestAccountsStatus();
  const [{ invite }, query] = await Promise.all([params, searchParams]);
  const hasTicket = typeof query.__clerk_ticket === "string" && query.__clerk_ticket !== "";
  // Later steps (e.g. /accept-invite/continue) carry no ticket in the URL.
  const isLaterStep = (invite?.length ?? 0) > 0;

  return (
    <PageTransition>
      <KeepScrollOnAutofocus />
      <Container size="narrow" className="max-w-md pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow={copy.eyebrow} title={copy.title} align="center">
          <p className="text-base">{copy.lead}</p>
        </SectionHeading>

        <div className="mt-10">
          {!status.available ? (
            <AccountsUnavailable />
          ) : hasTicket || isLaterStep ? (
            <>
              <Card className="p-6 sm:p-8">
                <SignUp routing="path" path="/accept-invite" signInUrl="/login" />
              </Card>
              <p className="mt-6 text-center text-sm text-muted">{copy.trouble}</p>
              <p className="mt-3 text-center text-sm text-muted">
                <Link href="/login" className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark">
                  Log in
                </Link>
              </p>
            </>
          ) : (
            <Card className="p-6 text-center sm:p-8">
              <p className="font-display text-xl text-ink">{copy.noTicket.title}</p>
              <p className="mx-auto mt-3 max-w-sm text-muted">{copy.noTicket.body}</p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <ButtonLink href="/login">Log in</ButtonLink>
                <ButtonLink href="/request-access" variant="secondary">
                  Request an account
                </ButtonLink>
              </div>
            </Card>
          )}
        </div>

        {status.available && (hasTicket || isLaterStep) ? <RequestAccountPrompt className="mt-3" /> : null}
      </Container>
    </PageTransition>
  );
}
