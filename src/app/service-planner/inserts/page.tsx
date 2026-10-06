import type { Metadata } from "next";

import { NoAccess } from "@/components/account/Notices";
import { InsertsView } from "@/components/service-planner/InsertsView";
import { MovesWithMonths } from "@/components/service-planner/MonthTransition";
import { PlanAhead } from "@/components/service-planner/PlanAhead";
import { PlannerShell } from "@/components/service-planner/PlannerShell";
import { Container } from "@/components/ui/Container";
import { servicePlannerContent } from "@/content/service-planner";
import { requireViewer } from "@/lib/auth/session";
import { loadInserts } from "@/lib/service-planner/load";
import { withoutPlan } from "@/lib/service-planner/model";
import { parseAhead } from "@/lib/service-planner/planning-window";

export const metadata: Metadata = {
  title: `${servicePlannerContent.inserts.title} - ${servicePlannerContent.title}`,
  robots: { index: false, follow: false },
};

/**
 * /service-planner/inserts - the weekly inserts (one a week, or two), planned a month at a time
 * (src/lib/service-planner/inserts.ts decides which weeks show). Only for
 * manage_service_plans: the long-range plan is the Music Director's, and
 * reaches everyone else only inside published services.
 *
 *   ?ahead=1   months brought in early with "Start planning <month>"
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

  const ahead = parseAhead((await props.searchParams).ahead);
  const data = await loadInserts(viewer, ahead);

  return (
    <PlannerShell lead={servicePlannerContent.inserts.lead}>
      <InsertsView
        now={data.now}
        candidates={data.candidates}
        months={data.months.map((month) => ({
          ...month,
          weeks: month.weeks.map((week) => ({ ...week, services: week.services.map(withoutPlan) })),
        }))}
      />
      <MovesWithMonths name="inserts-plan-ahead">
        <PlanAhead
          path="/service-planner/inserts"
          ahead={ahead}
          nextMonth={data.nextMonth}
          lastMonth={data.months.at(-1)?.month ?? data.nextMonth}
          className="mt-8"
        />
      </MovesWithMonths>
    </PlannerShell>
  );
}
