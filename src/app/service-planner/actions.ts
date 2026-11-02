"use server";

import { revalidatePath, updateTag } from "next/cache";

import { siteConfig } from "@/config/site";
import { servicePlannerContent } from "@/content/service-planner";
import { firstIssue } from "@/lib/auth/forms";
import { withPermission, type ActionResult, type Viewer } from "@/lib/auth/session";
import { addDays, findOccurrence, serviceOccurrences, type Occurrence } from "@/lib/availability/occurrences";
import {
  servicePlanPublished,
  servicePlanSaved,
  servicePlanStatusChanged,
  servicePlansWithdrawnByInsert,
  type ServiceRef,
} from "@/lib/notifications/events/service-plan";
import { LEADERSHIP_TAG, loadLeaderPeople } from "@/lib/leadership/load";
import {
  diffAssignments,
  GUEST_LEADER,
  leadersIn,
  pruneOverrides,
  sameLeadership,
  snapshot,
  type Leadership,
} from "@/lib/leadership/model";
import { tellChangeSoon } from "@/lib/leadership/notify";
import {
  changeStatement,
  getLeadership,
  leadershipStatements,
  saveLeadership,
  type ChangeWrite,
} from "@/lib/leadership/store";
import { notifyBestEffort } from "@/lib/notifications/send";
import { plural } from "@/lib/plural";
import { RECORDINGS_TAG } from "@/lib/recordings/load";
import { pruneSelectionsStatement, recordingsSql } from "@/lib/recordings/store";
import { SCHEDULE_TAG } from "@/lib/schedule";
import { dayOfWeek } from "@/lib/service-time";
import { getSheetMusicIndex } from "@/lib/sheet-music-index";
import { CATALOG_TAG } from "@/lib/song-archive";
import { identifySong, indexEntries, referenceEntries, songIdentity, type IdentityEntry, type SongReference } from "@/lib/song-identity";
import { startsAtAt } from "@/lib/service-planner/format";
import { newPlaceId, placeIdsFor } from "@/lib/service-planner/places";
import {
  insertWeekSchema,
  newSongSchema,
  publishSchema,
  saveLeadershipSchema,
  saveServiceSchema,
  specialServiceSchema,
  statusSchema,
} from "@/lib/service-planner/forms";
import { buildCandidates, insertPlacementIdentity } from "@/lib/service-planner/intelligence";
import {
  diffSlots,
  emptySlots,
  insertRestoreFor,
  insertSongs,
  insertUpdateFor,
  isInsert,
  isLocked,
  parseAnchor,
  placeInsertsWithPlaces,
  positionalPlaceIds,
  planSong,
  startingSlots,
  slotSongs,
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
  listCatalogSongs,
  listPlans,
  publishPlans,
  savePlan,
  savePlanWith,
  setPlanStatus,
  setPlanStatusWith,
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
 *      published service changed, only the planner's pages for a draft;
 *   6. tells the people it affects, when it changes what they must prepare
 *      (src/lib/notifications/events/service-plan.ts). That is best effort:
 *      the change is saved whether or not anyone could be told.
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
  placeGone: copy.leaders.placeGone,
  notLeader: copy.leaders.notLeader,
} as const;

/**
 * Only the planner (and the Dashboard, which summarises it) shows drafts.
 * Song leaders are read from their own cache (src/lib/leadership/load.ts),
 * which any change to a service's songs, status or leaders makes stale.
 */
function refreshPlanner() {
  updateTag(LEADERSHIP_TAG);
  revalidatePath("/service-planner", "layout");
  revalidatePath("/dashboard");
}

/** Something on the song list changed: the stored schedule, and every page that shows it. */
function refreshEverything() {
  updateTag(SCHEDULE_TAG);
  updateTag(LEADERSHIP_TAG);
  // The Preparation Playlists' recording choices, which follow the published services.
  updateTag(RECORDINGS_TAG);
  revalidatePath("/", "layout");
}

/** Everyone a set of leaders names: the default and each person assigned to a song. */
function namedIn(leadership: Pick<Leadership, "defaultUserId" | "overrides">): string[] {
  return [
    ...new Set([
      ...(leadership.defaultUserId ? [leadership.defaultUserId] : []),
      ...Object.values(leadership.overrides).flatMap((override) => (override.kind === "assigned" ? [override.userId] : [])),
    ]),
  ];
}

