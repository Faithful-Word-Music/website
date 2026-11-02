import { serviceFullDate, serviceTitle } from "@/lib/service-planner/format";
import type { StoredPlan } from "@/lib/service-planner/model";
import { serviceAnchor } from "@/lib/site-search";
import { songIdentity } from "@/lib/song-identity";
import { monthTitle } from "@/lib/schedule-months";
import { churchYear } from "@/lib/service-time";

import type { RecordingSelection } from "./model";
import { selectionState, type SelectionState } from "./resolve";

/**
 * Preparation Playlists, worked out - never stored. They follow from the
 * published schedule:
 *
 *   published services -> their songs, in order -> each song's recording -> a playlist
 *
 * so a service appears the moment it is published, changes when its songs
 * do, and leaves once it has happened. Only published services are ever
 * given to this (src/lib/schedule.ts keeps drafts' songs out of the cache);
 * cancelled ones are dropped here too, to be sure. Nothing about who leads a
 * song is passed in, so nothing about it can come out.
 *
 * A song with no recording stays in the list, in its place, marked as such:
 * the list is also the order of service. A song sung twice is listed twice.
 */

export interface PlaylistItem {
  /** Unique within the page: service, place and position. */
  key: string;
  serviceId: string;
  placeId: string;
  /** 1-based place in the service, counting only songs. */
  position: number;
  title: string;
  number: string | null;
  songId?: string;
  collection?: string | null;
  /** The key the service plans to sing it in. */
  musicKey: string | null;
  /** The identity recordings are kept under (the song page's). */
  recordingSongId: string | null;
  selection: SelectionState;
}

export interface PlaylistService {
  /** The service's anchor, "2026-11-08-am". */
  id: string;
  date: string;
  slot: "AM" | "PM";
  startsAt: string;
  /** "Sunday Morning", or a special service's name. */
  title: string;
  /** "Sunday, November 8, 2026" */
  dateLabel: string;
  items: PlaylistItem[];
}

export interface PlaylistMonth {
  /** "2026-11" - its address, /playlists/2026-11. */
  month: string;
  /** "November", or "January 2027" in another year. */
  title: string;
  services: PlaylistService[];
}

/** How long after it starts a service still counts as coming up (it is under way). */
export const SERVICE_GRACE_MS = 3 * 60 * 60 * 1000;

export type PlaylistPlan = Pick<StoredPlan, "date" | "slot" | "startsAt" | "label" | "status" | "slots" | "places">;

function selectionKey(date: string, slot: string, placeId: string) {
  return `${date}|${slot}|${placeId}`;
}

/** One service's playlist. Works for a draft too - the planner's private preview. */
export function playlistService(plan: PlaylistPlan, selections: readonly RecordingSelection[]): PlaylistService {
  const id = serviceAnchor(plan.date, plan.slot);
  const chosen = new Map(selections.map((selection) => [selectionKey(selection.date, selection.slot, selection.placeId), selection]));
  const items: PlaylistItem[] = [];
  plan.slots.forEach((song, index) => {
    if (!song) return;
    const placeId = plan.places[index] ?? `p${index + 1}`;
    const recordingSongId = songIdentity(song) || null;
    items.push({
      key: `${id}:${placeId}:${index}`,
      serviceId: id,
      placeId,
      position: items.length + 1,
      title: song.title,
      number: song.number,
      ...(song.songId ? { songId: song.songId } : {}),
      ...(song.collection !== undefined ? { collection: song.collection } : {}),
      musicKey: song.key,
      recordingSongId,
      selection: selectionState(chosen.get(selectionKey(plan.date, plan.slot, placeId)), recordingSongId),
    });
  });
  return {
    id,
    date: plan.date,
    slot: plan.slot,
    startsAt: plan.startsAt,
    title: serviceTitle(plan),
    dateLabel: serviceFullDate(plan.startsAt),
    items,
  };
}

/** Whether a service is still to come (or under way) at `now`. */
export function isUpcoming(startsAt: string, now: number): boolean {
  return Date.parse(startsAt) + SERVICE_GRACE_MS > now;
}

/**
 * Every month with an upcoming published service, soonest first, each with
 * its upcoming services in order. A month with none left is not listed.
 */
export function buildPreparation(
  plans: readonly PlaylistPlan[],
  selections: readonly RecordingSelection[],
  now: number,
): PlaylistMonth[] {
  const upcoming = plans
    .filter((plan) => plan.status === "published" && isUpcoming(plan.startsAt, now))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const currentYear = churchYear(now);
  const months = new Map<string, PlaylistMonth>();
  for (const plan of upcoming) {
    const service = playlistService(plan, selections);
    if (service.items.length === 0) continue;
    const month = plan.date.slice(0, 7);
    const entry = months.get(month) ?? { month, title: monthTitle(month, currentYear), services: [] };
    entry.services.push(service);
    months.set(month, entry);
  }
  return [...months.values()];
}

/** Every item of a month, in order: what Play all plays. */
export function monthItems(month: PlaylistMonth): PlaylistItem[] {
  return month.services.flatMap((service) => service.items);
}
