import Link from "next/link";
import type { ReactNode } from "react";

import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SectionNav } from "@/components/ui/SectionNav";
import { servicePlannerContent } from "@/content/service-planner";

const copy = servicePlannerContent;

/** The planner's sections. The Archive is the site's own (shared with musicians), so it lives under /song-list. */
export const PLANNER_TABS = [
  { href: "/service-planner", label: copy.tabs.plan },
  { href: "/service-planner/inserts", label: copy.tabs.inserts },
  { href: "/song-list/archive/services", label: copy.tabs.archive },
];

/**
 * The frame the planner's section pages share: the heading, the Plan ·
 * Inserts · Archive links (SectionNav), and - at the far end of that row, so
 * it sits in one place on every page - the way to the published song list.
 */
export function PlannerShell({ children, lead }: { children: ReactNode; lead?: string }) {
  return (
    <PageTransition>
      <Container size="wide" className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow={copy.eyebrow} title={copy.title} className="max-w-3xl">
          <p className="text-base sm:text-lg">{lead ?? copy.lead}</p>
        </SectionHeading>

        <div className="mt-10">
          <SectionNav
            items={PLANNER_TABS}
            label={copy.tabs.label}
            trailing={
              <Link
                href="/song-list"
                className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                {copy.viewPublished}
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
            }
          />
        </div>

        <div className="mt-8">{children}</div>
      </Container>
    </PageTransition>
  );
}
