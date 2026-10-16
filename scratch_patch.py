import re,io
p='src/lib/schedule.ts'
s=open(p,encoding='utf-8').read()
s=s.replace('''import { cache } from "react";
''','''import { unstable_cache } from "next/cache";
import { cache } from "react";
''')
s=s.replace('''import { weekStartOf, type StoredPlan } from "@/lib/service-planner/model";''','''import { weekStartOf, type InsertWeek, type StoredPlan } from "@/lib/service-planner/model";''')
s=s.replace('''/** How far ahead planned inserts are read: past any month the song list could show. */
const INSERT_HORIZON_DAYS = 400;
''','''/** How far ahead planned inserts are read: past any month the song list could show. */
const INSERT_HORIZON_DAYS = 400;

/**
 * Cache tag for the planner rows behind the public schedule. Every planner
 * change that can reach the song list invalidates it (refreshEverything in
 * src/app/service-planner/actions.ts, and the sheet import cron), so the
 * hour below only bounds a change made some other way.
 */
export const SCHEDULE_TAG = "schedule";
''')
old_start=s.index('export const getSchedule = cache(')
old_end=s.index('    return {\n      ok: true,')
new='''/**
 * What the public schedule is built from, as stored - shared across requests
 * and invalidated by SCHEDULE_TAG. Only what the song list may show: drafts
 * are reduced to their insert mode, so a draft's songs never enter the cache.
 * Everything that depends on the time of day is worked out afterwards, on
 * every call, so the Now/Next/past boundaries stay exact.
 */
interface ScheduleRows {
  /** Published and cancelled services, oldest first. */
  plans: StoredPlan[];
  drafts: Array<Pick<StoredPlan, "date" | "slot" | "insertMode">>;
  weeks: InsertWeek[];
}

/** Reads the rows; exported for tests. A failure throws, and is never cached. */
export async function loadScheduleRows(env: ClerkEnv, fromWeek: string): Promise<ScheduleRows> {
  // Cancelled services are read too: they take regular services off the list.
  // Drafts are read only for their insert mode (plannedInserts) - their songs never leave here.
  // The weeks' inserts come as one row each, a week with a second insert as two.
  const [rows, weeks] = await Promise.all([
    listPlans(env, { statuses: ["published", "cancelled", "draft"] }),
    listInsertWeeks(env, fromWeek, addDays(fromWeek, INSERT_HORIZON_DAYS)),
  ]);
  return {
    plans: rows.filter((plan) => plan.status !== "draft"),
    drafts: rows
      .filter((plan) => plan.status === "draft")
      .map(({ date, slot, insertMode }) => ({ date, slot, insertMode })),
    weeks,
  };
}

const getScheduleRows = unstable_cache(loadScheduleRows, ["schedule-rows"], {
  tags: [SCHEDULE_TAG],
  revalidate: 3600,
});

export const getSchedule = cache(async (): Promise<SongListResult> => {
  if (!plannerConfigured()) return { ok: false, reason: "not-configured" };

  try {
    const env = scheduleEnv();
    const now = Date.now();
    // From the Sunday before this month starts: the first week the list can show.
    const fromWeek = weekStartOf(monthRange(churchDate(now).slice(0, 7)).from);
    const { plans, drafts, weeks } = await getScheduleRows(env, fromWeek);
    const published = plans.filter((plan) => plan.status === "published");
    const scheduled = plans.map((plan) => ({
      date: plan.date,
      slot: plan.slot,
      // A name or time is only public once its service is published.
      label: plan.status === "published" ? plan.label : null,
      startsAt: plan.status === "published" ? plan.startsAt : null,
      cancelled: plan.status === "cancelled",
    }));

'''
s=s[:old_start]+new+s[old_end:]
s=s.replace(' * Read once per request, however many parts of the page ask.',' * Read once per request, however many parts of the page ask; the rows behind\n * it are shared across requests until the planner changes (SCHEDULE_TAG).')
open(p,'w',encoding='utf-8').write(s)
