import { describe, expect, it } from "vitest";

import {
  addDays,
  churchDate,
  daysBetween,
  findOccurrence,
  isDateString,
  monthRange,
  occurrenceKey,
  regularKeyFor,
  regularOccurrences,
  serviceOccurrences,
  shiftMonth,
} from "@/lib/availability/occurrences";
import { occurrencesInRange } from "@/lib/availability/range";

const keys = (occurrences: Array<{ date: string; slot: string }>) => occurrences.map((occ) => `${occ.date} ${occ.slot}`);

describe("regularOccurrences", () => {
  it("generates Sunday AM, Sunday PM and Wednesday PM - whole services only", () => {
    expect(keys(regularOccurrences("2026-10-12", "2026-10-18"))).toEqual([
      "2026-10-14 PM",
      "2026-10-18 AM",
      "2026-10-18 PM",
    ]);
  });

  it("maps each regular service to its normal-availability choice", () => {
    const [wednesday, sundayAm, sundayPm] = regularOccurrences("2026-10-14", "2026-10-18");
    expect([wednesday.normalKey, sundayAm.normalKey, sundayPm.normalKey]).toEqual([
      "wednesday_pm",
      "sunday_am",
      "sunday_pm",
    ]);
    expect(sundayAm.kind).toBe("regular");
  });

  it("gives each service its start time in church time", () => {
    const [sundayAm, sundayPm] = regularOccurrences("2026-10-18", "2026-10-18");
    expect(sundayAm.startsAt).toBe("2026-10-18T10:30:00-07:00");
    expect(sundayPm.startsAt).toBe("2026-10-18T18:00:00-07:00");
  });

  it("knows no regular service on other days", () => {
    expect(regularKeyFor("2026-10-15", "PM")).toBeNull();
    expect(regularKeyFor("2026-10-14", "AM")).toBeNull();
    expect(regularOccurrences("2026-10-15", "2026-10-17")).toEqual([]);
  });
});

describe("special services", () => {
  const songList = [
    { date: "2026-10-16", slot: "PM" as const }, // a Friday conference meeting
    { date: "2026-10-18", slot: "AM" as const }, // a regular service: not repeated
    { date: null, slot: "AM" as const },
    { date: "2026-11-20", slot: "PM" as const }, // outside the range
  ];

  it("adds the song list's non-regular services as special, once each", () => {
    const occurrences = serviceOccurrences("2026-10-12", "2026-10-18", songList);
    expect(keys(occurrences)).toEqual(["2026-10-14 PM", "2026-10-16 PM", "2026-10-18 AM", "2026-10-18 PM"]);
    const special = findOccurrence(occurrences, "2026-10-16", "PM");
    expect(special).toMatchObject({ kind: "special", normalKey: "special", startsAt: "2026-10-16T19:00:00-07:00" });
  });
});

describe("date helpers", () => {
  it("keys a service by its date and slot", () => {
    expect(occurrenceKey("2026-10-18", "AM")).toBe("2026-10-18|AM");
  });

  it("does calendar arithmetic across months", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(daysBetween("2026-10-15", "2026-10-22")).toBe(7);
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("reads today on the church's calendar, not UTC's", () => {
    // 11pm in Phoenix on Oct 18 is already Oct 19 in UTC.
    expect(churchDate(Date.parse("2026-10-18T23:00:00-07:00"))).toBe("2026-10-18");
  });

  it("accepts only real dates", () => {
    expect(isDateString("2026-10-18")).toBe(true);
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("18/10/2026")).toBe(false);
  });
});

describe("occurrencesInRange", () => {
  const occurrences = regularOccurrences("2026-10-01", "2026-10-31");
  const now = Date.parse("2026-10-15T12:00:00-07:00");

  it("resolves a date range into every whole service it covers, both ends included", () => {
    expect(keys(occurrencesInRange(occurrences, "2026-10-15", "2026-10-22", now))).toEqual([
      "2026-10-18 AM",
      "2026-10-18 PM",
      "2026-10-21 PM",
    ]);
  });

  it("leaves out services that have already started", () => {
    const sundayEvening = Date.parse("2026-10-18T12:00:00-07:00");
    expect(keys(occurrencesInRange(occurrences, "2026-10-18", "2026-10-18", sundayEvening))).toEqual(["2026-10-18 PM"]);
  });
});
