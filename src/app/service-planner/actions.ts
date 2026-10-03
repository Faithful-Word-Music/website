"use server";

import { revalidatePath } from "next/cache";

import { servicePlannerContent } from "@/content/service-planner";
import { firstIssue } from "@/lib/auth/forms";
import { withPermission, type ActionResult, type Viewer } from "@/lib/auth/session";
import { addDays, findOccurrence, serviceOccurrences, type Occurrence } from "@/lib/availability/occurrences";
import { plural } from "@/lib/plural";
import { dayOfWeek } from "@/lib/service-time";
import { startsAtAt } from "@/lib/service-planner/format";
import {
  insertWeekSchema,
  newSongSchema,
  publishSchema,
  saveServiceSchema,
  specialServiceSchema,
  statusSchema,
} from "@/lib/service-planner/forms";
import {
  diffSlots,
  emptySlots,
  followsWeek,
  insertSong,
  isLocked,
  parseAnchor,
  placeInsert,
  startingSlots,
  takesWeekInsert,
  type InsertWeek,
  type PlanSlots,
  type PlanStatus,
  type StoredPlan,
} from "@/lib/service-planner/model";
import {
  createCatalogSong,
  deleteDraftSpecial,
  ensurePlan,
  getPlan,
  listInsertWeeks,
  listPlans,
  publishPlans,
  savePlan,
  setInsertWeek as storeInsertWeek,
  setPlanStatus,
} from "@/lib/service-planner/store";
import type { ServiceSlot } from "@/types/song-list";

/**
 * The Service Planner's changes. Every action:
 *
 *   1. runs only for someone holding manage_service_plans (withPermission) -
 *      server actions are public endpoints, so hiding the planner is never
 *      the protection;
 *   2. validates what the browser sent (src/lib/service-planner/forms.ts);
 *   3. checks the service is real and not yet frozen into history;
 *   4. writes, recording what changed (service_plan_events);
 *   5. refreshes the pages that show it - the whole public site when a
 *      published service changed, only the planner's pages for a draft.
 */

const PERMISSION = "manage_service_plans";
const copy = servicePlannerContent;

const MESSAGES = {
  notFound: copy.errors.notFound,
  locked: copy.workspace.locked,
  conflict: copy.workspace.conflict,
  cancelled: "This service is cancelled. Restore it first.",
  notSunday: "An insert week starts on a Sunday.",
} as const;

/** Only the planner (and the Dashboard, which summarises it) shows drafts. */
function refreshPlanner() {
  revalidatePath("/service-planner", "layout");
  revalidatePath("/dashboard");
}

/** Something on the song list changed: every page that shows the schedule. */
function refreshEverything() {
  revalidatePath("/", "layout");
}

/** The service held at this date and slot - regular, or stored as special - or null. */
function occurrenceFor(date: string, slot: ServiceSlot, plan: StoredPlan | null): Occurrence | null {
  const planned = plan ? [{ date, slot, label: plan.label, startsAt: plan.startsAt }] : [];
  return findOccurrence(serviceOccurrences(date, date, planned), date, slot);
}

async function weekFor(viewer: Viewer, date: string): Promise<InsertWeek | null> {
  const weekStart = addDays(date, -dayOfWeek(date));
  return (await listInsertWeeks(viewer.env, weekStart, weekStart))[0] ?? null;
}

/** Where the insert is and what it is - to tell whether a save changed it. */
function insertOf(slots: PlanSlots): string {
  const index = slots.findIndex((song) => song?.insert);
  if (index < 0) return "none";
  const song = slots[index]!;
  return JSON.stringify([index, song.title, song.number, song.key]);
}

// ---------------------------------------------------------------------------
// One service
// ---------------------------------------------------------------------------

/**
 * Saves a service's songs (and, optionally, its name and time), and
 * publishes it too when asked. A service not stored yet is stored as a
 * draft; a published one stays published, with the change recorded.
 */