/**
 * Whether everyone newly named can lead: holds lead_songs (on purpose) with
 * an account that is not disabled - checked here, never taken from the
 * browser. Someone already assigned who can no longer lead may stay, so
 * saving something else never silently drops them; they are flagged in the
 * planner instead.
 */
async function refuseNewLeaders(
  viewer: Viewer,
  before: Pick<Leadership, "defaultUserId" | "overrides">,
  after: Pick<Leadership, "defaultUserId" | "overrides">,
): Promise<string | null> {
  const already = new Set(namedIn(before));
  // A guest (GUEST_LEADER) has no account to check.
  const added = namedIn(after).filter((id) => !already.has(id) && id !== GUEST_LEADER);
  if (added.length === 0) return null;
  const people = await loadLeaderPeople(viewer.env, added);
  const able = new Set(people.filter((person) => person.eligible).map((person) => person.id));
  return added.every((id) => able.has(id)) ? null : MESSAGES.notLeader;
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

/** The same index and durable catalog associations used by the editor. */
async function knownSongs(viewer: Viewer, refs: readonly SongReference[] = []): Promise<IdentityEntry[]> {
  const index = await getSheetMusicIndex();
  const catalog = await listCatalogSongs(viewer.env, indexEntries(index.ok ? index.index.songs : []));
  const candidates = buildCandidates({ past: [], planned: [], catalog, index: index.ok ? index.index : null, hymnalCollection: siteConfig.sheetMusic.hymnalCollection });
  return referenceEntries(refs, candidates);
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

    const [current, leadersBefore] = await Promise.all([getPlan(viewer.env, where.date, where.slot), getLeadership(viewer.env, where)]);
    const occurrence = occurrenceFor(where.date, where.slot, current);
    if (!occurrence) return { ok: false, error: MESSAGES.notFound };
    if (current?.status === "cancelled") return { ok: false, error: MESSAGES.cancelled };
    if (isLocked(current?.startsAt ?? occurrence.startsAt, now)) return { ok: false, error: MESSAGES.locked };
    if ((current?.revision ?? null) !== revision) return { ok: false, error: MESSAGES.conflict };

    const week = current ? [] : await weekFor(viewer, where.date);
    const previous = current?.slots ?? startingSlots(where.date, where.slot, week);
    const placesBefore = current?.places ?? positionalPlaceIds(previous.length);
    const identities = await knownSongs(viewer, [...previous, ...parsed.data.slots].filter((song) => song !== null));
    const before = previous.map((song) => song ? identifySong(song, identities) : null);
    // Each song is made here from its title, number and key: whether it is an insert is not the browser's to say.
    const slots: PlanSlots = parsed.data.slots.map((song) => (song ? planSong(identifySong(song, identities)) : null));
    // Each place keeps its ID (src/lib/service-planner/places.ts). A tab opened before places had
    // IDs sends none: the stored ones are kept place by place.
    const places = parsed.data.places ?? placeIdsFor(slots.length, placesBefore);
    // A service follows its week's inserts until one of its own is changed here: moved, replaced
    // (by another insert, or by a hymn, which is then no insert at all), removed or added to.
    const insertChanged = insertPlacementIdentity(before, identities) !== insertPlacementIdentity(slots, identities);
    const insertMode = current?.insertMode === "custom" || insertChanged ? "custom" : "week";

    // Song leaders, saved with the songs when they were changed too. A place removed takes its
    // own leader with it; every other assignment stays with its place, wherever it moved.
    const submitted = parsed.data.leadership;
    if (submitted && submitted.revision !== leadersBefore.revision) return { ok: false, error: MESSAGES.conflict };
    if (submitted && Object.keys(submitted.overrides).some((placeId) => !places.includes(placeId))) {
      return { ok: false, error: MESSAGES.placeGone };
    }
    const wanted = submitted ?? leadersBefore;
    const { overrides, dropped } = pruneOverrides(wanted.overrides, places);
    const leadersAfter = { defaultUserId: wanted.defaultUserId, overrides };
    if (submitted) {
      const refused = await refuseNewLeaders(viewer, leadersBefore, leadersAfter);
      if (refused) return { ok: false, error: refused };
    }
    // Removing a place is checked against the leaders' revision too, even when it had no leader of
    // its own when read: someone may have just given it one, and that must not be left pointing
    // at a place that is gone (or its leader never told). Every removed place's override goes.
    const removedPlaces = placesBefore.filter((placeId) => !places.includes(placeId));
    const leadersChanged = (submitted ? !sameLeadership(leadersBefore, leadersAfter) : dropped.length > 0) || removedPlaces.length > 0;
    const rosterBefore = snapshot(placesBefore, leadersBefore);
    const rosterAfter = snapshot(places, leadersAfter);
    const leaderChange: ChangeWrite | null =
      diffAssignments(rosterBefore, rosterAfter).length > 0
        ? { cause: submitted && leadersChanged ? "assignment" : "songs", details: { before: rosterBefore, after: rosterAfter } }
        : null;

    const kind = current?.kind ?? occurrence.kind;
    let changeId: string | null = null;
    // A recording chosen for a place stays with it only while it holds the same song: one moved
    // keeps its recording, one replaced loses it (src/lib/recordings/store.ts).
    const keepSelections = places.flatMap((placeId, index) => {
      const song = slots[index];
      return song ? [{ placeId, songId: songIdentity(song) }] : [];
    });
    if (current) await recordingsSql();
    const saved = await savePlanWith(
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
        places,
      },
      current?.revision ?? null,
      viewer.userId,
      diffSlots(before, slots),
      // In the same transaction as the songs: never songs saved with leaders pointing at places
      // that are gone, or leaders saved for songs that were not.
      (sql) => {
        const selections = current ? [pruneSelectionsStatement(sql, viewer.env, where, keepSelections)] : [];
        if (leadersChanged) {
          const built = leadershipStatements(sql, viewer.env, where, {
            expectedRevision: leadersBefore.revision,
            write: submitted ? leadersAfter : null,
            dropped: removedPlaces,
            actor: viewer.userId,
            change: leaderChange,
          });
          changeId = built.changeId;
          return [...built.statements, ...selections];
        }
        if (!leaderChange) return selections;
        const built = changeStatement(sql, viewer.env, where, leaderChange, viewer.userId);
        changeId = built.changeId;
        return [built.statement, ...selections];
      },
    );
    if (!saved.ok) return { ok: false, error: MESSAGES.conflict };
    tellChangeSoon(viewer.env, changeId);

    let plan = saved.plan;
    let publicationId: string | null = null;
    if (publish) {
      ({ publicationId } = await publishPlans(viewer.env, [where], viewer.userId));
      plan = (await getPlan(viewer.env, where.date, where.slot)) ?? plan;
    }

    // Told only of what changes their preparation (events/service-plan.ts): a service newly
    // published, or a published one whose songs, keys or time changed. A draft is silent.
    await notifyBestEffort(
      viewer.env,
      servicePlanSaved({
        actorId: viewer.userId,
        statusBefore: current?.status ?? null,
        startsAtBefore: current?.startsAt ?? occurrence.startsAt,
        publicationId,
        service: plan,
        changes: diffSlots(before, slots),
        now,
      }),
    );

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
    /** The ones not already on the song list: what the publication has to announce. */
    const fresh: ServiceRef[] = [];

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
      if (plan?.status !== "published") {
        fresh.push({ ...where, startsAt: plan?.startsAt ?? occurrence.startsAt, label: plan?.label ?? occurrence.label ?? null });
      }
    }

    const { publicationId, count } = await publishPlans(viewer.env, targets, viewer.userId);
    refreshEverything();

    // ONE notification for the publication, however many services are in it. A service that was
    // already published and is only published again is nothing new to anyone.
    await notifyBestEffort(viewer.env, servicePlanPublished({ actorId: viewer.userId, publicationId, services: fresh, now }));
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

    const [current, leaders] = await Promise.all([getPlan(viewer.env, where.date, where.slot), getLeadership(viewer.env, where)]);
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

    // Its leaders, as they stand: told in their own words when the service is cancelled or
    // restored (and left out of the general notice, so each hears it once).
    const roster = snapshot(current?.places ?? positionalPlaceIds(startingSlots(where.date, where.slot, []).length), leaders);
    const leading = leadersIn(roster);
    const before = current?.status ?? null;
    const cancelling = parsed.data.status === "cancelled" && before !== "cancelled";
    const restoring = parsed.data.status === "draft" && before === "cancelled";
    const leaderChange: ChangeWrite | null =
      leading.length > 0 && (cancelling || restoring)
        ? { cause: "status", details: { before: roster, after: roster, status: { from: before, to: parsed.data.status } } }
        : null;
    let changeId: string | null = null;

    const plan = await setPlanStatusWith(viewer.env, where, parsed.data.status, viewer.userId, (sql) => {
      if (!leaderChange) return [];
      const built = changeStatement(sql, viewer.env, where, leaderChange, viewer.userId);
      changeId = built.changeId;
      return [built.statement];
    });
    if (!plan) return { ok: false, error: MESSAGES.notFound };
    // Leaving or entering the song list, or appearing/vanishing in Availability.
    refreshEverything();
    tellChangeSoon(viewer.env, changeId);

    // A song list people were given has gone, or a service they expected has: those are told.
    // A draft made a draft again, or a cancelled service cancelled again, is not.
    await notifyBestEffort(
      viewer.env,
      servicePlanStatusChanged({
        actorId: viewer.userId,
        before,
        after: plan.status,
        service: plan,
        now: Date.now(),
        alsoExcept: leaderChange ? leading : [],
      }),
    );
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
    // A draft's insert mode reaches the song list (plannedInserts in src/lib/schedule.ts).
    updateTag(SCHEDULE_TAG);
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
    updateTag(SCHEDULE_TAG);
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

    const previous = await listInsertWeeks(viewer.env, weekStart, weekStart);
    const identities = await knownSongs(viewer, [...previous, ...(song ? [song] : [])]);
    const identify = <T extends SongReference>(item: T) => identifySong(item, identities);
    const week = withWeekInsert(previous.map(identify), weekStart, index, song ? identify(song) : null);
    if (!week) return { ok: false, error: MESSAGES.insertTwice };
    await setWeekInserts(viewer.env, weekStart, week, viewer.userId);
    const { updated, returned } = await passInsertOn(viewer, weekStart, week, insertUpdateFor, identities);
    // Nothing is said of the insert itself - only of the published song lists it took back (passInsertOn).

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
 *
 * Those returned to draft are announced here, together, as ONE notification
 * (servicePlansWithdrawnByInsert): the people who had been given those song
 * lists are told they are being revised. Drafts brought up to date are
 * nobody's news, and republishing later announces itself.
 */
