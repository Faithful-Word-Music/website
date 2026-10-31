import { describe, expect, it } from "vitest";

import { placeInserts, placeInsertsWithPlaces, planSong, positionalPlaceIds, type PlanSlots } from "./model";
import {
  addPlace,
  clearSong,
  derivePlaceIds,
  movePlace,
  newPlaceId,
  placeIdsFor,
  removePlace,
  setSong,
  validPlaceIds,
  type Places,
} from "./places";

const hymn = (title: string, number = "100", key: string | null = "G") => planSong({ title, number, key });
const insert = (title: string) => planSong({ title, number: null, key: "D" });
let counter = 0;
const nextId = () => `new${(counter += 1)}`;

const service = (): Places => ({
  slots: [hymn("Amazing Grace", "1"), hymn("Holy, Holy, Holy", "2"), insert("Psalm 120"), null, hymn("Amazing Grace", "1")],
  places: ["a", "b", "c", "d", "e"],
});

describe("a service's place IDs", () => {
  it("are 'p1'...'pN' for a service never saved, or saved before places had IDs - the same every time", () => {
    expect(derivePlaceIds(3, null, 4)).toEqual({ places: ["p1", "p2", "p3"], reset: false });
    expect(derivePlaceIds(3, undefined, 9)).toEqual(derivePlaceIds(3, null, 1));
    expect(positionalPlaceIds(2)).toEqual(["p1", "p2"]);
  });

  it("are the stored ones when they match the places", () => {
    expect(derivePlaceIds(2, ["x1", "x2"], 4)).toEqual({ places: ["x1", "x2"], reset: false });
  });

  it("are given afresh - never matching an old assignment - when an older version changed the songs", () => {
    // Too few, too many, repeated or malformed: none can be trusted to name the right song.
    for (const stored of [["x1"], ["x1", "x2", "x3"], ["x1", "x1"], ["x 1", "x2"], [1, 2]]) {
      const derived = derivePlaceIds(2, stored, 7);
      expect(derived.reset).toBe(true);
      expect(derived.places).toEqual(["r7-1", "r7-2"]);
      expect(derived.places.some((id) => (stored as unknown[]).includes(id))).toBe(false);
    }
  });

  it("validate: the right number, well formed, none twice", () => {
    expect(validPlaceIds(["a", "b"], 2)).toBe(true);
    expect(validPlaceIds(["a", "a"], 2)).toBe(false);
    expect(validPlaceIds(["a"], 2)).toBe(false);
    expect(validPlaceIds(["a/b", "c"], 2)).toBe(false);
    expect(validPlaceIds(null, 0)).toBe(false);
  });
});

describe("editing keeps each place's ID", () => {
  it("moves a place with its ID: the song and its place go together", () => {
    const moved = movePlace(service(), 0, 1);
    expect(moved.slots.map((song) => song?.title ?? null)).toEqual(["Holy, Holy, Holy", "Amazing Grace", "Psalm 120", null, "Amazing Grace"]);
    expect(moved.places).toEqual(["b", "a", "c", "d", "e"]);
    // Off either end: nothing happens.
    expect(movePlace(service(), 0, -1)).toEqual(service());
    expect(movePlace(service(), 4, 1)).toEqual(service());
  });

  it("keeps the ID when a song is replaced, or only its key changes", () => {
    const replaced = setSong(service(), 1, hymn("Be Thou My Vision", "3"));
    expect(replaced.places).toEqual(service().places);
    expect(replaced.slots[1]?.title).toBe("Be Thou My Vision");
    const rekeyed = setSong(service(), 0, { ...service().slots[0]!, key: "Ab" });
    expect(rekeyed.places).toEqual(service().places);
    // An insert replaced by another insert, in the same place.
    expect(setSong(service(), 2, insert("Psalm 54")).places[2]).toBe("c");
  });

  it("keeps an emptied place, with its ID - it can still be led", () => {
    const cleared = clearSong(service(), 1);
    expect(cleared.slots[1]).toBeNull();
    expect(cleared.places).toEqual(service().places);
  });

  it("gives a new place a new ID, and takes a removed place's away without shifting the others", () => {
    counter = 0;
    const added = addPlace(service(), nextId);
    expect(added.places).toEqual(["a", "b", "c", "d", "e", "new1"]);
    const removed = removePlace(service(), 1);
    expect(removed.places).toEqual(["a", "c", "d", "e"]);
    expect(removed.slots.map((song) => song?.title ?? null)).toEqual(["Amazing Grace", "Psalm 120", null, "Amazing Grace"]);
  });

  it("tells the same song twice apart by place", () => {
    const { slots, places } = service();
    expect(slots[0]?.title).toBe(slots[4]?.title);
    expect(places[0]).not.toBe(places[4]);
  });

  it("makes random IDs never already used", () => {
    const taken = ["a", "b"];
    for (let i = 0; i < 50; i += 1) {
      const id = newPlaceId(taken);
      expect(taken).not.toContain(id);
      expect(validPlaceIds([id], 1)).toBe(true);
      taken.push(id);
    }
  });

  it("keeps the stored IDs place by place for songs sent without any (a tab opened before IDs)", () => {
    counter = 0;
    expect(placeIdsFor(2, ["a", "b", "c"], nextId)).toEqual(["a", "b"]);
    expect(placeIdsFor(4, ["a", "b"], nextId)).toEqual(["a", "b", "new1", "new2"]);
  });
});

describe("the week's inserts keep the places", () => {
  it("puts a new insert where the old one stood: same place, same ID", () => {
    const { slots, places } = placeInsertsWithPlaces(service().slots, service().places, [insert("Psalm 54")], nextId);
    expect(slots[2]?.title).toBe("Psalm 54");
    expect(places).toEqual(service().places);
  });

  it("fills an empty place for a second insert, keeping every ID", () => {
    const { slots, places } = placeInsertsWithPlaces(service().slots, service().places, [insert("Psalm 120"), insert("Psalm 54")], nextId);
    expect(slots.map((song) => song?.title ?? null)).toEqual(["Amazing Grace", "Holy, Holy, Holy", "Psalm 120", "Psalm 54", "Amazing Grace"]);
    expect(places).toEqual(service().places);
  });

  it("makes a place - with a new ID - only when there is none free, and moves no other ID", () => {
    counter = 0;
    const full: PlanSlots = [hymn("A"), hymn("B"), hymn("C")];
    const { slots, places } = placeInsertsWithPlaces(full, ["a", "b", "c"], [insert("Psalm 120")], nextId);
    expect(slots.map((song) => song?.title)).toEqual(["A", "B", "Psalm 120", "C"]);
    expect(places).toEqual(["a", "b", "new1", "c"]);
  });

  it("taking the inserts out empties their places but keeps them (and their leaders)", () => {
    const { slots, places } = placeInsertsWithPlaces(service().slots, service().places, [], nextId);
    expect(slots[2]).toBeNull();
    expect(places).toEqual(service().places);
  });

  it("places the songs exactly as placeInserts() always has", () => {
    const cases: Array<[PlanSlots, ReturnType<typeof insert>[]]> = [
      [service().slots, [insert("Psalm 54")]],
      [[null, null, null, null, null], [insert("Psalm 120"), insert("Psalm 54")]],
      [[hymn("A"), hymn("B"), hymn("C")], [insert("Psalm 120")]],
    ];
    for (const [slots, inserts] of cases) {
      expect(placeInsertsWithPlaces(slots, positionalPlaceIds(slots.length), inserts, nextId).slots).toEqual(placeInserts(slots, inserts));
    }
  });
});