export async function saveService(
  input: unknown,
): Promise<ActionResult<{ revision: number; status: PlanStatus }>> {
  return withPermission(PERMISSION, async (viewer) => {
    const parsed = saveServiceSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { anchor, revision, label, time, publish } = parsed.data;
    const where = parseAnchor(anchor)!;
    const now = Date.now();

    const current = await getPlan(viewer.env, where.date, where.slot);
    const occurrence = occurrenceFor(where.date, where.slot, current);
    if (!occurrence) return { ok: false, error: MESSAGES.notFound };
    if (current?.status === "cancelled") return { ok: false, error: MESSAGES.cancelled };
    if (isLocked(current?.startsAt ?? occurrence.startsAt, now)) return { ok: false, error: MESSAGES.locked };
    if ((current?.revision ?? null) !== revision) return { ok: false, error: MESSAGES.conflict };

    const week = current ? null : await weekFor(viewer, where.date);
    const before = current?.slots ?? startingSlots(where.date, where.slot, week);
    const slots: PlanSlots = parsed.data.slots.map((song) => (song ? { ...song, number: song.number, key: song.key } : null));
    // A service follows its week's insert until its own insert is changed here.
    const insertMode =
      current?.insertMode === "custom" || insertOf(before) !== insertOf(slots) ? "custom" : "week";

    const kind = current?.kind ?? occurrence.kind;
    const saved = await savePlan(
      viewer.env,
      {
        date: where.date,
        slot: where.slot,
        kind,
        // A special service always keeps a name; a regular one may have one or not.
        label: label ?? (kind === "special" ? (current?.label ?? null) : null),
        startsAt: time ? startsAtAt(where.date, time) : (current?.startsAt ?? occurrence.startsAt),
        insertMode,
        slots,
      },
      current?.revision ?? null,
      viewer.userId,
      diffSlots(before, slots),
    );
    if (!saved.ok) return { ok: false, error: MESSAGES.conflict };

    let plan = saved.plan;
    if (publish) {
      await publishPlans(viewer.env, [where], viewer.userId);
      plan = (await getPlan(viewer.env, where.date, where.slot)) ?? plan;
    }

    // A draft that takes or drops the week's insert changes what the song list shows for it (plannedInserts).
    if (plan.status === "published" || insertMode !== (current?.insertMode ?? "week")) refreshEverything();
    else refreshPlanner();
    return {
      ok: true,
      value: { revision: plan.revision, status: plan.status },
      message: publish ? copy.workspace.published : copy.workspace.saved,
    };
  });
}

/**
 * Publishes services together - one service, or several at once as ONE
 * publication (so a future notification announces them together). A
 * service nobody has opened yet is stored first, with the week's insert.
 */
export async function publishServices(input: unknown): Promise<ActionResult<{ count: number }>> {
  return withPermission(PERMISSION, async (viewer) => {
    const parsed = publishSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const now = Date.now();
    const wanted = [...new Set(parsed.data.anchors)].map((anchor) => parseAnchor(anchor)!);
    const dates = wanted.map((item) => item.date).sort();

    const plans = await listPlans(viewer.env, { from: dates[0], to: dates[dates.length - 1] });
    const targets: Array<{ date: string; slot: ServiceSlot }> = [];

    for (const where of wanted) {
      const plan = plans.find((item) => item.date === where.date && item.slot === where.slot) ?? null;
      const occurrence = occurrenceFor(where.date, where.slot, plan);
      if (!occurrence) return { ok: false, error: MESSAGES.notFound };
      if (plan?.status === "cancelled") return { ok: false, error: MESSAGES.cancelled };
      if (isLocked(plan?.startsAt ?? occurrence.startsAt, now)) return { ok: false, error: MESSAGES.locked };
      if (!plan) {
        await ensurePlan(
          viewer.env,
          {
            date: where.date,
            slot: where.slot,
            kind: occurrence.kind,
            label: null,
            startsAt: occurrence.startsAt,
            insertMode: "week",
            slots: startingSlots(where.date, where.slot, await weekFor(viewer, where.date)),
          },
          viewer.userId,
        );
      }
      targets.push(where);
    }

    const { count } = await publishPlans(viewer.env, targets, viewer.userId);
    refreshEverything();
    return {
      ok: true,
      value: { count },
      message: count === 1 ? copy.queue.publishedOne : copy.queue.publishedGroup.replace("{count}", String(count)),
    };
  });
}

/**
 * Takes a published service back to draft (off the song list), cancels a
 * service, or restores a cancelled one as a draft.
 */
export async function setServiceStatus(input: unknown): Promise<ActionResult<{ status: PlanStatus }>> {
  return withPermission(PERMISSION, async (viewer) => {
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const where = parseAnchor(parsed.data.anchor)!;

    const current = await getPlan(viewer.env, where.date, where.slot);
    const occurrence = occurrenceFor(where.date, where.slot, current);
    if (!occurrence) return { ok: false, error: MESSAGES.notFound };
    if (isLocked(current?.startsAt ?? occurrence.startsAt, Date.now())) return { ok: false, error: MESSAGES.locked };

    if (!current) {
      if (parsed.data.status === "draft") return { ok: true, value: { status: "draft" } };
      await ensurePlan(
        viewer.env,
        {
          date: where.date,
          slot: where.slot,
          kind: occurrence.kind,
          label: null,
          startsAt: occurrence.startsAt,
          insertMode: "week",
          slots: startingSlots(where.date, where.slot, await weekFor(viewer, where.date)),
        },
        viewer.userId,
      );
    }

    const plan = await setPlanStatus(viewer.env, where, parsed.data.status, viewer.userId);
    if (!plan) return { ok: false, error: MESSAGES.notFound };
    // Leaving or entering the song list, or appearing/vanishing in Availability.
    refreshEverything();
    return { ok: true, value: { status: plan.status } };
  });
}

