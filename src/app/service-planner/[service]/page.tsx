import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NoAccess } from "@/components/account/Notices";
import { ServiceRail } from "@/components/service-planner/ServiceRail";
import { Workspace } from "@/components/service-planner/Workspace";
import { BackLink } from "@/components/ui/BackLink";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { servicePlannerContent } from "@/content/service-planner";
import { requireViewer } from "@/lib/auth/session";
import { loadMonthRail, loadWorkspaceRecordings } from "@/lib/recordings/planner";
import { loadWorkspace } from "@/lib/service-planner/load";
import { withoutPlan } from "@/lib/service-planner/model";

export const metadata: Metadata = {
  title: servicePlannerContent.title,
  robots: { index: false, follow: false },
};

/**
 * /service-planner/2026-10-11-am - planning one service. Works for a regular
 * service nobody has opened yet (it is stored on first save) as well as a
 * stored or special one. Only for manage_service_plans.
 *
 * A focused page: the service's own heading and its songs, with the way back
 * to wherever it was opened from - no section tabs competing with the list.
 */
export default async function ServiceWorkspacePage(props: PageProps<"/service-planner/[service]">) {
  const { service: anchor } = await props.params;
  const viewer = await requireViewer(`/service-planner/${anchor}`);
  if (!viewer.can("manage_service_plans")) {
    return (
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <NoAccess />
      </Container>
    );
  }

  const data = await loadWorkspace(viewer, anchor);
  if (!data) notFound();
  const plan = data.service.plan;
  // Recordings (one catalog with the song pages) and the month's other services, read beside the plan.
  const [recordings, rail] = await Promise.all([loadWorkspaceRecordings(viewer, data.service), loadMonthRail(viewer, data.service.date)]);
  // The songs' history and the leaders' changes, as one list, newest first.
  const history = [
    ...data.events,
    ...(data.leaders?.changes ?? []).map((change) => ({
      type: "leaders",
      status: plan?.status ?? ("draft" as const),
      actor: change.actor,
      actorName: change.actorName,
      at: change.at,
      publicationId: null,
      changes: [],
    })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return (
    <PageTransition>
      <Container size="wide" className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <BackLink fallback="/service-planner" />
          <ServiceRail services={rail} current={data.service.anchor} className="min-w-0 lg:max-w-[70%]" />
        </div>
        <div className="mt-6">
          <Workspace
            // A fresh copy of the editor whenever the stored service changes (after a save, or someone else's).
            key={`${plan?.revision ?? 0}-${plan?.status ?? "new"}-${data.leaders?.leadership.revision ?? "x"}`}
            now={data.now}
            service={withoutPlan(data.service)}
            revision={plan?.revision ?? null}
            deletable={plan !== null && plan.kind === "special" && plan.published === null}
            locked={data.locked}
            canUseAi={viewer.can("use_ai")}
            candidates={data.candidates}
            recentPast={data.recentPast}
            planned={data.planned}
            sheetMusicChecked={data.sheetMusicChecked}
            availability={data.availability}
            events={history}
            leaders={
              data.leaders
                ? {
                    draft: { defaultUserId: data.leaders.leadership.defaultUserId, overrides: data.leaders.leadership.overrides },
                    revision: data.leaders.leadership.revision,
                    people: data.leaders.people,
                  }
                : null
            }
            placesReset={plan?.placesReset === true}
            recordings={recordings}
            canManageSongs={viewer.can("manage_songs")}
          />
        </div>
      </Container>
    </PageTransition>
  );
}
