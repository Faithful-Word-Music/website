import { describe, expect, it } from "vitest";

import { regularOccurrences, serviceOccurrences } from "@/lib/availability/occurrences";

import {
  carriesInsert,
  diffSlots,
  emptySlots,
  followsWeek,
  insertPlaces,
  insertRestoreFor,
  insertsByWeek,
  insertUpdateFor,
  isInsert,
  isLocked,
  MAX_WEEK_INSERTS,
  parseAnchor,
  placeInserts,
  plannerService,
  planSong,
  recordedInsert,
  slotSongs,
  startingSlots,
  takesWeekInsert,
  weekStartOf,
  withWeekInsert,
  type InsertWeek,
  type PlanSlots,
  type PlanSong,
  type StoredPlan,
} from "./model";
import { buildQueue, plannerServices } from "./queue";

/** A hymn from the hymnal: it has a number. */
const hymn = (title: string, key: string | null = "G", number = "100"): PlanSong => planSong({ title, number, key });
/** A Psalm or other song without a hymnal number: an insert, by that alone. */
const psalm = (title: string, key: string | null = "D"): PlanSong => planSong({ title, number: null, key });
const song = hymn;

const psalm120: InsertWeek = { weekStart: "2026-10-11", index: 1, title: "Psalm 120", number: null, key: "D" };
const psalm54: InsertWeek = { weekStart: "2026-10-11", index: 2, title: "Psalm 54", number: null, key: "E" };
const titles = (slots: PlanSlots) => slots.map((item) => item?.title ?? null);

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

describe("what an insert is", () => {
  it("is a song without a hymnal number, and nothing else", () => {
    expect(isInsert(psalm("Psalm 120"))).toBe(true);
    expect(isInsert(hymn("Amazing Grace"))).toBe(false);
    expect(isInsert({ number: null })).toBe(true);
    expect(isInsert({ number: "236" })).toBe(false);
  });

  it("is not something a mark can make or unmake", () => {
    // A hymn marked as an insert is still a hymn; a Psalm not marked is still an insert.
    const markedHymn: PlanSong = { ...hymn("Amazing Grace"), insert: true };
    const unmarkedPsalm: PlanSong = { ...psalm("Psalm 120"), insert: false };
    expect(isInsert(markedHymn)).toBe(false);
    expect(isInsert(unmarkedPsalm)).toBe(true);
  });

  it("is written down on every song the planner makes, from its number", () => {
    expect(planSong({ title: "Psalm 120", number: null, key: "D" })).toEqual({ title: "Psalm 120", number: null, key: "D", insert: true });
    expect(planSong({ title: "Amazing Grace", number: "236", key: "G" })).toEqual({ title: "Amazing Grace", number: "236", key: "G", insert: false });
  });

  it("finds a service's inserts wherever they stand", () => {
    expect(insertPlaces([hymn("A"), null, psalm("Psalm 120"), psalm("Psalm 54"), hymn("B")])).toEqual([2, 3]);
    expect(insertPlaces([psalm("Psalm 120"), hymn("A")])).toEqual([0]);
    expect(insertPlaces([hymn("A"), null])).toEqual([]);
  });

  it("reads the history as it was recorded, which is a different question", () => {
    // Services from before the planner never said which song was the insert.
    expect(recordedInsert({ number: null })).toBe(false);
    expect(recordedInsert({ number: null, insert: true })).toBe(true);
    expect(recordedInsert({ number: "236", insert: true })).toBe(false);
  });
});