/** Creates a special service: a conference, a holiday, anything outside the weekly pattern. */
export async function createSpecialService(input: unknown): Promise<ActionResult<{ anchor: string }>> {
  return withPermission(PERMISSION, async (viewer) => {
    const parsed = specialServiceSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { date, slot, label, time, songs } = parsed.data;
    const startsAt = startsAtAt(date, time);
    if (isLocked(startsAt, Date.now())) return { ok: false, error: MESSAGES.locked };

    const current = await getPlan(viewer.env, date, slot);
    if (current || occurrenceFor(date, slot, null)) return { ok: false, error: copy.special.exists };

    const saved = await savePlan(
      viewer.env,
      { date, slot, kind: "special", label, startsAt, insertMode: "custom", slots: emptySlots(songs) },
      null,
      viewer.userId,
      [],
    );
    if (!saved.ok) return { ok: false, error: copy.special.exists };

    // Special services show in Availability as soon as they exist.
    refreshPlanner();
    revalidatePath("/availability");
    return { ok: true, value: { anchor: `${date}-${slot.toLowerCase()}` }, message: copy.special.created };
  });
}

/** Deletes a special service that was never published (a published one is cancelled instead). */
export async function deleteSpecialService(input: unknown): Promise<ActionResult> {
  return withPermission(PERMISSION, async (viewer) => {
    const parsed = statusSchema.pick({ anchor: true }).safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const where = parseAnchor(parsed.data.anchor)!;
    const deleted = await deleteDraftSpecial(viewer.env, where.date, where.slot);
    if (!deleted) return { ok: false, error: MESSAGES.notFound };
    refreshPlanner();
    revalidatePath("/availability");
    return { ok: true, value: null };
  });
}

// ---------------------------------------------------------------------------
// Inserts
// ---------------------------------------------------------------------------

/**
 * Sets (or clears) a week's insert, and passes it on to the week's services
 * that still follow it - drafts and services not stored yet. Published
 * services are left alone; the result says how many still show an older
 * insert, so the Inserts page can offer to update them.
 */
export async function setInsertWeek(input: unknown): Promise<ActionResult<{ updated: number; outdated: number }>> {
  return withPermission(PERMISSION, async (viewer) => {
    const parsed = insertWeekSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { weekStart, song } = parsed.data;
    if (dayOfWeek(weekStart) !== 0) return { ok: false, error: MESSAGES.notSunday };

    await storeInsertWeek(viewer.env, weekStart, song, viewer.userId);
    const week: InsertWeek | null = song ? { weekStart, ...song } : null;
    const { updated, outdated } = await passInsertOn(viewer, weekStart, week, ["draft"]);

    // The song list shows a planned insert on services not posted yet.
    refreshEverything();
    return {
      ok: true,
      value: { updated, outdated },
      message:
        updated === 0 ? copy.inserts.saved : plural(copy.inserts.savedUpdated, updated),
    };
  });
}

/** Updates the week's PUBLISHED services that still follow it but show an older insert. */
export async function applyInsertToPublished(input: unknown): Promise<ActionResult<{ updated: number }>> {
  return withPermission(PERMISSION, async (viewer) => {
    const parsed = insertWeekSchema.pick({ weekStart: true }).safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { weekStart } = parsed.data;
    const week = (await listInsertWeeks(viewer.env, weekStart, weekStart))[0] ?? null;

    const { updated } = await passInsertOn(viewer, weekStart, week, ["published"]);
    refreshEverything();
    return { ok: true, value: { updated }, message: plural(copy.inserts.updated, updated) };
  });
}

/** Puts the week's insert into its following services of the given statuses; counts the rest. */
async function passInsertOn(
  viewer: Viewer,
  weekStart: string,
  week: InsertWeek | null,
  statuses: PlanStatus[],
): Promise<{ updated: number; outdated: number }> {
  const now = Date.now();
  const plans = await listPlans(viewer.env, { from: weekStart, to: addDays(weekStart, 6) });
  let updated = 0;
  let outdated = 0;

  for (const plan of plans) {
    if (plan.insertMode !== "week" || !takesWeekInsert(plan.date, plan.slot)) continue;
    if (isLocked(plan.startsAt, now) || followsWeek(plan.slots, week)) continue;
    if (!statuses.includes(plan.status)) {
      if (plan.status === "published") outdated += 1;
      continue;
    }
    const slots = placeInsert(plan.slots, week ? insertSong(week) : null);
    const saved = await savePlan(
      viewer.env,
      { ...plan, slots },
      plan.revision,
      viewer.userId,
      diffSlots(plan.slots, slots),
    );
    if (saved.ok) updated += 1;
  }
  return { updated, outdated };
}

// ---------------------------------------------------------------------------
// Songs and notes
// ---------------------------------------------------------------------------

/** Adds a new song to the catalog, so it can be planned (and has a Library page) before it is ever sung. */
export async function createSong(
  input: unknown,
): Promise<ActionResult<{ title: string; number: string | null; key: string | null }>> {
  return withPermission(PERMISSION, async (viewer) => {
    const parsed = newSongSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const song = parsed.data;
    const created = await createCatalogSong(viewer.env, song, viewer.userId);
    if (!created) return { ok: false, error: copy.newSong.exists };
    revalidatePath("/library");
    refreshPlanner();
    return {
      ok: true,
      value: { title: song.title, number: song.number, key: song.defaultKey },
      message: copy.newSong.created,
    };
  });
}

