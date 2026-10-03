import type { Metadata } from "next";

import { NoAccess, Notice } from "@/components/account/Notices";
import { Panel } from "@/components/service-planner/Panel";
import { PlannerShell } from "@/components/service-planner/PlannerShell";
import { ExportPanel, NewSpecialService } from "@/components/service-planner/QueueTools";
import { QueueView, type QueueRow } from "@/components/service-planner/QueueView";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { servicePlannerContent } from "@/content/service-planner";
import { requireViewer } from "@/lib/auth/session";
import { addDays } from "@/lib/availability/occurrences";
import { serviceDate } from "@/lib/service-planner/format";
import { loadQueue } from "@/lib/service-planner/load";
import type { PlannerService } from "@/lib/service-planner/model";
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
 * today on, the next one needing planning first. Published services fold
 * away underneath; several can be ticked and published together.
 *
 *   ?through=2027-02   list regular services up to the end of that month
 *                      (planning further ahead - they are generated, never
 *                      created by hand)
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

  const params = await props.searchParams;
  const through = typeof params.through === "string" ? params.through : null;
  const data = await loadQueue(viewer, through);
  const throughStart = `${data.through}T12:00:00-07:00`;

  return (
    <PlannerShell>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <QueueView
          needsPlanning={data.queue.needsPlanning.map(toRow)}
          published={data.queue.published.map(toRow)}
          cancelled={data.queue.cancelled.map(toRow)}
          through={throughStart}
        />

        <aside className="space-y-6">
          <Panel title={copy.queue.ahead}>
            <p className="text-sm text-muted">{copy.queue.showing.replace("{date}", serviceDate(throughStart))}</p>
            <div className="mt-4 grid gap-2">
              <ButtonLink href={`/service-planner?through=${data.nextThrough}`} scroll={false} variant="secondary" className="w-full">
                {copy.queue.planFurther}
              </ButtonLink>
              <NewSpecialService today={addDays(data.today, 7)} className="w-full" />
            </div>
          </Panel>
          <ExportPanel from={data.today} to={data.through} />
        </aside>
      </div>
    </PlannerShell>
  );
}
