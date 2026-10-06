/**
 * The planner's working list: every service from today to the horizon, in
 * time order, split into what still needs planning, what is published and
 * what was cancelled. Pure - unit tested.
 */

import { siteConfig } from "@/config/site";
import { occurrenceKey, serviceOccurrences } from "@/lib/availability/occurrences";

import {
  insertsByWeek,
  needsPlanning,
  plannerService,
  weekStartOf,
  type InsertWeek,
  type PlannerService,
  type StoredPlan,
} from "./model";

export interface PlannerQueue {
  /** Not started or still a draft, soonest first. */
  needsPlanning: PlannerService[];
  /** Published and still to come (or happening now). */
  published: PlannerService[];
  /** Cancelled, so they can be restored. */
  cancelled: PlannerService[];
}

/**
 * Every service from `from` to `to`, as the planner shows it: the regular
 * ones (stored or not), plus every stored special service - cancelled ones
 * included, so they can be brought back. `weeks` is every insert of the
 * weeks in range: one row for a week's insert, another for its second.
 */
export function plannerServices(
  range: { from: string; to: string },
  plans: readonly StoredPlan[],
  weeks: readonly InsertWeek[],
): PlannerService[] {
  // The occurrence list leaves out cancelled services; the planner wants
  // them, so they go in as ordinary ones and keep their status from the plan.
  const occurrences = serviceOccurrences(
    range.from,
    range.to,
    plans.map((plan) => ({ date: plan.date, slot: plan.slot, label: plan.label, startsAt: plan.startsAt })),
  );
  const planByKey = new Map(plans.map((plan) => [occurrenceKey(plan.date, plan.slot), plan]));
  const weekByStart = insertsByWeek(weeks);

  return occurrences.map((occurrence) =>
    plannerService(
      occurrence,
      planByKey.get(occurrenceKey(occurrence.date, occurrence.slot)) ?? null,
      weekByStart.get(weekStartOf(occurrence.date)) ?? [],
    ),
  );
}

/** Splits services into the planner's three lists, leaving out any already over. */
export function buildQueue(services: readonly PlannerService[], now: number): PlannerQueue {
  const durationMs = siteConfig.songList.serviceDurationMinutes * 60_000;
  const current = services.filter((service) => Date.parse(service.startsAt) + durationMs > now);
  return {
    needsPlanning: current.filter(needsPlanning),
    published: current.filter((service) => service.status === "published"),
    cancelled: current.filter((service) => service.status === "cancelled"),
  };
}

/** "Draft · 3 of 5 songs" and friends - the facts behind a queue row's status. */
export function progressOf(service: Pick<PlannerService, "status" | "filled" | "target">): {
  status: PlannerService["status"];
  filled: number;
  target: number;
  complete: boolean;
} {
  return {
    status: service.status,
    filled: service.filled,
    target: service.target,
    complete: service.target > 0 && service.filled >= service.target,
  };
}
