/**
 * The places of a service, each with its own ID - what a song leader is
 * assigned to (src/lib/leadership). Pure, so it runs in the browser editor and
 * on the server alike, and is unit tested.
 *
 * A service's songs stay a PlanSlots array exactly as before (null = an empty
 * place); the IDs are kept BESIDE it, in the same order, never inside a song.
 * Songs are rebuilt from their title, number and key in many places
 * (planSong, the stored jsonb, AI plans), and an ID inside one would be lost.
 *
 *   moved             the place keeps its ID, wherever it goes
 *   song replaced     the place keeps its ID: whoever leads it still does
 *   key changed       the place keeps its ID
 *   song taken out    the place stays, empty, with its ID: it can still be led
 *   place removed     the ID goes with it, and so does any leader assigned to it
 *   place added       a new ID, never one used before in the service
 *
 * The same song twice in one service is two places with two IDs, so each can
 * have its own leader.
 */

import { positionalPlaceIds, type NewPlaceId, type PlaceIds, type PlanSlots, type PlanSong } from "./model";

/** What a place ID may look like (they are made here, but also arrive from the browser). */
export const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

/** Whether `ids` can be the IDs of `count` places: the right number, well formed, none twice. */
export function validPlaceIds(ids: readonly unknown[] | null | undefined, count: number): ids is string[] {
  if (!Array.isArray(ids) || ids.length !== count) return false;
  if (!ids.every((id) => typeof id === "string" && PLACE_ID_PATTERN.test(id))) return false;
  return new Set(ids).size === ids.length;
}

/**
 * A service's place IDs, from what was stored with it:
 *
 *   stored and matching    used as they are
 *   none stored            "p1", "p2", ... - a service never saved, or saved
 *                          before places had IDs. The same every time it is
 *                          read, until a save stores them.
 *   stored, not matching   an older version of the site changed the songs
 *                          without them. New IDs, of a kind no assignment
 *                          can already point at ("r<revision>-<n>"), so no
 *                          leader is silently moved onto the wrong song -
 *                          and `reset` says the assignments need checking.
 */
export function derivePlaceIds(
  count: number,
  stored: readonly unknown[] | null | undefined,
  revision: number,
): { places: PlaceIds; reset: boolean } {
  if (stored == null) return { places: positionalPlaceIds(count), reset: false };
  if (validPlaceIds(stored, count)) return { places: [...stored], reset: false };
  return { places: Array.from({ length: count }, (_, index) => `r${revision}-${index + 1}`), reset: true };
}

/** A new place ID: random, short, and not one of `taken`. */
export const newPlaceId: NewPlaceId = (taken) => {
  for (;;) {
    const id = `n${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    if (!taken.includes(id)) return id;
  }
};

/** A service's songs with their place IDs: what the editor changes together. */
export interface Places {
  slots: PlanSlots;
  places: PlaceIds;
}

/** Swaps a place with its neighbour; both keep their IDs. */
export function movePlace(state: Places, index: number, by: -1 | 1): Places {
  const target = index + by;
  if (index < 0 || target < 0 || index >= state.slots.length || target >= state.slots.length) return state;
  const slots = [...state.slots];
  const places = [...state.places];
  [slots[index], slots[target]] = [slots[target], slots[index]];
  [places[index], places[target]] = [places[target], places[index]];
  return { slots, places };
}

/** Puts a song in a place - filling it, or replacing the song there. The place keeps its ID. */
export function setSong(state: Places, index: number, song: PlanSong): Places {
  if (index < 0 || index >= state.slots.length) return state;
  return { slots: state.slots.map((item, at) => (at === index ? song : item)), places: state.places };
}

/** Takes the song out of a place. The place stays, empty, with its ID (and its leader). */
export function clearSong(state: Places, index: number): Places {
  if (index < 0 || index >= state.slots.length) return state;
  return { slots: state.slots.map((item, at) => (at === index ? null : item)), places: state.places };
}

/** Adds an empty place at the end, with a new ID. */
export function addPlace(state: Places, newId: NewPlaceId = newPlaceId): Places {
  return { slots: [...state.slots, null], places: [...state.places, newId(state.places)] };
}

/** Removes a place, and its ID with it. */
export function removePlace(state: Places, index: number): Places {
  if (index < 0 || index >= state.slots.length) return state;
  return {
    slots: state.slots.filter((_, at) => at !== index),
    places: state.places.filter((_, at) => at !== index),
  };
}

/**
 * The IDs for songs that arrived without any (a browser tab opened before
 * places had IDs): the current IDs place by place, and new ones for places
 * beyond them.
 */
export function placeIdsFor(count: number, current: PlaceIds, newId: NewPlaceId = newPlaceId): PlaceIds {
  const ids = current.slice(0, count);
  while (ids.length < count) ids.push(newId(ids));
  return ids;
}