describe("weeks and inserts", () => {
  it("files every service under the Sunday that starts its week", () => {
    expect(weekStartOf("2026-10-11")).toBe("2026-10-11");
    expect(weekStartOf("2026-10-14")).toBe("2026-10-11");
    expect(weekStartOf("2026-10-17")).toBe("2026-10-11");
  });

  it("puts the inserts in Sunday AM, Sunday PM and Wednesday PM only", () => {
    expect(takesWeekInsert("2026-10-11", "AM")).toBe(true);
    expect(takesWeekInsert("2026-10-11", "PM")).toBe(true);
    expect(takesWeekInsert("2026-10-14", "PM")).toBe(true);
    expect(takesWeekInsert("2026-10-16", "PM")).toBe(false);
  });

  it("starts a service with five places, the week's insert third", () => {
    const slots = startingSlots("2026-10-14", "PM", [psalm120]);
    expect(slots).toHaveLength(5);
    expect(slots[2]).toEqual({ title: "Psalm 120", number: null, key: "D", insert: true });
    expect(slots.filter(Boolean)).toHaveLength(1);
    expect(startingSlots("2026-10-16", "PM", [psalm120]).filter(Boolean)).toHaveLength(0);
    expect(startingSlots("2026-10-14", "PM", []).filter(Boolean)).toHaveLength(0);
  });

  it("starts a service of a week with two inserts with them third and fourth", () => {
    for (const [date, slot] of [["2026-10-11", "AM"], ["2026-10-11", "PM"], ["2026-10-14", "PM"]] as const) {
      const slots = startingSlots(date, slot, [psalm120, psalm54]);
      expect(titles(slots)).toEqual([null, null, "Psalm 120", "Psalm 54", null]);
    }
    // Whatever order the rows arrive in, the first is third and the second fourth.
    expect(titles(startingSlots("2026-10-11", "AM", [psalm54, psalm120]))).toEqual([null, null, "Psalm 120", "Psalm 54", null]);
    expect(startingSlots("2026-10-16", "PM", [psalm120, psalm54]).filter(Boolean)).toHaveLength(0);
  });

  it("replaces an insert where it stands, even after it was moved", () => {
    const moved: PlanSlots = [psalm("Psalm 120"), song("A"), null, song("B"), song("C")];
    expect(titles(placeInserts(moved, [psalm("Psalm 54", "E")]))).toEqual(["Psalm 54", "A", null, "B", "C"]);
  });

  it("uses the first empty place when the third is taken, and makes room when none is", () => {
    const busyThird: PlanSlots = [null, song("A"), song("B"), null, null];
    expect(titles(placeInserts(busyThird, [psalm("Psalm 54", "E")]))).toEqual(["Psalm 54", "A", "B", null, null]);
    const full: PlanSlots = [song("A"), song("B"), song("C")];
    expect(titles(placeInserts(full, [psalm("Psalm 54", "E")]))).toEqual(["A", "B", "Psalm 54", "C"]);
  });

  it("removes the insert when the week has none", () => {
    const slots = startingSlots("2026-10-11", "AM", [psalm120]);
    expect(placeInserts(slots, []).filter(Boolean)).toHaveLength(0);
  });

  describe("a second insert", () => {
    const one = () => startingSlots("2026-10-11", "AM", [psalm120]);
    const both = [psalm("Psalm 120"), psalm("Psalm 54", "E")];

    it("goes fourth, straight after the first, in a service that has room there", () => {
      expect(titles(placeInserts(one(), both))).toEqual([null, null, "Psalm 120", "Psalm 54", null]);
      const planned: PlanSlots = [song("A"), song("B"), psalm("Psalm 120"), null, song("C")];
      expect(titles(placeInserts(planned, both))).toEqual(["A", "B", "Psalm 120", "Psalm 54", "C"]);
    });

    it("takes the next empty place after the first when the fourth is taken, never one before it", () => {
      const draft: PlanSlots = [null, song("A"), psalm("Psalm 120"), song("B"), null];
      expect(titles(placeInserts(draft, both))).toEqual([null, "A", "Psalm 120", "B", "Psalm 54"]);
    });

    it("is put in after the first, moving the songs down, when the service is full", () => {
      const full: PlanSlots = [song("A"), song("B"), psalm("Psalm 120"), song("C"), song("D")];
      expect(titles(placeInserts(full, both))).toEqual(["A", "B", "Psalm 120", "Psalm 54", "C", "D"]);
    });

    it("changes only its own place when it is changed, and the first only its own", () => {
      const two = placeInserts(one(), both);
      const filled: PlanSlots = [song("A"), song("B"), two[2], two[3], song("C")];
      expect(titles(placeInserts(filled, [psalm("Psalm 120"), psalm("Psalm 19")]))).toEqual(["A", "B", "Psalm 120", "Psalm 19", "C"]);
      expect(titles(placeInserts(filled, [psalm("Psalm 19"), psalm("Psalm 54", "E")]))).toEqual(["A", "B", "Psalm 19", "Psalm 54", "C"]);
    });

    it("leaves only itself behind when cleared: the first stays where it is, and the place is empty again", () => {
      const filled: PlanSlots = [song("A"), song("B"), psalm("Psalm 120"), psalm("Psalm 54", "E"), song("C")];
      expect(titles(placeInserts(filled, [psalm("Psalm 120")]))).toEqual(["A", "B", "Psalm 120", null, "C"]);
    });

    it("moves up to third when the first is cleared and it becomes the week's insert", () => {
      const filled: PlanSlots = [song("A"), song("B"), psalm("Psalm 120"), psalm("Psalm 54", "E"), song("C")];
      expect(titles(placeInserts(filled, [psalm("Psalm 54", "E")]))).toEqual(["A", "B", "Psalm 54", null, "C"]);
    });

    it("keeps the inserts in the week's order wherever they stood", () => {
      const moved: PlanSlots = [psalm("Psalm 120"), song("A"), song("B"), null, psalm("Psalm 54", "E")];
      expect(titles(placeInserts(moved, [psalm("Psalm 1"), psalm("Psalm 2")]))).toEqual(["Psalm 1", "A", "B", null, "Psalm 2"]);
    });
  });

  it("knows whether a service still shows its week's inserts", () => {
    const slots = startingSlots("2026-10-11", "AM", [psalm120]);
    expect(followsWeek(slots, [psalm120])).toBe(true);
    expect(followsWeek(slots, [{ ...psalm120, title: "Psalm 54" }])).toBe(false);
    expect(followsWeek(slots, [{ ...psalm120, key: "E" }])).toBe(false);
    expect(followsWeek(slots, [])).toBe(false);
    expect(followsWeek(emptySlots(), [])).toBe(true);
    expect(followsWeek(emptySlots(), [psalm120])).toBe(false);
  });

  it("follows a week with two only when it shows both, in order", () => {
    const one = startingSlots("2026-10-11", "AM", [psalm120]);
    const two = startingSlots("2026-10-11", "AM", [psalm120, psalm54]);
    expect(followsWeek(two, [psalm120, psalm54])).toBe(true);
    // The week gained a second, or lost it: the service is behind until it is updated.
    expect(followsWeek(one, [psalm120, psalm54])).toBe(false);
    expect(followsWeek(two, [psalm120])).toBe(false);
    expect(followsWeek([...two].reverse(), [psalm120, psalm54])).toBe(false);
    expect(followsWeek(two, [psalm120, { ...psalm54, title: "Psalm 19" }])).toBe(false);
  });

  it("follows the week by the songs themselves: a place stored before, with or without a mark, reads the same", () => {
    // As an older row was stored (a mark beside the song), and as a row with no mark at all would read.
    const marked: PlanSlots = [null, null, { title: "Psalm 120", number: null, key: "D", insert: true }, null, null];
    const unmarked: PlanSlots = [null, null, { title: "Psalm 120", number: null, key: "D", insert: false }, null, null];
    expect(followsWeek(marked, [psalm120])).toBe(true);
    expect(followsWeek(unmarked, [psalm120])).toBe(true);
  });

  it("lets a hymn take the insert's place in one service: an ordinary song there, and the service no longer the week's", () => {
    const service = startingSlots("2026-10-11", "AM", [psalm120]);
    const overridden: PlanSlots = service.map((item, index) => (index === 2 ? hymn("Amazing Grace", "G", "236") : item));
    expect(overridden[2]).toEqual({ title: "Amazing Grace", number: "236", key: "G", insert: false });
    expect(insertPlaces(overridden)).toEqual([]);
    expect(followsWeek(overridden, [psalm120])).toBe(false);
    // The week's own insert is untouched by it: another service of the week still starts with the Psalm.
    expect(titles(startingSlots("2026-10-11", "PM", [psalm120]))).toEqual([null, null, "Psalm 120", null, null]);
  });
});

