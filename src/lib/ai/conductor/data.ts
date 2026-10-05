import "server-only";

import type { Viewer } from "@/lib/auth/session";
import { addDays, churchDate } from "@/lib/availability/occurrences";
import { getSchedule, scheduleEnv } from "@/lib/schedule";
import { slotSongs } from "@/lib/service-planner/model";
import { listCatalogSongs, listPlans, plannerConfigured } from "@/lib/service-planner/store";
import { loadPast } from "@/lib/song-archive";

import type { ConductorData, UpcomingService } from "./facts";

/** How far ahead Conductor knows the plans. */
const PLAN_HORIZON_DAYS = 180;

const quietly = async <T>(what: string, read: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await read();
  } catch (error) {
    console.error(`[conductor] Could not read ${what}:`, error instanceof Error ? error.message : "unknown error");
    return fallback;
  }
};

/**
 * Everything Conductor's tools read, loaded once for a question through the
 * site's own read layer - never a query of its own:
 *
 *   the history     loadPast(): the archive and the published plans, combined
 *   what is planned getSchedule(): published services only
 *                   ...and, ONLY for someone who manages service plans, the
 *                   planner's drafts (listPlans). use_ai alone never opens
 *                   a draft: Conductor then knows what the song list shows.
 *   the catalog     songs added in the planner (the Library lists them too)
 *
 * Read-only: nothing here, or anything the tools call, writes.
 */
export async function loadConductorData(viewer: Viewer): Promise<ConductorData> {
  const now = Date.now();
  const today = churchDate(now);
  const canPlan = viewer.can("manage_service_plans");

  const [history, schedule, catalog, plans] = await Promise.all([
    quietly("the history", loadPast, null),
    getSchedule(),
    quietly("the catalog", async () => (plannerConfigured() ? listCatalogSongs(scheduleEnv()) : []), []),
    canPlan && plannerConfigured()
      ? quietly(
          "the plans",
          () => listPlans(viewer.env, { from: today, to: addDays(today, PLAN_HORIZON_DAYS), statuses: ["published", "draft"] }),
          null,
        )
      : null,
  ]);

  const upcoming: UpcomingService[] = plans
    ? plans.map((plan) => ({
        date: plan.date,
        slot: plan.slot,
        startsAt: plan.startsAt,
        songs: slotSongs(plan.slots),
        ...(plan.label ? { label: plan.label } : {}),
        ...(plan.kind === "special" ? { kind: "special" as const } : {}),
        status: plan.status === "draft" ? ("draft" as const) : ("published" as const),
        emptyPlaces: plan.slots.filter((song) => song === null).length,
      }))
    : schedule.ok
      ? schedule.published.map((service) => ({ ...service, status: "published" as const, emptyPlaces: 0 }))
      : [];

  return {
    now,
    today,
    past: history?.past ?? [],
    upcoming: upcoming
      .filter((service) => Date.parse(service.startsAt) > now)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    catalog,
    draftsIncluded: plans !== null,
    historyAvailable: history !== null,
  };
}
