/**
 * The Service Planner's model: what a planned service is, how the week's
 * insert reaches it, and which services still need planning. Pure - no
 * server-only import, no clock - so all of it is unit tested.
 *
 * ---------------------------------------------------------------------------
 * SERVICES THAT EXIST BEFORE ANYONE PLANS THEM
 * ---------------------------------------------------------------------------
 * Regular services (Sunday AM/PM, Wednesday PM) are generated for any date
 * range (src/lib/availability/occurrences.ts) - nothing is stored for them
 * until someone touches one. Such a "virtual" service already has the week's
 * insert in place, so opening it shows what saving it would keep.
 *
 * Special services, cancellations and every planned song list are stored rows
 * (src/lib/service-planner/store.ts).
 *
 * ---------------------------------------------------------------------------
 * PLACES, NOT A FIXED NUMBER OF SONGS
 * ---------------------------------------------------------------------------
 * A service is an ordered list of places, each a song or still empty: five
 * places by default, but any number. "Psalm 120 in the third place, the rest
 * to come" is [null, null, Psalm 120, null, null].
 *
 * ---------------------------------------------------------------------------
 * THE WEEK'S INSERTS
 * ---------------------------------------------------------------------------
 * A week (Sunday to Saturday) has one insert by default and may be given a
 * second, both set on the Inserts page. They go into that week's Sunday AM,
 * Sunday PM and Wednesday PM: the first in the third place, the second in the
 * fourth. A service follows its week (insertMode "week") until one of its own
 * inserts is moved, replaced or removed - then it is "custom", and the week no
 * longer changes it. Changing a week's inserts changes every service that
 * follows it (insertUpdateFor): a draft is simply brought up to date, and a
 * published service still to come is brought up to date AND returned to
 * draft, so it is published again on purpose. A service already held keeps
 * what was sung.
 *
 * WHAT MAKES A SONG AN INSERT IS THE SONG: one with no hymnal number
 * (isInsert). Nothing marks a place as "the insert's" - a hymn put where the
 * insert stood is an ordinary song there, and a service's inserts are simply
 * its un-numbered songs. The `insert` field a song carries is that same fact
 * written down for the song list and the archive (planSong), never a second
 * opinion.
 */

import { siteConfig } from "@/config/site";
import { addDays, type Occurrence } from "@/lib/availability/occurrences";
import { dayOfWeek } from "@/lib/service-time";
import { FRESH_DAYS } from "@/lib/song-history";
import { serviceAnchor } from "@/lib/site-search";
import { songKey } from "@/lib/song-list";
import type { ServiceSlot, Song } from "@/types/song-list";

export type PlanStatus = "draft" | "published" | "cancelled";
export type ServiceKind = "regular" | "special";
export type InsertMode = "week" | "custom";

/** One song in a planned service. The key belongs to this service, not the song. */
export interface PlanSong {
  title: string;
  number: string | null;
  key: string | null;
  /** No hymnal number: always `number === null`, written by planSong() and never set by hand. */
  insert: boolean;
}

/** A service's places, in order; null is a place not filled yet. */
export type PlanSlots = Array<PlanSong | null>;

/** Who did something, and when. */
export interface Stamp {
  by: string | null;
  at: string;
}

/** A stored service: one row of service_plans with its songs. */
export interface StoredPlan {
  id: number;
  date: string;
  slot: ServiceSlot;
  kind: ServiceKind;
  label: string | null;
  startsAt: string;
  status: PlanStatus;
  insertMode: InsertMode;
  slots: PlanSlots;
  /** Bumped on every save, so two people editing at once never overwrite each other. */
  revision: number;
  created: Stamp;
  updated: Stamp;
  published: Stamp | null;
  /** The publication it was last published in (several services published together share one). */
  publicationId: string | null;
}

/** How many inserts a week may have. */
export const MAX_WEEK_INSERTS = 2;
export type InsertIndex = 1 | 2;

/** One insert chosen for a week. A week's inserts are these in order: 1, then 2 when there is one. */
export interface InsertWeek {
  /** The Sunday that starts the week, "2026-10-11". */
  weekStart: string;
  /** 1 is the week's insert; 2 is the optional second. There is never a 2 without a 1. */
  index: InsertIndex;
  title: string;
  number: string | null;
  key: string | null;
}

export type PlannerStatus = "not-started" | "draft" | "published" | "cancelled";

