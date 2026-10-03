import type { Metadata } from "next";

import { NoAccess } from "@/components/account/Notices";
import { InsertsView } from "@/components/service-planner/InsertsView";
import { PlannerShell } from "@/components/service-planner/PlannerShell";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { siteConfig } from "@/config/site";
import { servicePlannerContent } from "@/content/service-planner";
import { requireViewer } from "@/lib/auth/session";
import { loadInserts } from "@/lib/service-planner/load";
import { withoutPlan } from "@/lib/service-planner/model";

export const metadata: Metadata = {
  title: `${servicePlannerContent.inserts.title} - ${servicePlannerContent.title}`,
  robots: { index: false, follow: false },
};

/**
 * /service-planner/inserts - one insert per week, planned ahead. Only for
 * manage_service_plans: the long-range plan is the Music Director's, and
 * reaches everyone else only inside published services.
 *
 *   ?weeks=16   how many weeks to list (8 by default)
 */
export default async function InsertsPage(props: PageProps<"/service-planner/inserts">) {
  const viewer = await requireViewer("/service-planner/inserts");
  if (!viewer.can("manage_service_plans")) {
    return (
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <NoAccess />
      </Container>
    );
  }

  const params = await props.searchParams;
  const requested = Number(typeof params.weeks === "string" ? params.weeks : NaN);
  const count = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 104) : siteConfig.servicePlanner.insertWeeks;
  const data = await loadInserts(viewer, count);

  return (
    <PlannerShell lead={servicePlannerContent.inserts.lead}>
      <InsertsView
        now={data.now}
        candidates={data.candidates}
        weeks={data.weeks.map((week) => ({
          weekStart: week.weekStart,
          insert: week.insert,
          services: week.services.map(withoutPlan),
        }))}
      />
      <div className="mt-8 text-center">
        <ButtonLink href={`/service-planner/inserts?weeks=${data.nextCount}`} scroll={false} variant="secondary">
          {servicePlannerContent.inserts.more}
        </ButtonLink>
      </div>
    </PlannerShell>
  );
}
