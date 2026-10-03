import type { Metadata } from "next";

import { NoAccess, Notice } from "@/components/account/Notices";
import { Panel } from "@/components/service-planner/Panel";
import { PlanAhead } from "@/components/service-planner/PlanAhead";
import { PlannerShell } from "@/components/service-planner/PlannerShell";
import { ExportPanel, NewSpecialService } from "@/components/service-planner/QueueTools";
import { QueueView, type QueueRow } from "@/components/service-planner/QueueView";
import { Container } from "@/components/ui/Container";
import { servicePlannerContent } from "@/content/service-planner";
import { requireViewer } from "@/lib/auth/session";
import { addDays } from "@/lib/availability/occurrences";
import { serviceDate } from "@/lib/service-planner/format";
import { loadQueue } from "@/lib/service-planner/load";
import type { PlannerService } from "@/lib/service-planner/model";
import { parseAhead } from "@/lib/service-planner/planning-window";
import { plannerConfigured } from "@/lib/service-planner/store";

export const metadata: Metadata = {
  title: servicePlannerContent.title,
  robots: { index: false, follow: false },
};

const copy = servicePlannerContent;

function toRow(service: PlannerService): QueueRow {
  return {
    anchor: service.anchor,
    date: service.date,
    slot: service.slot,
    kind: service.kind,
    label: service.label,
    startsAt: service.startsAt,
    status: service.status,
    filled: service.filled,
    target: service.target,
    songs: service.slots.flatMap((song) => (song ? [song.title] : [])),
  };
}

/**
 * /service-planner - the Music Director's work queue: the services from
 * today to the end of the month being planned, the next one needing planning
 * first. The next month joins a week before it starts, or sooner with "Start
 * planning <month>" (src/lib/service-planner/planning-window.ts). Published
 * services fold away above them; several can be ticked and published together.
 *
 *   ?ahead=1   months brought in early with "Start planning <month>"
 *
 * Only for manage_service_plans: drafts are the Music Director's working
 * notes, and never shown to anyone else.
 */
export default async function ServicePlannerPage(props: PageProps<"/service-planner">) {
  const viewer = await requireViewer("/service-planner");
  if (!viewer.can("manage_service_plans")) {
    return (
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <NoAccess />
      </Container>
    );
  }
  if (!plannerConfigured()) {
    return (
      <PlannerShell>
        <Notice tone="warning">The database is not configured here, so the Service Planner cannot run.</Notice>
      </PlannerShell>
    );
  }

  const ahead = parseAhead((await props.searchParams).ahead);
  const data = await loadQueue(viewer, ahead);
  const throughStart = `${data.through}T12:00:00-07:00`;

  return (
    <PlannerShell>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <QueueView
          needsPlanning={data.queue.needsPlanning.map(toRow)}
          published={data.queue.published.map(toRow)}
          cancelled={data.queue.cancelled.map(toRow)}
          through={throughStart}
          planAhead={
            <PlanAhead path="/service-planner" ahead={ahead} nextMonth={data.nextMonth} lastMonth={data.lastMonth} />
          }
        />

        <aside className="space-y-6">
          <Panel title={copy.queue.ahead}>
            <p className="text-sm text-muted">{copy.queue.showing.replace("{date}", serviceDate(throughStart))}</p>
            <div className="mt-4">
              <NewSpecialService today={addDays(data.today, 7)} className="w-full" />
            </div>
          </Panel>
          <ExportPanel from={data.today} to={data.through} />
        </aside>
      </div>
    </PlannerShell>
  );
}