/** One service as the planner shows it, stored or not. */
export interface PlannerService {
  /** "2026-10-11-am": the service's address in the planner and on the song list. */
  anchor: string;
  date: string;
  slot: ServiceSlot;
  kind: ServiceKind;
  label: string | null;
  startsAt: string;
  status: PlannerStatus;
  insertMode: InsertMode;
  slots: PlanSlots;
  /** Places with a song. */
  filled: number;
  /** All places, filled or not. */
  target: number;
  /** The stored row, or null for a regular service nobody has touched yet. */
  plan: StoredPlan | null;
}

const { defaultSongs, insertPosition, insertServices } = siteConfig.servicePlanner;

/** The Sunday on or before `date`: the week an insert belongs to. */
export function weekStartOf(date: string): string {
  return addDays(date, -dayOfWeek(date));
}

/** Whether the week's insert normally goes into this service. */
export function takesWeekInsert(date: string, slot: ServiceSlot): boolean {
  const day = dayOfWeek(date);
  return insertServices.some((service) => service.day === day && service.slot === slot);
}

/**
 * Whether a song is an insert: it has no hymnal number. That is the whole
 * rule, for a place in a service as for the week's own choice - a hymn from
 * the hymnal is never an insert, wherever it stands.
 */
export function isInsert(song: Pick<Song, "number">): boolean {
  return song.number === null;
}

/**
 * Whether a song of the HISTORY was recorded as an insert when it was sung.
 * The archive holds services from before the planner, whose un-numbered songs
 * were never recorded either way, so it shows what was written down.
 */
export function recordedInsert(song: Pick<Song, "number" | "insert">): boolean {
  return song.insert === true && song.number === null;
}

/** A song as a place in a service. The only way one is made, so `insert` always follows the number. */
export function planSong(song: { title: string; number: string | null; key: string | null }): PlanSong {
  return { title: song.title, number: song.number, key: song.key, insert: song.number === null };
}

/** Where a service's inserts stand, from 0, in order. */
export function insertPlaces(slots: PlanSlots): number[] {
  return slots.flatMap((song, index) => (song && isInsert(song) ? [index] : []));
}

/** `count` empty places. */
export function emptySlots(count: number = defaultSongs): PlanSlots {
  return Array.from({ length: Math.max(0, count) }, () => null);
}

/** One of a week's inserts, as a place in a service. */
export function insertSong(week: Pick<InsertWeek, "title" | "number" | "key">): PlanSong {
  return planSong(week);
}

/** A week's inserts as the places they take, in order. */
export function insertSongs(inserts: readonly InsertWeek[]): PlanSong[] {
  return [...inserts].sort((a, b) => a.index - b.index).map(insertSong);
}

/**
 * `slots` with its inserts replaced by `inserts`, in order (none removes them):
 *
 *   every insert there now is taken out, and each new one goes where the one
 *   it replaces stood. One with no place to take over goes into its usual
 *   place - the 3rd for the first, straight after the insert before it for
 *   the next - when that is empty; otherwise the first empty place after the
 *   insert before it (anywhere, for the first); failing all, it is put in at
 *   its usual place and the songs after it move down.
 *
 * The inserts always end up in the order given, so a service that follows its
 * week reads the same way round as the Inserts page.
 */
export function placeInserts(slots: PlanSlots, inserts: readonly PlanSong[]): PlanSlots {
  const result = [...slots];
  const previous = insertPlaces(result);
  for (const index of previous) result[index] = null;

  let last = -1;
  inserts.forEach((insert, order) => {
    const usual = order === 0 ? insertPosition - 1 : last + 1;
    const free = result.findIndex((song, index) => song === null && index > last);
    const target =
      order < previous.length ? previous[order] : usual < result.length && result[usual] === null ? usual : free;

    if (target >= 0) {
      result[target] = insert;
      last = target;
    } else {
      while (result.length < usual) result.push(null);
      last = Math.min(usual, result.length);
      result.splice(last, 0, insert);
    }
  });
  return result;
}

/** The places a service no one has planned yet starts with. */
export function startingSlots(date: string, slot: ServiceSlot, inserts: readonly InsertWeek[]): PlanSlots {
  const slots = emptySlots();
  return inserts.length > 0 && takesWeekInsert(date, slot) ? placeInserts(slots, insertSongs(inserts)) : slots;
}

