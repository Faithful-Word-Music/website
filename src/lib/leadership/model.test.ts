import { describe, expect, it } from "vitest";

import {
  diffAssignments,
  effectiveLeaders,
  leaderConflicts,
  leadersIn,
  placeChoice,
  positionsLabel,
  pruneOverrides,
  sameLeadership,
  snapshot,
  summarize,
  withDefault,
  withoutOverrides,
  withPlaceChoice,
  type Leadership,
} from "./model";

const DIRECTOR = "user_director";
const BRIAN = "user_brian";
const CARL = "user_carl";
const places = ["a", "b", "c", "d", "e"];
const leaders = (input: Partial<Leadership>): Leadership => ({ defaultUserId: null, overrides: {}, revision: 1, ...input });
const who = (list: ReturnType<typeof effectiveLeaders>) => list.map((place) => place.userId);

describe("who leads each song", () => {
  it("is the service's default leader, unless a song says otherwise", () => {
    const effective = effectiveLeaders(places, leaders({ defaultUserId: DIRECTOR }));
    expect(who(effective)).toEqual([DIRECTOR, DIRECTOR, DIRECTOR, DIRECTOR, DIRECTOR]);
    expect(effective.map((place) => place.source)).toEqual(["default", "default", "default", "default", "default"]);
    expect(effective.map((place) => place.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it("is the person assigned to a song, over the default (a Sunday: one default, one override)", () => {
    const sunday = leaders({ defaultUserId: DIRECTOR, overrides: { e: { kind: "assigned", userId: BRIAN } } });
    expect(who(effectiveLeaders(places, sunday))).toEqual([DIRECTOR, DIRECTOR, DIRECTOR, DIRECTOR, BRIAN]);
  });

  it("is no one for a song explicitly left unassigned, whatever the default", () => {
    const effective = effectiveLeaders(places, leaders({ defaultUserId: DIRECTOR, overrides: { b: { kind: "unassigned" } } }));
    expect(who(effective)[1]).toBeNull();
    expect(effective[1].source).toBe("unassigned");
  });

  it("is no one with no default and no override", () => {
    const effective = effectiveLeaders(places, leaders({}));
    expect(who(effective)).toEqual([null, null, null, null, null]);
    expect(effective.every((place) => place.source === "none")).toBe(true);
  });

  it("can be several people in a service, and one person several songs (a Wednesday)", () => {
    const wednesday = leaders({
      overrides: {
        a: { kind: "assigned", userId: BRIAN },
        b: { kind: "assigned", userId: CARL },
        c: { kind: "assigned", userId: DIRECTOR },
        d: { kind: "assigned", userId: BRIAN },
        e: { kind: "assigned", userId: CARL },
      },
    });
    expect(who(effectiveLeaders(places, wednesday))).toEqual([BRIAN, CARL, DIRECTOR, BRIAN, CARL]);
    expect(leadersIn(snapshot(places, wednesday)).sort()).toEqual([BRIAN, CARL, DIRECTOR].sort());
  });

  it("follows the place, so reordering keeps each song's leader", () => {
    const sunday = leaders({ defaultUserId: DIRECTOR, overrides: { e: { kind: "assigned", userId: BRIAN } } });
    const reordered = ["e", "a", "b", "c", "d"];
    expect(who(effectiveLeaders(reordered, sunday))).toEqual([BRIAN, DIRECTOR, DIRECTOR, DIRECTOR, DIRECTOR]);
  });

  it("ignores overrides for places that no longer exist", () => {
    const stale = leaders({ defaultUserId: DIRECTOR, overrides: { gone: { kind: "assigned", userId: BRIAN } } });
    expect(who(effectiveLeaders(places, stale))).toEqual([DIRECTOR, DIRECTOR, DIRECTOR, DIRECTOR, DIRECTOR]);
    expect(pruneOverrides(stale.overrides, places)).toEqual({ overrides: {}, dropped: ["gone"] });
  });

  it("does not take an override on trust from an inherited property", () => {
    expect(effectiveLeaders(["toString"], leaders({}))[0].userId).toBeNull();
  });
});

describe("what a change did, person by person", () => {
  const before = snapshot(places, leaders({ defaultUserId: DIRECTOR, overrides: { e: { kind: "assigned", userId: BRIAN } } }));

  it("is nothing for a save that changes no one's part", () => {
    expect(diffAssignments(before, before)).toEqual([]);
  });

  it("is nothing when songs only moved: a part is a set of places, not positions", () => {
    const moved = snapshot(["e", "a", "b", "c", "d"], leaders({ defaultUserId: DIRECTOR, overrides: { e: { kind: "assigned", userId: BRIAN } } }));
    expect(diffAssignments(before, moved)).toEqual([]);
  });

  it("tells a reassigned song's former leader and new leader apart", () => {
    const after = snapshot(places, leaders({ defaultUserId: DIRECTOR, overrides: { e: { kind: "assigned", userId: CARL } } }));
    const deltas = diffAssignments(before, after);
    expect(deltas.find((delta) => delta.userId === BRIAN)).toMatchObject({ before: ["e"], after: [], positionsBefore: [5] });
    expect(deltas.find((delta) => delta.userId === CARL)).toMatchObject({ before: [], after: ["e"], positionsAfter: [5] });
    expect(deltas.some((delta) => delta.userId === DIRECTOR)).toBe(false);
  });

  it("counts a default leader's new place as a change for them", () => {
    const after = snapshot([...places, "f"], leaders({ defaultUserId: DIRECTOR, overrides: { e: { kind: "assigned", userId: BRIAN } } }));
    expect(diffAssignments(before, after)).toEqual([
      { userId: DIRECTOR, before: ["a", "b", "c", "d"], after: ["a", "b", "c", "d", "f"], positionsBefore: [1, 2, 3, 4], positionsAfter: [1, 2, 3, 4, 6] },
    ]);
  });

  it("removes a removed place's leader, with nobody else's part shifting", () => {
    const after = snapshot(["a", "b", "c", "d"], leaders({ defaultUserId: DIRECTOR }));
    expect(diffAssignments(before, after)).toEqual([{ userId: BRIAN, before: ["e"], after: [], positionsBefore: [5], positionsAfter: [] }]);
  });
});

describe("problems", () => {
  const wednesday = effectiveLeaders(
    places,
    leaders({ overrides: { a: { kind: "assigned", userId: BRIAN }, c: { kind: "assigned", userId: BRIAN }, d: { kind: "assigned", userId: CARL } } }),
  );

  it("is one conflict per person, however many songs they lead", () => {
    const conflicts = leaderConflicts(wednesday, (userId) => userId !== BRIAN);
    expect(conflicts).toEqual([{ userId: BRIAN, positions: [1, 3], placeIds: ["a", "c"] }]);
  });

  it("is never a conflict when availability is unknown", () => {
    expect(leaderConflicts(wednesday, () => null)).toEqual([]);
  });

  it("are counted: songs led, songs with no leader, people away, people who can no longer lead", () => {
    expect(summarize(wednesday, (userId) => userId !== CARL, (userId) => userId !== BRIAN)).toEqual({
      places: 5,
      led: 3,
      unled: 2,
      conflicts: 1,
      ineligible: 1,
    });
  });
});

describe("the planner's controls", () => {
  const start = { defaultUserId: null, overrides: {} };

  it("set the default, a song's leader, no one, or back to the default", () => {
    let draft = withDefault(start, DIRECTOR);
    draft = withPlaceChoice(draft, "e", { kind: "assigned", userId: BRIAN });
    draft = withPlaceChoice(draft, "b", { kind: "unassigned" });
    expect(placeChoice(draft, "e")).toEqual({ kind: "assigned", userId: BRIAN });
    expect(placeChoice(draft, "b")).toEqual({ kind: "unassigned" });
    expect(placeChoice(draft, "a")).toEqual({ kind: "inherit" });
    draft = withPlaceChoice(draft, "b", { kind: "inherit" });
    expect(draft.overrides).toEqual({ e: { kind: "assigned", userId: BRIAN } });
    expect(withoutOverrides(draft)).toEqual({ defaultUserId: DIRECTOR, overrides: {} });
  });

  it("compare by what they say, not by how they were made", () => {
    const a = { defaultUserId: DIRECTOR, overrides: { e: { kind: "assigned" as const, userId: BRIAN } } };
    expect(sameLeadership(a, { ...a, overrides: { ...a.overrides } })).toBe(true);
    expect(sameLeadership(a, { ...a, overrides: { e: { kind: "assigned", userId: CARL } } })).toBe(false);
    expect(sameLeadership(a, { ...a, overrides: { e: { kind: "unassigned" } } })).toBe(false);
    expect(sameLeadership(a, { ...a, defaultUserId: null })).toBe(false);
  });

  it("name positions as people count them", () => {
    expect(positionsLabel([5])).toBe("song 5");
    expect(positionsLabel([5, 2])).toBe("songs 2 and 5");
    expect(positionsLabel([1, 2, 4])).toBe("songs 1, 2 and 4");
  });
});
