import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NoAccess } from "@/components/account/Notices";
import { Workspace } from "@/components/service-planner/Workspace";
import { BackLink } from "@/components/ui/BackLink";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { servicePlannerContent } from "@/content/service-planner";
import { requireViewer } from "@/lib/auth/session";
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

  return (
    <PageTransition>
      <Container size="wide" className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <BackLink fallback="/service-planner" />
        <div className="mt-6">
          <Workspace
            // A fresh copy of the editor whenever the stored service changes (after a save, or someone else's).
            key={`${plan?.revision ?? 0}-${plan?.status ?? "new"}`}
            now={data.now}
            service={withoutPlan(data.service)}
            revision={plan?.revision ?? null}
            deletable={plan !== null && plan.kind === "special" && plan.published === null}
            locked={data.locked}
            candidates={data.candidates}
            recentPast={data.recentPast}
            planned={data.planned}
            sheetMusicChecked={data.sheetMusicChecked}
            availability={data.availability}
            events={data.events}
          />
        </div>
      </Container>
    </PageTransition>
  );
}
