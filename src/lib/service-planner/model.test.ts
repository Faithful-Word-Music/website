import { describe, expect, it } from "vitest";

import { regularOccurrences, serviceOccurrences } from "@/lib/availability/occurrences";

import {
  diffSlots,
  emptySlots,
  followsWeek,
  isLocked,
  parseAnchor,
  placeInsert,
  plannerService,
  slotSongs,
  startingSlots,
  takesWeekInsert,
  weekStartOf,
  type InsertWeek,
  type PlanSlots,
  type PlanSong,
  type StoredPlan,
} from "./model";
import { buildQueue, plannerServices } from "./queue";

const song = (title: string, key: string | null = "G", insert = false): PlanSong => ({ title, number: null, key, insert });
const psalm120: InsertWeek = { weekStart: "2026-10-11", title: "Psalm 120", number: null, key: "D" };

function plan(overrides: Partial<StoredPlan> & Pick<StoredPlan, "date" | "slot">): StoredPlan {
  return {
    id: 1,
    kind: "regular",
    label: null,
    startsAt: `${overrides.date}T10:30:00-07:00`,
    status: "draft",
    insertMode: "week",
    slots: emptySlots(),
    revision: 1,
    created: { by: "u1", at: "2026-10-01T00:00:00.000Z" },
    updated: { by: "u1", at: "2026-10-01T00:00:00.000Z" },
    published: null,
    publicationId: null,
    ...overrides,
  };
}

describe("weeks and inserts", () => {
  it("files every service under the Sunday that starts its week", () => {
    expect(weekStartOf("2026-10-11")).toBe("2026-10-11");
    expect(weekStartOf("2026-10-14")).toBe("2026-10-11");
    expect(weekStartOf("2026-10-17")).toBe("2026-10-11");
  });

  it("puts the insert in Sunday AM, Sunday PM and Wednesday PM only", () => {
    expect(takesWeekInsert("2026-10-11", "AM")).toBe(true);
    expect(takesWeekInsert("2026-10-11", "PM")).toBe(true);
    expect(takesWeekInsert("2026-10-14", "PM")).toBe(true);
    expect(takesWeekInsert("2026-10-16", "PM")).toBe(false);
  });

  it("starts a service with five places, the week's insert third", () => {
    const slots = startingSlots("2026-10-14", "PM", psalm120);
    expect(slots).toHaveLength(5);
    expect(slots[2]).toMatchObject({ title: "Psalm 120", key: "D", insert: true });
    expect(slots.filter(Boolean)).toHaveLength(1);
    expect(startingSlots("2026-10-16", "PM", psalm120).filter(Boolean)).toHaveLength(0);
    expect(startingSlots("2026-10-14", "PM", null).filter(Boolean)).toHaveLength(0);
  });

  it("replaces an insert where it stands, even after it was moved", () => {
    const moved: PlanSlots = [song("Psalm 120", "D", true), song("A"), null, song("B"), song("C")];
    const next = placeInsert(moved, song("Psalm 54", "E", true));
    expect(next.map((item) => item?.title ?? null)).toEqual(["Psalm 54", "A", null, "B", "C"]);
  });

  it("uses the first empty place when the third is taken, and the end when none is", () => {
    const busyThird: PlanSlots = [null, song("A"), song("B"), null, null];
    expect(placeInsert(busyThird, song("Psalm 54", "E", true)).map((item) => item?.title ?? null)).toEqual([
      "Psalm 54",
      "A",
      "B",
      null,
      null,
    ]);
    const full: PlanSlots = [song("A"), song("B"), song("C")];
    expect(placeInsert(full, song("Psalm 54", "E", true)).map((item) => item?.title)).toEqual([
      "A",
      "B",
      "Psalm 54",
      "C",
    ]);
  });

  it("removes the insert when the week has none", () => {
    const slots = startingSlots("2026-10-11", "AM", psalm120);
    expect(placeInsert(slots, null).filter(Boolean)).toHaveLength(0);
  });

  it("knows whether a service still shows its week's insert", () => {
    const slots = startingSlots("2026-10-11", "AM", psalm120);
    expect(followsWeek(slots, psalm120)).toBe(true);
    expect(followsWeek(slots, { ...psalm120, title: "Psalm 54" })).toBe(false);
    expect(followsWeek(emptySlots(), null)).toBe(true);
  });
});

