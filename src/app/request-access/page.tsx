import type { Metadata } from "next";

import { RequestAccessForm } from "@/components/account/RequestAccessForm";
import { AccountsUnavailable } from "@/components/account/Notices";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { accountContent } from "@/content/account";
import { requestAccountsStatus } from "@/lib/auth/session";

const copy = accountContent.requestAccess;

export const metadata: Metadata = {
  title: copy.title,
  description: copy.lead,
  alternates: { canonical: "/request-access" },
  openGraph: {
    title: `${copy.title} | ${siteConfig.name}`,
    description: copy.lead,
    url: `${siteConfig.url}/request-access`,
  },
  robots: { index: false, follow: true },
};

/** /request-access - ask for an account. An administrator reviews it; nothing is created here. */
export default async function RequestAccessPage() {
  const status = await requestAccountsStatus();

  return (
    <PageTransition>
      <Container size="narrow" className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow={copy.eyebrow} title={copy.title}>
          <p className="text-base sm:text-lg">{copy.lead}</p>
        </SectionHeading>

        <Reveal>
          {status.available ? (
            <Card className="mt-10 p-6 sm:p-8">
              <RequestAccessForm />
            </Card>
          ) : (
            <div className="mt-10">
              <AccountsUnavailable />
            </div>
          )}
        </Reveal>
      </Container>
    </PageTransition>
  );
}
