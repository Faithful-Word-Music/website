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
  insertPlaces,
  insertRestoreFor,
  insertSongs,
  insertUpdateFor,
  isInsert,
  isLocked,
  parseAnchor,
  placeInserts,
  planSong,
  startingSlots,
  withWeekInsert,
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
  setPlanStatus,
  setWeekInserts,
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
  insertNumbered: copy.inserts.numberedSong,
  insertTwice: copy.inserts.twice,
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

/** The inserts of the week `date` is in, in order: none, one, or two. */
async function weekFor(viewer: Viewer, date: string): Promise<InsertWeek[]> {
  const weekStart = addDays(date, -dayOfWeek(date));
  return listInsertWeeks(viewer.env, weekStart, weekStart);
}

/** Where a service's inserts are and what they are - to tell whether a save changed any of them. */
function insertsOf(slots: PlanSlots): string {
  return JSON.stringify(
    insertPlaces(slots).map((index) => {
      const song = slots[index]!;
      return [index, song.title, song.key];
    }),
  );
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

    const week = current ? [] : await weekFor(viewer, where.date);
    const before = current?.slots ?? startingSlots(where.date, where.slot, week);
    // Each song is made here from its title, number and key: whether it is an insert is not the browser's to say.
    const slots: PlanSlots = parsed.data.slots.map((song) => (song ? planSong(song) : null));
    // A service follows its week's inserts until one of its own is changed here: moved, replaced
    // (by another insert, or by a hymn, which is then no insert at all), removed or added to.
    const insertMode =
      current?.insertMode === "custom" || insertsOf(before) !== insertsOf(slots) ? "custom" : "week";

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

    // A draft that takes or drops the week's inserts changes what the song list shows for it (plannedInserts).
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
 * service nobody has opened yet is stored first, with the week's inserts.
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
      if (parsed.data.status === "draft") return { ok: true, value: { status: "draft" }, message: copy.workspace.returnedToDraft };
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
    return {
      ok: true,
      value: { status: plan.status },
      message:
        plan.status === "cancelled"
          ? copy.workspace.cancelled
          : current?.status === "cancelled"
            ? copy.workspace.restored
            : copy.workspace.returnedToDraft,
    };
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
 * Sets (or clears) one of a week's inserts - its insert, or the optional
 * second - and passes the week's whole set on to the week's services that
 * still follow it. Drafts and services not stored yet simply take it; a
 * published service still to come takes it and is returned to draft, and the
 * result says how many were (passInsertOn).
 *
 * An insert is a song with no hymnal number, so a hymn is refused here: it
 * could never be told from the service's ordinary songs. (In a service's own
 * plan a hymn can still be put where the insert stood.) What clearing the
 * first of two does, and the rest of the arithmetic, is withWeekInsert().
 */
export async function setInsertWeek(input: unknown): Promise<ActionResult<{ updated: number; returned: number }>> {
  return withPermission(PERMISSION, async (viewer) => {
    const parsed = insertWeekSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { weekStart, index, song } = parsed.data;
    if (dayOfWeek(weekStart) !== 0) return { ok: false, error: MESSAGES.notSunday };
    if (song && !isInsert(song)) return { ok: false, error: MESSAGES.insertNumbered };

    const week = withWeekInsert(await listInsertWeeks(viewer.env, weekStart, weekStart), weekStart, index, song);
    if (!week) return { ok: false, error: MESSAGES.insertTwice };
    await setWeekInserts(viewer.env, weekStart, week, viewer.userId);
    const { updated, returned } = await passInsertOn(viewer, weekStart, week);

    // The song list shows a planned insert on services not posted yet, and loses the ones returned to draft.
    refreshEverything();
    return {
      ok: true,
      value: { updated, returned },
      message: [
        updated === 0 ? copy.inserts.saved : plural(copy.inserts.savedUpdated, updated),
        returned > 0 ? plural(copy.inserts.returned, returned) : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
  });
}

/**
 * Brings a week's services up to date with its inserts as they stand, with
 * nothing about the week changed: for the published services that still show
 * an older set (from before a change returned them to draft by itself).
 */
export async function applyInsertToPublished(input: unknown): Promise<ActionResult<{ returned: number }>> {
  return withPermission(PERMISSION, async (viewer) => {
    const parsed = insertWeekSchema.pick({ weekStart: true }).safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { weekStart } = parsed.data;
    const week = await listInsertWeeks(viewer.env, weekStart, weekStart);

    const { returned } = await passInsertOn(viewer, weekStart, week);
    refreshEverything();
    return { ok: true, value: { returned }, message: plural(copy.inserts.returned, returned) };
  });
}

/**
 * Puts the week's inserts back into its services that went their own way
 * (one of their inserts was moved, replaced or removed there), and has them
 * follow the week again. The week itself is not changed. Whatever insert such
 * a service had of its own gives way to the week's.
 */
export async function restoreWeekInserts(input: unknown): Promise<ActionResult<{ updated: number; returned: number }>> {
  return withPermission(PERMISSION, async (viewer) => {
    const parsed = insertWeekSchema.pick({ weekStart: true }).safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { weekStart } = parsed.data;
    const week = await listInsertWeeks(viewer.env, weekStart, weekStart);

    const { updated, returned } = await passInsertOn(viewer, weekStart, week, insertRestoreFor);
    refreshEverything();
    return {
      ok: true,
      value: { updated, returned },
      message:
        [updated > 0 ? plural(copy.inserts.restored, updated) : null, returned > 0 ? plural(copy.inserts.returned, returned) : null]
          .filter(Boolean)
          .join(" ") || copy.inserts.nothingRestored,
    };
  });
}

/**
 * Puts the week's inserts, all of them, into its services that are due them:
 * those that follow the week (insertUpdateFor) or, when they are being put
 * back, those that had stopped (insertRestoreFor) - which follow it again. A
 * published service still to come is returned to draft as well, so what the
 * song list shows is always something that was published as it reads.
 */
async function passInsertOn(
  viewer: Viewer,
  weekStart: string,
  week: readonly InsertWeek[],
  decide: typeof insertUpdateFor = insertUpdateFor,
): Promise<{ updated: number; returned: number }> {
  const now = Date.now();
  const plans = await listPlans(viewer.env, { from: weekStart, to: addDays(weekStart, 6) });
  let updated = 0;
  let returned = 0;

  for (const plan of plans) {
    const what = decide(plan, week, now);
    if (what === "leave") continue;
    const slots = placeInserts(plan.slots, insertSongs(week));
    const saved = await savePlan(
      viewer.env,
      { ...plan, slots, insertMode: "week" },
      plan.revision,
      viewer.userId,
      diffSlots(plan.slots, slots),
    );
    if (!saved.ok) continue;
    if (what === "update") updated += 1;
    else if (await setPlanStatus(viewer.env, plan, "draft", viewer.userId)) returned += 1;
  }
  return { updated, returned };
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

