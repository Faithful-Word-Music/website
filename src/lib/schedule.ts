import "server-only";

import { cache } from "react";

import { currentClerkConfig, type ClerkEnv } from "@/lib/auth/clerk-env";
import { addDays, churchDate, monthRange, serviceOccurrences } from "@/lib/availability/occurrences";
import { buildScheduleMonths, plannedInserts, planToDated } from "@/lib/schedule-months";
import { weekStartOf, type StoredPlan } from "@/lib/service-planner/model";
import { listInsertWeeks, listPlans, plannerConfigured } from "@/lib/service-planner/store";
import type { DatedService, SongListResult } from "@/types/song-list";

/** How far ahead planned inserts are read: past any month the song list could show. */
const INSERT_HORIZON_DAYS = 400;

/**
 * THE SCHEDULE READ LAYER - the one way the rest of the site learns which
 * songs are scheduled.
 *
 *   Service Planner (database) -> getSchedule() -> song list, home page,
 *   Dashboard, Library, song pages, search, PDFs, pictures, Availability,
 *   history and the quarterly report
 *
 * Only PUBLISHED services leave here with their songs; drafts never do. Every
 * consumer sees the shapes in src/types/song-list.ts, never the planner's
 * tables, so none of them knows (or cares) where the schedule is kept.
 */

/**
 * Whose plans this deployment shows. The planner's rows are tagged with the
 * Clerk environment, like the accounts they come from: Production shows the
 * live plans, while Local and Preview show only their own test plans.
 */
export function scheduleEnv(): ClerkEnv {
  const config = currentClerkConfig();
  if (config.status === "ready") return config.env;
  return process.env.VERCEL_ENV === "production" ? "production" : "development";
}

/** Every published service, past and future, oldest first. */
export function publishedHistory(plans: readonly StoredPlan[]): DatedService[] {
  return plans
    .filter((plan) => plan.status === "published")
    .map(planToDated)
    .filter((service): service is DatedService => service !== null);
}

/**
 * The published schedule: the months the song list shows, and every
 * published service for history. Never throws - a missing or unreachable
 * database is an error state on the page, so the rest of the site stays up.
 * Read once per request, however many parts of the page ask.
 */
export const getSchedule = cache(async (): Promise<SongListResult> => {
  if (!plannerConfigured()) return { ok: false, reason: "not-configured" };

  try {
    const env = scheduleEnv();
    const now = Date.now();
    // From the Sunday before this month starts: the first week the list can show.
    const fromWeek = weekStartOf(monthRange(churchDate(now).slice(0, 7)).from);
    // Cancelled services are read too: they take regular services off the list.
    // Drafts are read only for their insert mode (plannedInserts) - their songs never leave here.
    const [rows, weeks] = await Promise.all([
      listPlans(env, { statuses: ["published", "cancelled", "draft"] }),
      listInsertWeeks(env, fromWeek, addDays(fromWeek, INSERT_HORIZON_DAYS)),
    ]);
    const drafts = rows.filter((plan) => plan.status === "draft");
    const plans = rows.filter((plan) => plan.status !== "draft");
    const published = plans.filter((plan) => plan.status === "published");
    const scheduled = plans.map((plan) => ({
      date: plan.date,
      slot: plan.slot,
      // A name or time is only public once its service is published.
      label: plan.status === "published" ? plan.label : null,
      startsAt: plan.status === "published" ? plan.startsAt : null,
      cancelled: plan.status === "cancelled",
    }));

    return {
      ok: true,
      months: buildScheduleMonths({
        published,
        expected: (range) => serviceOccurrences(range.from, range.to, scheduled),
        now,
        plannedInsert: plannedInserts(weeks, drafts),
      }),
      published: publishedHistory(published),
    };
  } catch (error) {
    console.error(
      "[schedule] Could not load the schedule:",
      error instanceof Error ? error.message : "unknown error",
    );
    return { ok: false, reason: "unavailable" };
  }
});