describe("setting a week's inserts", () => {
  const week = "2026-10-11";
  const chosen = (title: string, key: string | null = "G") => ({ title, number: null, key });
  const names = (inserts: InsertWeek[] | null) => inserts?.map((item) => `${item.index}:${item.title}`) ?? null;

  it("sets the week's insert, and changes it", () => {
    expect(withWeekInsert([], week, 1, chosen("Psalm 120", "D"))).toEqual([psalm120]);
    expect(names(withWeekInsert([psalm120], week, 1, chosen("Psalm 19")))).toEqual(["1:Psalm 19"]);
  });

  it("adds a second, and changes either without touching the other", () => {
    expect(withWeekInsert([psalm120], week, 2, chosen("Psalm 54", "E"))).toEqual([psalm120, psalm54]);
    expect(names(withWeekInsert([psalm120, psalm54], week, 2, chosen("Psalm 19")))).toEqual(["1:Psalm 120", "2:Psalm 19"]);
    expect(names(withWeekInsert([psalm120, psalm54], week, 1, chosen("Psalm 19")))).toEqual(["1:Psalm 19", "2:Psalm 54"]);
  });

  it("clears the second and leaves the first", () => {
    expect(withWeekInsert([psalm120, psalm54], week, 2, null)).toEqual([psalm120]);
    expect(withWeekInsert([psalm120], week, 2, null)).toEqual([psalm120]);
  });

  it("makes the second the week's insert when the first is cleared", () => {
    expect(names(withWeekInsert([psalm120, psalm54], week, 1, null))).toEqual(["1:Psalm 54"]);
    expect(withWeekInsert([psalm120], week, 1, null)).toEqual([]);
  });

  it("makes a 'second' the first when the week has none yet", () => {
    expect(names(withWeekInsert([], week, 2, chosen("Psalm 54")))).toEqual(["1:Psalm 54"]);
  });

  it("refuses the same song twice in one week, however it is punctuated", () => {
    expect(withWeekInsert([psalm120], week, 2, chosen("psalm 120"))).toBeNull();
    expect(withWeekInsert([psalm120, psalm54], week, 1, chosen("Psalm 54"))).toBeNull();
    // Saving an insert again as itself (a new key) is not twice.
    expect(names(withWeekInsert([psalm120, psalm54], week, 1, chosen("Psalm 120", "E")))).toEqual(["1:Psalm 120", "2:Psalm 54"]);
  });

  it("never holds more than two", () => {
    expect(MAX_WEEK_INSERTS).toBe(2);
    expect(withWeekInsert([psalm120, psalm54], week, 2, chosen("Psalm 19"))).toHaveLength(2);
  });

  it("groups the rows of several weeks, each week's in order", () => {
    const next: InsertWeek = { weekStart: "2026-10-18", index: 1, title: "Psalm 19", number: null, key: "C" };
    const weeks = insertsByWeek([psalm54, next, psalm120]);
    expect([...weeks.keys()].sort()).toEqual(["2026-10-11", "2026-10-18"]);
    expect(weeks.get("2026-10-11")).toEqual([psalm120, psalm54]);
    expect(weeks.get("2026-10-18")).toEqual([next]);
  });
});

