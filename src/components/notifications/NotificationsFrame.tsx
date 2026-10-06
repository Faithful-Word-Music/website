import type { ReactNode } from "react";

import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SectionNav } from "@/components/ui/SectionNav";
import { notificationsContent } from "@/content/notifications";

const copy = notificationsContent;

/**
 * The frame the two notification pages share: the heading, and the
 * Notifications · Settings links between them (SectionNav, the navigation
 * within a feature).
 */
export function NotificationsFrame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <PageTransition>
      <Container size="narrow" className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow={copy.eyebrow} title={title}>
          <p className="text-base">{lead}</p>
        </SectionHeading>
        <div className="mt-8">
          <SectionNav
            label={copy.nav.label}
            items={[
              { href: "/notifications", label: copy.nav.all },
              { href: "/notifications/settings", label: copy.nav.settings },
            ]}
          />
        </div>
        <div className="mt-8">{children}</div>
      </Container>
    </PageTransition>
  );
}