describe("plannerService", () => {
  const [sundayAm] = regularOccurrences("2026-10-11", "2026-10-11");

  it("shows an untouched regular service as not started, with the week's insert", () => {
    const service = plannerService(sundayAm, null, psalm120);
    expect(service).toMatchObject({ anchor: "2026-10-11-am", status: "not-started", filled: 1, target: 5, plan: null });
  });

  it("uses a stored service's own places, whatever the week says", () => {
    const stored = plan({ date: "2026-10-11", slot: "AM", slots: [song("A"), song("B"), null, null], insertMode: "custom" });
    const service = plannerService(sundayAm, stored, psalm120);
    expect(service).toMatchObject({ status: "draft", filled: 2, target: 4, insertMode: "custom" });
  });
});

describe("the queue", () => {
  const now = Date.parse("2026-10-11T12:00:00-07:00");

  it("lists not-started and draft services, sets published and cancelled aside, and drops past ones", () => {
    const plans = [
      plan({ date: "2026-10-11", slot: "PM", startsAt: "2026-10-11T18:00:00-07:00", status: "published" }),
      plan({ date: "2026-10-14", slot: "PM", startsAt: "2026-10-14T19:00:00-07:00", status: "draft" }),
      plan({ date: "2026-10-18", slot: "PM", startsAt: "2026-10-18T18:00:00-07:00", status: "cancelled" }),
    ];
    const services = plannerServices({ from: "2026-10-11", to: "2026-10-18" }, plans, []);
    const queue = buildQueue(services, now);
    expect(queue.needsPlanning.map((service) => service.anchor)).toEqual(["2026-10-14-pm", "2026-10-18-am"]);
    expect(queue.published.map((service) => service.anchor)).toEqual(["2026-10-11-pm"]);
    expect(queue.cancelled.map((service) => service.anchor)).toEqual(["2026-10-18-pm"]);
  });

  it("generates regular services however far ahead the planner looks", () => {
    const services = plannerServices({ from: "2027-02-01", to: "2027-02-28" }, [], []);
    expect(services).toHaveLength(12);
    expect(services.every((service) => service.status === "not-started")).toBe(true);
  });

  it("includes special services as their own entries", () => {
    const special = plan({
      date: "2026-10-16",
      slot: "PM",
      kind: "special",
      label: "Missions Conference",
      startsAt: "2026-10-16T19:00:00-07:00",
    });
    const services = plannerServices({ from: "2026-10-15", to: "2026-10-17" }, [special], []);
    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({ kind: "special", label: "Missions Conference", status: "draft" });
  });
});

describe("occurrences with planner services", () => {
  it("drops a cancelled regular service and names a renamed one", () => {
    const occurrences = serviceOccurrences("2026-10-11", "2026-10-11", [
      { date: "2026-10-11", slot: "PM", cancelled: true },
      { date: "2026-10-11", slot: "AM", label: "Homecoming", startsAt: "2026-10-11T10:00:00-07:00" },
    ]);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({ slot: "AM", label: "Homecoming", startsAt: "2026-10-11T10:00:00-07:00" });
  });
});

describe("changes and helpers", () => {
  it("describes what an edit did, song by song", () => {
    const before: PlanSlots = [song("A", "G"), song("B", "C"), song("C")];
    const after: PlanSlots = [song("B", "D"), song("A", "G"), null, song("D", "F")];
    expect(diffSlots(before, after)).toEqual([
      { type: "removed", title: "C", position: 3 },
      { type: "moved", title: "B", from: 2, to: 1 },
      { type: "key", title: "B", from: "C", to: "D" },
      { type: "moved", title: "A", from: 1, to: 2 },
      { type: "added", title: "D", position: 4, key: "F" },
    ]);
  });

  it("freezes a service FRESH_DAYS after it happened", () => {
    const now = Date.parse("2026-10-11T12:00:00-07:00");
    expect(isLocked("2026-10-04T10:30:00-07:00", now)).toBe(false);
    expect(isLocked("2026-08-30T10:30:00-07:00", now)).toBe(true);
  });

  it("reads service addresses strictly", () => {
    expect(parseAnchor("2026-10-11-am")).toEqual({ date: "2026-10-11", slot: "AM" });
    expect(parseAnchor("2026-10-11")).toBeNull();
    expect(parseAnchor("../2026-10-11-am")).toBeNull();
  });

  it("keeps the insert mark on the songs the song list sees", () => {
    expect(slotSongs([null, song("Psalm 120", "D", true), song("A")])).toEqual([
      { number: null, title: "Psalm 120", key: "D", insert: true },
      { number: null, title: "A", key: "G" },
    ]);
  });
});