describe("what a change to the week's inserts does to a service", () => {
  // Sunday, October 11, 2026: 8:00, before the morning service, and 12:00, after it.
  const before = Date.parse("2026-10-11T08:00:00-07:00");
  const after = Date.parse("2026-10-11T12:00:00-07:00");
  const one = placeInserts(emptySlots(), [psalm("Psalm 120")]);
  const both = [psalm120, psalm54];
  const sunday = (overrides: Partial<StoredPlan> = {}) => plan({ date: "2026-10-11", slot: "AM", slots: one, ...overrides });

  it("brings a draft up to date", () => {
    expect(insertUpdateFor(sunday(), both, before)).toBe("update");
    expect(insertUpdateFor(sunday(), both, after)).toBe("update");
  });

  it("returns a published service still to come to draft, and leaves one already held as it was sung", () => {
    expect(insertUpdateFor(sunday({ status: "published" }), both, before)).toBe("update-and-unpublish");
    expect(insertUpdateFor(sunday({ status: "published" }), both, after)).toBe("leave");
  });

  it("leaves a service that has nothing to take", () => {
    expect(insertUpdateFor(sunday(), [psalm120], before)).toBe("leave");
    expect(insertUpdateFor(sunday({ status: "published" }), [psalm120], before)).toBe("leave");
    expect(insertUpdateFor(sunday({ insertMode: "custom" }), both, before)).toBe("leave");
    expect(insertUpdateFor(sunday({ status: "cancelled" }), both, before)).toBe("leave");
    // Saturday takes no insert of the week's.
    expect(insertUpdateFor(plan({ date: "2026-10-17", slot: "PM", slots: one }), both, before)).toBe("leave");
    // Long over: frozen into history.
    expect(insertUpdateFor(sunday(), both, Date.parse("2026-12-01T12:00:00-07:00"))).toBe("leave");
  });
});