/** Whether a stored service still shows its week's inserts as they are now: the same songs, keys and order. */
export function followsWeek(slots: PlanSlots, inserts: readonly InsertWeek[]): boolean {
  const current = insertPlaces(slots).map((index) => slots[index]!);
  const wanted = insertSongs(inserts);
  return (
    current.length === wanted.length &&
    current.every((song, order) => songKey(song.title) === songKey(wanted[order].title) && song.key === wanted[order].key)
  );
}

/** What a change to its week's inserts does to one stored service. */
export type InsertUpdate = "leave" | "update" | "update-and-unpublish";

/**
 * What the week's inserts, as they are now, mean for a stored service:
 *
 *   leave                 it does not follow the week, already shows this
 *                         set, is cancelled or locked - or is published and
 *                         has been held, so it is the record of what was sung
 *   update                a draft: it takes the week's inserts
 *   update-and-unpublish  published and still to come: it takes them and goes
 *                         back to draft, off the song list until it is
 *                         published again
 */
export function insertUpdateFor(
  plan: Pick<StoredPlan, "date" | "slot" | "status" | "insertMode" | "slots" | "startsAt">,
  week: readonly InsertWeek[],
  now: number,
): InsertUpdate {
  if (plan.insertMode !== "week" || followsWeek(plan.slots, week)) return "leave";
  return weekInsertChange(plan, now);
}

/**
 * What putting the week's inserts BACK does to a stored service that went
 * its own way (insertMode "custom" - one of its inserts was moved, replaced
 * or removed there): it takes the week's inserts again and follows the week
 * from then on, by the same rule as any other change to them. A service
 * that still follows the week has nothing to put back.
 */
export function insertRestoreFor(
  // A service as the planner shows it will do: the Inserts page asks before offering.
  plan: Pick<PlannerService, "date" | "slot" | "status" | "insertMode" | "startsAt">,
  week: readonly InsertWeek[],
  now: number,
): InsertUpdate {
  if (plan.insertMode !== "custom" || week.length === 0) return "leave";
  return weekInsertChange(plan, now);
}

/** Whether the week's inserts may be written into a service at all, and what becomes of it. */
function weekInsertChange(plan: Pick<PlannerService, "date" | "slot" | "status" | "startsAt">, now: number): InsertUpdate {
  if (plan.status === "cancelled" || !takesWeekInsert(plan.date, plan.slot) || isLocked(plan.startsAt, now)) return "leave";
  if (plan.status !== "published") return "update";
  return Date.parse(plan.startsAt) > now ? "update-and-unpublish" : "leave";
}

/** Whether a service has any of these inserts among its songs, wherever it stands. */
export function carriesInsert(slots: PlanSlots, inserts: readonly Pick<InsertWeek, "title">[]): boolean {
  const wanted = new Set(inserts.map((insert) => songKey(insert.title)));
  return slots.some((song) => song !== null && wanted.has(songKey(song.title)));
}

/**
 * A week's inserts after one of them is set (or, with null, cleared).
 *
 *   - Setting the 2nd needs a 1st: without one the song becomes the 1st.
 *   - Clearing the 1st while there is a 2nd makes the 2nd the week's insert,
 *     so a week never has "only a second insert".
 *   - A week never holds the same song twice: setting one insert to the
 *     other's song is refused (null).
 */
export function withWeekInsert(
  inserts: readonly InsertWeek[],
  weekStart: string,
  index: InsertIndex,
  song: { title: string; number: string | null; key: string | null } | null,
): InsertWeek[] | null {
  const ordered = [...inserts].sort((a, b) => a.index - b.index);
  const at = Math.min(index, ordered.length + 1) - 1;
  const others = ordered.filter((_, position) => position !== at);
  if (song && others.some((other) => songKey(other.title) === songKey(song.title))) return null;

  const next = song
    ? [...ordered.slice(0, at), { title: song.title, number: song.number, key: song.key }, ...ordered.slice(at + 1)]
    : others;
  return next.slice(0, MAX_WEEK_INSERTS).map((item, position) => ({
    weekStart,
    index: (position + 1) as InsertIndex,
    title: item.title,
    number: item.number,
    key: item.key,
  }));
}

/** The inserts of each week, by the Sunday that starts it, each week's in order. */
export function insertsByWeek(inserts: readonly InsertWeek[]): Map<string, InsertWeek[]> {
  const weeks = new Map<string, InsertWeek[]>();
  for (const insert of [...inserts].sort((a, b) => a.index - b.index)) {
    weeks.set(insert.weekStart, [...(weeks.get(insert.weekStart) ?? []), insert]);
  }
  return weeks;
}