async function passInsertOn(
  viewer: Viewer,
  weekStart: string,
  week: readonly InsertWeek[],
  decide: typeof insertUpdateFor = insertUpdateFor,
  identities?: readonly IdentityEntry[],
): Promise<{ updated: number; returned: number }> {
  const now = Date.now();
  const plans = await listPlans(viewer.env, { from: weekStart, to: addDays(weekStart, 6) });
  const references = [...week, ...plans.flatMap((plan) => slotSongs(plan.slots))];
  const known = identities ? referenceEntries(references, identities) : await knownSongs(viewer, references);
  const identifiedWeek = week.map((song) => identifySong(song, known));
  let updated = 0;
  const withdrawn: StoredPlan[] = [];

  for (const stored of plans) {
    const plan = { ...stored, slots: stored.slots.map((song) => song ? identifySong(song, known) : null) };
    const what = decide(plan, identifiedWeek, now);
    if (what === "leave") continue;
    // An insert taking over a place keeps that place - and whoever leads it; no place is removed.
    const { slots, places } = placeInsertsWithPlaces(plan.slots, plan.places, insertSongs(identifiedWeek), newPlaceId);
    const saved = await savePlan(
      viewer.env,
      { ...plan, slots, places, insertMode: "week" },
      plan.revision,
      viewer.userId,
      diffSlots(plan.slots, slots),
    );
    if (!saved.ok) continue;
    if (what === "update") updated += 1;
    else if (await setPlanStatus(viewer.env, plan, "draft", viewer.userId)) withdrawn.push(plan);
  }

  await notifyBestEffort(
    viewer.env,
    servicePlansWithdrawnByInsert({ actorId: viewer.userId, weekStart, services: withdrawn, now }),
  );
  return { updated, returned: withdrawn.length };
}

