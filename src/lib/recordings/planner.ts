import "server-only";

import type { Viewer } from "@/lib/auth/session";
import { serviceTitle } from "@/lib/service-planner/format";
import { weekStartOf, type PlannerService, type PlannerStatus } from "@/lib/service-planner/model";
import { monthEnd } from "@/lib/service-planner/planning-window";
import { plannerServices } from "@/lib/service-planner/queue";
import { listInsertWeeks, listPlans } from "@/lib/service-planner/store";

import type { MediaLink, Recording, RecordingSelection } from "./model";
import { recordingCoverage } from "./readiness";
import { catalogOf } from "./resolve";
import { listMediaLinks, listRecordings, listSelections } from "./store";

/**
 * What the Service Planner's workspace needs beyond the service itself:
 * every recording and link (any song may be chosen while planning, so all of
 * them - a short list), this service's chosen recordings, and the other
 * services of its month for moving between them. Read per request, for a
 * planner only (the workspace page checks manage_service_plans).
 */

export interface WorkspaceRecordings {
  recordings: Recording[];
  links: MediaLink[];
  selections: RecordingSelection[];
}

/** Null when they cannot be read: the service can still be planned. */
export async function loadWorkspaceRecordings(viewer: Viewer, service: Pick<PlannerService, "date" | "slot">): Promise<WorkspaceRecordings | null> {
  try {
    const [recordings, links, selections] = await Promise.all([
      listRecordings(viewer.env),
      listMediaLinks(viewer.env),
      listSelections(viewer.env, { from: service.date, to: service.date }),
    ]);
    return { recordings, links, selections: selections.filter((selection) => selection.slot === service.slot) };
  } catch (error) {
    console.error("[recordings] Could not load the workspace's recordings:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

/** One service in the workspace's month strip. */
export interface RailService {
  anchor: string;
  title: string;
  startsAt: string;
  status: PlannerStatus;
  filled: number;
  target: number;
}

/** Every service of the month `date` is in, in order. Empty when it cannot be read. */
export async function loadMonthRail(viewer: Viewer, date: string): Promise<RailService[]> {
  try {
    const month = date.slice(0, 7);
    const range = { from: `${month}-01`, to: monthEnd(month) };
    const [plans, weeks] = await Promise.all([listPlans(viewer.env, range), listInsertWeeks(viewer.env, weekStartOf(range.from), range.to)]);
    return plannerServices(range, plans, weeks).map((service) => ({
      anchor: service.anchor,
      title: serviceTitle(service),
      startsAt: service.startsAt,
      status: service.status,
      filled: service.filled,
      target: service.target,
    }));
  } catch (error) {
    console.error("[service-planner] Could not load the month's services:", error instanceof Error ? error.message : "unknown error");
    return [];
  }
}

/**
 * For the planner's list: how many of each service's songs have a recording
 * to play ("3 of 5 with recordings"). Two short reads for the whole list;
 * an empty map when they cannot be made (the list then just leaves it out).
 */
export async function loadRecordingCoverage(
  viewer: Viewer,
  services: ReadonlyArray<Pick<PlannerService, "anchor" | "date" | "slot" | "slots" | "places">>,
): Promise<Map<string, { withRecording: number; songs: number }>> {
  const coverage = new Map<string, { withRecording: number; songs: number }>();
  if (services.length === 0) return coverage;
  try {
    const dates = services.map((service) => service.date).sort();
    const [recordings, selections] = await Promise.all([
      listRecordings(viewer.env),
      listSelections(viewer.env, { from: dates[0], to: dates.at(-1) }),
    ]);
    const catalog = catalogOf(recordings);
    for (const service of services) {
      const own = selections.filter((selection) => selection.date === service.date && selection.slot === service.slot);
      coverage.set(service.anchor, recordingCoverage(service.slots, service.places, own, catalog));
    }
  } catch (error) {
    console.error("[recordings] Could not read recording coverage:", error instanceof Error ? error.message : "unknown error");
  }
  return coverage;
}