describe("putting the week's inserts back", () => {
  const before = Date.parse("2026-10-11T08:00:00-07:00");
  const after = Date.parse("2026-10-11T12:00:00-07:00");
  // Its insert was taken out there, so it stopped following the week.
  const own = (overrides: Partial<StoredPlan> = {}) => plan({ date: "2026-10-11", slot: "AM", insertMode: "custom", ...overrides });

  it("is for a service that went its own way, by the same rule as any change to the inserts", () => {
    expect(insertRestoreFor(own(), [psalm120], before)).toBe("update");
    expect(insertRestoreFor(own({ status: "published" }), [psalm120], before)).toBe("update-and-unpublish");
    expect(insertRestoreFor(own({ status: "published" }), [psalm120], after)).toBe("leave");
    expect(insertRestoreFor(own({ status: "cancelled" }), [psalm120], before)).toBe("leave");
  });

  it("has nothing to do for a service that follows the week, or a week with no insert", () => {
    expect(insertRestoreFor(own({ insertMode: "week" }), [psalm120], before)).toBe("leave");
    expect(insertRestoreFor(own(), [], before)).toBe("leave");
  });

  it("knows whether a service sings any of the week's inserts, wherever it stands", () => {
    const moved = [psalm("Psalm 120"), hymn("Amazing Grace"), null];
    expect(carriesInsert(moved, [psalm120, psalm54])).toBe(true);
    expect(carriesInsert(moved, [psalm54])).toBe(false);
    expect(carriesInsert(emptySlots(), [psalm120])).toBe(false);
    // Another insert in its place is not the week's.
    expect(carriesInsert([psalm("Psalm 19")], [psalm120])).toBe(false);
  });
});

describe("plannerService", () => {
  const [sundayAm] = regularOccurrences("2026-10-11", "2026-10-11");

  it("shows an untouched regular service as not started, with the week's insert", () => {
    const service = plannerService(sundayAm, null, [psalm120]);
    expect(service).toMatchObject({ anchor: "2026-10-11-am", status: "not-started", filled: 1, target: 5, plan: null });
    expect(plannerService(sundayAm, null, [psalm120, psalm54])).toMatchObject({ filled: 2, target: 5 });
    expect(plannerService(sundayAm, null, [])).toMatchObject({ filled: 0, target: 5 });
  });

  it("uses a stored service's own places, whatever the week says", () => {
    const stored = plan({ date: "2026-10-11", slot: "AM", slots: [song("A"), song("B"), null, null], insertMode: "custom" });
    const service = plannerService(sundayAm, stored, [psalm120, psalm54]);
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

  it("gives each not-started service its own week's inserts, one or two", () => {
    const next: InsertWeek = { weekStart: "2026-10-18", index: 1, title: "Psalm 19", number: null, key: "C" };
    const services = plannerServices({ from: "2026-10-11", to: "2026-10-18" }, [], [psalm120, psalm54, next]);
    const shown = (anchor: string) => services.find((service) => service.anchor === anchor)!.slots.map((item) => item?.title ?? null);
    expect(shown("2026-10-11-am")).toEqual([null, null, "Psalm 120", "Psalm 54", null]);
    expect(shown("2026-10-14-pm")).toEqual([null, null, "Psalm 120", "Psalm 54", null]);
    expect(shown("2026-10-18-am")).toEqual([null, null, "Psalm 19", null, null]);
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

  it("tells the song list which songs are inserts, from the songs themselves", () => {
    expect(slotSongs([null, psalm("Psalm 120"), hymn("A")])).toEqual([
      { number: null, title: "Psalm 120", key: "D", insert: true },
      { number: "100", title: "A", key: "G" },
    ]);
    // A mark that disagrees with the song is not passed on.
    expect(slotSongs([{ ...hymn("A"), insert: true }, { ...psalm("Psalm 120"), insert: false }])).toEqual([
      { number: "100", title: "A", key: "G" },
      { number: null, title: "Psalm 120", key: "D", insert: true },
    ]);
  });
});