// ---------------------------------------------------------------------------
// Songs and notes
// ---------------------------------------------------------------------------

/** Adds a new song to the catalog, so it can be planned (and has a Library page) before it is ever sung. */
export async function createSong(
  input: unknown,
): Promise<ActionResult<SongReference & { number: string | null; key: string | null }>> {
  return withPermission(PERMISSION, async (viewer) => {
    const parsed = newSongSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const song = parsed.data;
    const created = await createCatalogSong(viewer.env, song, viewer.userId);
    if (!created) return { ok: false, error: copy.newSong.exists };
    // Its Library page exists at once.
    updateTag(CATALOG_TAG);
    revalidatePath("/library");
    revalidatePath("/library/songs", "layout");
    refreshPlanner();
    return {
      ok: true,
      value: { songId: created.songId, collection: created.collection, title: created.title, number: created.number, key: created.defaultKey },
      message: copy.newSong.created,
    };
  });
}


// ---------------------------------------------------------------------------
// Song leaders
// ---------------------------------------------------------------------------

/**
 * Saves who leads a service's songs - on their own: the songs, keys, status
 * and publication are never touched, the song list is not republished or
 * withdrawn, and nobody is told the song list changed. Works for a service
 * not stored yet (its places are "p1" to "p5") without making it a draft.
 *
 * Refused when the leaders OR the songs were saved by anyone since the page
 * was opened (which places exist is the songs' to say), when a song it names
 * is gone, or when someone it newly names cannot lead. A save that changes
 * nothing records nothing and tells nobody.
 */
