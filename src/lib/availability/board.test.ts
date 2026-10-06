import { describe, expect, it } from "vitest";

import { buildBoard, upcomingChanges, type ExceptionRecord, type RosterPerson } from "@/lib/availability/board";
import { normalAvailabilitySchema, rangeSchema, serviceExceptionSchema } from "@/lib/availability/forms";
import { regularOccurrences } from "@/lib/availability/occurrences";
import { buildAvailabilitySummary } from "@/lib/availability/summary";

const roster: RosterPerson[] = [
  { id: "user_alex", name: "Alex", normal: ["sunday_am", "sunday_pm", "wednesday_pm"] },
  { id: "user_john", name: "John", normal: ["sunday_am"] },
  { id: "user_director", name: "Director", normal: ["sunday_am", "sunday_pm"] },
];

const exceptions: ExceptionRecord[] = [
  { userId: "user_alex", date: "2026-10-18", slot: "AM", status: "unavailable", note: "Out of town" },
  { userId: "user_john", date: "2026-10-21", slot: "PM", status: "available", note: null },
  // Matches John's normal pattern: changes nothing.
  { userId: "user_john", date: "2026-10-18", slot: "AM", status: "available", note: null },
];

// Sun Oct 18 AM, Sun Oct 18 PM, Wed Oct 21 PM.
const week = regularOccurrences("2026-10-18", "2026-10-21");

describe("buildBoard", () => {
  it("shows everyone only the people who differ from normal - shared with the whole team", () => {
    const board = buildBoard({ occurrences: week, roster, exceptions, subjectId: "user_john", view: "everyone" });
    const [sundayAm, sundayPm, wednesday] = board;

    expect(sundayAm.changes).toEqual([{ id: "user_alex", name: "Alex", state: "unavailable-by-exception", note: "Out of town" }]);
    expect(sundayPm.changes).toEqual([]);
    expect(wednesday.changes).toEqual([{ id: "user_john", name: "John", state: "available-by-exception", note: null }]);
  });

  it("lists who is expected, exceptions included", () => {
    const [sundayAm, , wednesday] = buildBoard({ occurrences: week, roster, exceptions, subjectId: null, view: "everyone" });
    expect(sundayAm.expected.map((person) => person.name)).toEqual(["Director", "John"]);
    expect(wednesday.expected.map((person) => person.name)).toEqual(["Alex", "John"]);
  });

  it("keeps only the subject's own changes under Me, while still showing their state everywhere", () => {
    const board = buildBoard({ occurrences: week, roster, exceptions, subjectId: "user_alex", view: "me" });
    expect(board[0].changes.map((person) => person.id)).toEqual(["user_alex"]);
    expect(board[2].changes).toEqual([]);
    expect(board.map((service) => service.subject?.state)).toEqual([
      "unavailable-by-exception",
      "normally-available",
      "normally-available",
    ]);
  });

  it("gives no own state to someone who is not on the board", () => {
    const board = buildBoard({ occurrences: week, roster, exceptions, subjectId: "user_admin", view: "everyone" });
    expect(board[0].subject).toBeNull();
  });

  it("returns to normal once an exception is removed", () => {
    const without = exceptions.filter((row) => row.userId !== "user_alex");
    const [sundayAm] = buildBoard({ occurrences: week, roster, exceptions: without, subjectId: "user_alex", view: "me" });
    expect(sundayAm.subject?.state).toBe("normally-available");
    expect(sundayAm.changes).toEqual([]);
  });
});

describe("upcomingChanges", () => {
  it("lists real changes in time order, for everyone or one person", () => {
    expect(upcomingChanges(week, roster, exceptions).map((change) => `${change.name} ${change.date}`)).toEqual([
      "Alex 2026-10-18",
      "John 2026-10-21",
    ]);
    expect(upcomingChanges(week, roster, exceptions, "user_john").map((change) => change.state)).toEqual([
      "available-by-exception",
    ]);
  });
});

