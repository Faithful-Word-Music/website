import { describe, expect, it } from "vitest";

import { serviceOccurrences } from "@/lib/availability/occurrences";
import type { StoredPlan } from "@/lib/service-planner/model";

import { buildScheduleMonths, monthTitle, plannedInserts, planToDated, visibleMonths } from "./schedule-months";

const song = (title: string, insert = false) => ({ title, number: null, key: "G", insert });

function plan(date: string, slot: "AM" | "PM", overrides: Partial<StoredPlan> = {}): StoredPlan {
  return {
    id: 1,
    date,
    slot,
    kind: "regular",
    label: null,
    startsAt: `${date}T${slot === "AM" ? "10:30" : "18:00"}:00-07:00`,
    status: "published",
    insertMode: "week",
    slots: [song("A"), song("B"), song("Psalm 120", true), null, null],
    revision: 1,
    created: { by: null, at: "2026-10-01T00:00:00.000Z" },
    updated: { by: null, at: "2026-10-01T00:00:00.000Z" },
    published: { by: null, at: "2026-10-01T00:00:00.000Z" },
    publicationId: null,
    ...overrides,
  };
}

const now = Date.parse("2026-10-12T12:00:00-07:00");
const expected = (range: { from: string; to: string }) => serviceOccurrences(range.from, range.to);

describe("visibleMonths", () => {
  it("shows this month, then each later month with something published", () => {
    expect(visibleMonths([], now)).toEqual(["2026-10"]);
    expect(visibleMonths([plan("2027-01-03", "AM"), plan("2026-11-01", "AM")], now)).toEqual([
      "2026-10",
      "2026-11",
      "2027-01",
    ]);
  });

  it("names a month in another year with its year", () => {
    expect(monthTitle("2026-10", 2026)).toBe("October");
    expect(monthTitle("2027-01", 2026)).toBe("January 2027");
  });
});

describe("buildScheduleMonths", () => {
  const months = buildScheduleMonths({
    published: [plan("2026-10-18", "AM"), plan("2026-10-04", "AM")],
    expected,
    now,
  });
  const [october] = months;

  it("lists published services with their songs, empty places as still to come", () => {
    const service = october.services.find((item) => item.id === "2026-10-18-am")!;
    expect(service.songs.map((item) => item.title)).toEqual(["A", "B", "Psalm 120"]);
    expect(service.songs[2].insert).toBe(true);
    expect(service.pendingSongs).toBe(2);
    expect(service.pendingPositions).toEqual([3, 4]);
  });

  it("shows regular services not published yet as placeholders - future ones only", () => {
    const placeholders = october.services.filter((item) => item.placeholder).map((item) => item.id);
    expect(placeholders).toContain("2026-10-14-pm");
    expect(placeholders).toContain("2026-10-18-pm");
    expect(placeholders).not.toContain("2026-10-18-am");
    expect(placeholders).not.toContain("2026-10-07-pm");
  });

  it("keeps services in time order", () => {
    const starts = october.services.map((item) => Date.parse(item.startsAt!));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(october.heading).toBe("October Song List");
  });

  it("uses a published special service's own name", () => {
    const [month] = buildScheduleMonths({
      published: [plan("2026-10-16", "PM", { kind: "special", label: "Missions Conference" })],
      expected,
      now,
    });
    expect(month.services.find((item) => item.id === "2026-10-16-pm")?.serviceLabel).toBe("Missions Conference");
  });

  it("leaves out cancelled regular services", () => {
    const [month] = buildScheduleMonths({
      published: [],
      expected: (range) => serviceOccurrences(range.from, range.to, [{ date: "2026-10-14", slot: "PM", cancelled: true }]),
      now,
    });
    expect(month.services.map((item) => item.id)).not.toContain("2026-10-14-pm");
  });
});

describe("planToDated", () => {
  it("is history only when it has songs, and keeps a special service's name", () => {
    expect(planToDated(plan("2026-10-04", "AM", { slots: [null, null] }))).toBeNull();
    expect(planToDated(plan("2026-10-16", "PM", { kind: "special", label: "Missions Conference" }))).toMatchObject({
      kind: "special",
      label: "Missions Conference",
    });
  });
});

describe("plannedInserts", () => {
  const weeks = [{ weekStart: "2026-10-18", title: "Psalm 19:7-10", number: null, key: "Eb" }];

  it("gives a service the week's insert", () => {
    const insertFor = plannedInserts(weeks, []);
    expect(insertFor("2026-10-18", "AM")).toEqual({ title: "Psalm 19:7-10", number: null, key: "Eb", insert: true });
    expect(insertFor("2026-10-21", "PM")).toMatchObject({ title: "Psalm 19:7-10" });
    expect(insertFor("2026-10-25", "AM")).toBeNull(); // no insert planned that week
  });

  it("leaves out a service whose draft has an insert of its own", () => {
    const insertFor = plannedInserts(weeks, [{ date: "2026-10-18", slot: "PM", insertMode: "custom" }]);
    expect(insertFor("2026-10-18", "PM")).toBeNull();
    expect(insertFor("2026-10-18", "AM")).not.toBeNull();
  });

  it("puts it on the song list's placeholders", () => {
    const [october] = buildScheduleMonths({ published: [], expected, now, plannedInsert: plannedInserts(weeks, []) });
    const sunday = october.services.find((item) => item.id === "2026-10-18-am")!;
    expect(sunday.placeholder).toBe(true);
    expect(sunday.plannedInsert?.title).toBe("Psalm 19:7-10");
    expect(october.services.find((item) => item.id === "2026-10-25-am")!.plannedInsert).toBeUndefined();
  });
});