export async function saveServiceLeaders(input: unknown): Promise<ActionResult<{ revision: number }>> {
  return withPermission(PERMISSION, async (viewer) => {
    const parsed = saveLeadershipSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { anchor, planRevision, leadership } = parsed.data;
    const where = parseAnchor(anchor)!;

    const [current, before] = await Promise.all([getPlan(viewer.env, where.date, where.slot), getLeadership(viewer.env, where)]);
    const occurrence = occurrenceFor(where.date, where.slot, current);
    if (!occurrence) return { ok: false, error: MESSAGES.notFound };
    if (current?.status === "cancelled") return { ok: false, error: MESSAGES.cancelled };
    if (isLocked(current?.startsAt ?? occurrence.startsAt, Date.now())) return { ok: false, error: MESSAGES.locked };
    if ((current?.revision ?? 0) !== planRevision || before.revision !== leadership.revision) {
      return { ok: false, error: MESSAGES.conflict };
    }

    const places = current?.places ?? positionalPlaceIds(startingSlots(where.date, where.slot, []).length);
    if (Object.keys(leadership.overrides).some((placeId) => !places.includes(placeId))) return { ok: false, error: MESSAGES.placeGone };

    const after = { defaultUserId: leadership.defaultUserId, overrides: leadership.overrides };
    if (sameLeadership(before, after)) return { ok: true, value: { revision: before.revision }, message: copy.leaders.unchanged };
    const refused = await refuseNewLeaders(viewer, before, after);
    if (refused) return { ok: false, error: refused };

    const rosterBefore = snapshot(places, before);
    const rosterAfter = snapshot(places, after);
    const saved = await saveLeadership(viewer.env, where, current?.revision ?? 0, {
      expectedRevision: before.revision,
      write: after,
      dropped: [],
      actor: viewer.userId,
      change:
        diffAssignments(rosterBefore, rosterAfter).length > 0
          ? { cause: "assignment", details: { before: rosterBefore, after: rosterAfter } }
          : null,
      // Stored with the leaders, so they never point at IDs that were only worked out (a service
      // saved before places had IDs, or whose IDs were given afresh). Not stored yet: "p1"... stand.
      places: current ? places : null,
    });
    if (!saved.ok) return { ok: false, error: MESSAGES.conflict };

    // The planner and the Dashboard; the song list's leaders are read through LEADERSHIP_TAG.
    refreshPlanner();
    tellChangeSoon(viewer.env, saved.changeId);
    return { ok: true, value: { revision: saved.revision }, message: copy.leaders.saved };
  });
}
