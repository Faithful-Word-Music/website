import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

import { KeepScrollOnAutofocus } from "@/components/account/KeepScrollOnAutofocus";
import { AccountsUnavailable, RequestAccountPrompt } from "@/components/account/Notices";
import { Logo } from "@/components/layout/Logo";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
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
 *
 * data-app-login: in the installed app, this is the whole screen, like an
 * app's sign-in screen - no header or navigation, the mark with the name
 * and tagline stacked above the form (as on the loading screen), the footer's
 * closing line (copyright and developer credit), and nothing scrolling (the app-login variant in globals.css).
 */
export default async function LoginPage() {
  const status = await requestAccountsStatus();
  const { login } = accountContent;

  return (
    <PageTransition>
      <KeepScrollOnAutofocus />
      {/* Marks this page for the app-login variant (globals.css). */}
      <span data-app-login="" hidden />
      <Container size="narrow" className="max-w-md pb-14 pt-10 sm:pb-20 sm:pt-14 app-login:py-6">
        {/* The installed app only: the app's own name, in place of the header. */}
        <div className="hidden flex-col items-center text-center app-login:flex">
          <Logo size={72} className="rounded-[16px] shadow-lift" />
          <p className="mt-4 font-display text-2xl tracking-tight text-ink">{siteConfig.name}</p>
          <p className="mt-1 text-sm text-muted">{siteConfig.tagline}</p>
        </div>

        <SectionHeading
          as="h1"
          eyebrow={login.eyebrow}
          title={login.title}
          align="center"
          // In the app the name above says whose it is, so the "Members"
          // eyebrow (the heading's first child) gives way.
          className="app-login:mt-9 app-login:[&>:first-child]:hidden"
        >
          <p className="text-base">{login.lead}</p>
        </SectionHeading>

        <div className="mt-10 app-login:mt-6">
          {status.available ? (
            <Card className="p-6 sm:p-8">
              <SignIn routing="path" path="/login" withSignUp={false} />
            </Card>
          ) : (
            <AccountsUnavailable />
          )}
        </div>

        <RequestAccountPrompt className="mt-6 app-login:mt-4" />
      </Container>
    </PageTransition>
  );
}
