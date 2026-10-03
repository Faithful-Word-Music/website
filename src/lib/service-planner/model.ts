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
 * THE WEEK'S INSERT
 * ---------------------------------------------------------------------------
 * One insert per week (Sunday to Saturday), set on the Inserts page, goes into
 * the third place of that week's Sunday AM, Sunday PM and Wednesday PM. A
 * service follows its week (insertMode "week") until its own insert is moved,
 * replaced or removed - then it is "custom", and the week no longer changes it.
 * A published service is never changed behind anyone's back: the Inserts page
 * offers to update the ones that still show an old insert.
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
  /** The week's insert (or a service's own replacement for it). */
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

/** The insert chosen for one week. */
export interface InsertWeek {
  /** The Sunday that starts the week, "2026-10-11". */
  weekStart: string;
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

/** `count` empty places. */
export function emptySlots(count: number = defaultSongs): PlanSlots {
  return Array.from({ length: Math.max(0, count) }, () => null);
}

/** The song in an insert week, as a place in a service. */
export function insertSong(week: Pick<InsertWeek, "title" | "number" | "key">): PlanSong {
  return { title: week.title, number: week.number, key: week.key, insert: true };
}

/**
 * `slots` with its insert replaced by `insert` (or removed, when null):
 *
 *   the old insert's place is emptied, and the new one goes there - or into
 *   the usual place (3rd) when there was none - or, if that is taken, the
 *   first empty place - or, failing all, on the end.
 */
export function placeInsert(slots: PlanSlots, insert: PlanSong | null): PlanSlots {
  const result = [...slots];
  const previous = result.findIndex((song) => song?.insert);
  if (previous >= 0) result[previous] = null;
  if (!insert) return result;

  const usual = insertPosition - 1;
  const target =
    previous >= 0
      ? previous
      : usual < result.length && result[usual] === null
        ? usual
        : result.indexOf(null);

  if (target >= 0) {
    result[target] = insert;
  } else {
    while (result.length < usual) result.push(null);
    result.splice(Math.min(usual, result.length), 0, insert);
  }
  return result;
}

/** The places a service no one has planned yet starts with. */
export function startingSlots(date: string, slot: ServiceSlot, week: InsertWeek | null): PlanSlots {
  const slots = emptySlots();
  return week && takesWeekInsert(date, slot) ? placeInsert(slots, insertSong(week)) : slots;
}

/** Whether a stored service still shows its week's insert as it is now. */
export function followsWeek(slots: PlanSlots, week: InsertWeek | null): boolean {
  const current = slots.find((song) => song?.insert) ?? null;
  if (!week) return current === null;
  return current !== null && songKey(current.title) === songKey(week.title) && current.key === week.key;
}

/** The planner's view of one service. */
export function plannerService(
  occurrence: Pick<Occurrence, "date" | "slot" | "kind" | "startsAt" | "label">,
  plan: StoredPlan | null,
  week: InsertWeek | null,
): PlannerService {
  const slots = plan ? plan.slots : startingSlots(occurrence.date, occurrence.slot, week);
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
    .map((song) => ({ number: song.number, title: song.title, key: song.key, ...(song.insert ? { insert: true } : {}) }));
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