describe("buildAvailabilitySummary", () => {
  const now = Date.parse("2026-10-15T12:00:00-07:00");
  const occurrences = regularOccurrences("2026-10-15", "2026-11-30");

  it("gives a participant their normal services, next service and own changes, and the ministry's", () => {
    const summary = buildAvailabilitySummary({ occurrences, roster, exceptions, viewerId: "user_alex", now });
    expect(summary.self?.normal).toEqual(["sunday_am", "sunday_pm", "wednesday_pm"]);
    expect(summary.self?.next).toMatchObject({ date: "2026-10-18", slot: "AM", state: "unavailable-by-exception" });
    expect(summary.self?.changes.map((change) => change.date)).toEqual(["2026-10-18"]);
    // Other people's changes only.
    expect(summary.ministry.map((change) => change.name)).toEqual(["John"]);
  });

  it("stays quiet when nothing is unusual", () => {
    const summary = buildAvailabilitySummary({ occurrences, roster, exceptions: [], viewerId: "user_director", now });
    expect(summary.self?.changes).toEqual([]);
    expect(summary.self?.next?.state).toBe("normally-available");
    expect(summary.ministry).toEqual([]);
  });

  it("gives someone not on the board only the ministry's changes", () => {
    const summary = buildAvailabilitySummary({ occurrences, roster, exceptions, viewerId: "user_admin", now });
    expect(summary.self).toBeNull();
    expect(summary.ministry).toHaveLength(2);
  });

  it("keeps the team view for a leader", () => {
    expect(buildAvailabilitySummary({ occurrences, roster, exceptions, viewerId: "user_alex", now }).team).toBeUndefined();
  });

  it("gives a leader everyone expected and away at the next three services, and who has set nothing", () => {
    const withNew: RosterPerson[] = [...roster, { id: "user_new", name: "Newcomer", normal: [] }];
    const { team } = buildAvailabilitySummary({ occurrences, roster: withNew, exceptions, viewerId: "user_director", now, leader: true });

    expect(team?.services.map((service) => `${service.date} ${service.slot}`)).toEqual(["2026-10-18 AM", "2026-10-18 PM", "2026-10-21 PM"]);
    const [sundayAm, , wednesday] = team!.services;
    expect(sundayAm.expected.map((person) => person.name)).toEqual(["Director", "John"]);
    expect(sundayAm.away).toEqual([{ id: "user_alex", name: "Alex", state: "unavailable-by-exception", note: "Out of town" }]);
    // There by exception: expected, and marked as such.
    expect(wednesday.expected).toContainEqual({ id: "user_john", name: "John", state: "available-by-exception", note: null });
    expect(wednesday.away).toEqual([]);
    expect(team?.unset).toEqual([{ id: "user_new", name: "Newcomer" }]);
    expect(team?.size).toBe(4);
  });
});

describe("availability forms", () => {
  it("accepts a whole-service choice with an optional note", () => {
    const parsed = serviceExceptionSchema.safeParse({ date: "2026-10-18", slot: "AM", status: "unavailable", note: "  Away " });
    expect(parsed.success && parsed.data).toEqual({ date: "2026-10-18", slot: "AM", status: "unavailable", note: "Away", userId: undefined });
    expect(serviceExceptionSchema.safeParse({ date: "2026-10-18", slot: "AM", status: "normal" }).success).toBe(true);
  });

  it("has no way to ask for part of a service", () => {
    expect(serviceExceptionSchema.safeParse({ date: "2026-10-18", slot: "10:30", status: "unavailable" }).success).toBe(false);
    expect(serviceExceptionSchema.safeParse({ date: "2026-10-18", slot: "AM", status: "late" }).success).toBe(false);
  });

  it("rejects bad dates, long notes and IDs that are not Clerk user IDs", () => {
    expect(serviceExceptionSchema.safeParse({ date: "2026-02-30", slot: "AM", status: "available" }).success).toBe(false);
    expect(serviceExceptionSchema.safeParse({ date: "2026-10-18", slot: "AM", status: "available", note: "x".repeat(281) }).success).toBe(false);
    expect(
      serviceExceptionSchema.safeParse({ date: "2026-10-18", slot: "AM", status: "available", userId: "'; drop table" }).success,
    ).toBe(false);
  });

  it("requires a range to run forwards and stay reasonable", () => {
    expect(rangeSchema.safeParse({ from: "2026-10-15", to: "2026-10-22", status: "unavailable" }).success).toBe(true);
    expect(rangeSchema.safeParse({ from: "2026-10-22", to: "2026-10-15", status: "unavailable" }).success).toBe(false);
    expect(rangeSchema.safeParse({ from: "2026-01-01", to: "2026-12-31", status: "unavailable" }).success).toBe(false);
  });

  it("accepts only the known normal services, once each", () => {
    const parsed = normalAvailabilitySchema.safeParse({ services: ["sunday_am", "sunday_am", "special"] });
    expect(parsed.success && parsed.data.services).toEqual(["sunday_am", "special"]);
    expect(normalAvailabilitySchema.safeParse({ services: ["saturday"] }).success).toBe(false);
  });
});