/** The planner's view of one service. */
export function plannerService(
  occurrence: Pick<Occurrence, "date" | "slot" | "kind" | "startsAt" | "label">,
  plan: StoredPlan | null,
  inserts: readonly InsertWeek[],
): PlannerService {
  const slots = plan ? plan.slots : startingSlots(occurrence.date, occurrence.slot, inserts);
  return {
    anchor: serviceAnchor(occurrence.date, occurrence.slot),
    date: occurrence.date,
    slot: occurrence.slot,
    kind: plan?.kind ?? occurrence.kind,
    label: plan?.label ?? occurrence.label ?? null,
    startsAt: plan?.startsAt ?? occurrence.startsAt,
    status: plan ? plan.status : "not-started",
    insertMode: plan?.insertMode ?? "week",
    slots,
    filled: slots.filter(Boolean).length,
    target: slots.length,
    plan,
  };
}

/** A service without its stored row - what a page hands the browser. */
export function withoutPlan(service: PlannerService): Omit<PlannerService, "plan"> {
  const copy: Partial<PlannerService> = { ...service };
  delete copy.plan;
  return copy as Omit<PlannerService, "plan">;
}

/** Whether a service is still in the planner's working list: unfinished and not over. */
export function needsPlanning(service: Pick<PlannerService, "status">): boolean {
  return service.status === "not-started" || service.status === "draft";
}

/**
 * Whether a service can no longer be changed. Its songs have become history,
 * and history is frozen FRESH_DAYS after the service (src/lib/song-history.ts)
 * - the same rule the archive keeps.
 */
export function isLocked(startsAt: string, now: number): boolean {
  return Date.parse(startsAt) <= now - FRESH_DAYS * 86_400_000;
}

/** "2026-10-11-am" -> { date, slot }, or null for anything else. */
export function parseAnchor(anchor: string): { date: string; slot: ServiceSlot } | null {
  const match = /^(\d{4}-\d{2}-\d{2})-(am|pm)$/.exec(anchor);
  return match ? { date: match[1], slot: match[2].toUpperCase() as ServiceSlot } : null;
}

/** The songs of a service, empty places dropped - what the song list and history see. */
export function slotSongs(slots: PlanSlots): Song[] {
  return slots
    .filter((song): song is PlanSong => song !== null)
    .map((song) => ({ number: song.number, title: song.title, key: song.key, ...(isInsert(song) ? { insert: true } : {}) }));
}

/** Where a service's empty places sit, for Service.pendingPositions. */
export function emptyPositions(slots: PlanSlots): number[] {
  return slots.flatMap((song, index) => (song ? [] : [index]));
}

// ---------------------------------------------------------------------------
// Changes - what an edit did, kept with every save (service_plan_events), so a
// future notification can say "Psalm 54 was added" rather than "it changed".
// ---------------------------------------------------------------------------

export type SongChange =
  | { type: "added"; title: string; position: number; key: string | null }
  | { type: "removed"; title: string; position: number }
  | { type: "moved"; title: string; from: number; to: number }
  | { type: "key"; title: string; from: string | null; to: string | null };

/**
 * The difference between two versions of a service's places, song by song.
 * Positions are 1-based, as people count them.
 */
export function diffSlots(before: PlanSlots, after: PlanSlots): SongChange[] {
  const index = (slots: PlanSlots) => {
    const map = new Map<string, { song: PlanSong; position: number }>();
    slots.forEach((song, position) => {
      if (song) map.set(songKey(song.title), { song, position: position + 1 });
    });
    return map;
  };
  const was = index(before);
  const now = index(after);
  const changes: SongChange[] = [];

  for (const [id, { song, position }] of was) {
    if (!now.has(id)) changes.push({ type: "removed", title: song.title, position });
  }
  for (const [id, { song, position }] of now) {
    const previous = was.get(id);
    if (!previous) {
      changes.push({ type: "added", title: song.title, position, key: song.key });
      continue;
    }
    if (previous.position !== position) {
      changes.push({ type: "moved", title: song.title, from: previous.position, to: position });
    }
    if ((previous.song.key ?? null) !== (song.key ?? null)) {
      changes.push({ type: "key", title: song.title, from: previous.song.key, to: song.key });
    }
  }
  return changes;
}
