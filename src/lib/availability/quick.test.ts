import { describe, expect, it } from "vitest";

import type { ServiceAvailability } from "@/lib/auth/profile-options";

import type { ExceptionRecord } from "./board";
import type { AvailabilityState } from "./effective";
import { effectiveAvailability, planExceptionWrites } from "./effective";
import { serviceOccurrences } from "./occurrences";
import { choicesFor, matchMyServices, myServices, QUICK_LIMIT } from "./quick";

// Sunday morning and evening, Wednesday evening; this person serves on Sunday mornings and Wednesdays.
const me = { id: "user_me" };
const person = { id: me.id, normal: ["sunday_am", "wednesday_pm"] satisfies ServiceAvailability[] };
const occurrences = serviceOccurrences("2026-10-11", "2026-10-18", []);
// The first Sunday morning has begun; everything after it can still be changed.
const now = Date.parse("2026-10-11T11:00:00-07:00");

const exception = (date: string, slot: "AM" | "PM", status: "available" | "unavailable", userId = me.id, note: string | null = null): ExceptionRecord => ({
  userId,
  date,
  slot,
  status,
  note,
});

describe("your coming services", () => {
  it("are the real services still to come, soonest first, never one that has started", () => {
    const services = myServices({ occurrences, person, exceptions: [], now });
    expect(services.map((service) => `${service.date} ${service.slot}`)).toEqual([
      "2026-10-11 PM",
      "2026-10-14 PM",
      "2026-10-18 AM",
      "2026-10-18 PM",
    ]);
  });

  it("say how you stand for each, as the Availability page would", () => {
    const services = myServices({
      occurrences,
      person,
      exceptions: [exception("2026-10-11", "PM", "available", me.id, "Filling in"), exception("2026-10-14", "PM", "unavailable", me.id, "Out of town")],
      now,
    });
    expect(services.map((service) => [service.date, service.state, service.note])).toEqual([
      ["2026-10-11", "available-by-exception", "Filling in"],
      ["2026-10-14", "unavailable-by-exception", "Out of town"],
      ["2026-10-18", "normally-available", null],
      ["2026-10-18", "normally-unavailable", null],
    ]);
  });

  it("are only ever your own: someone else's exception changes nothing here", () => {
    const services = myServices({ occurrences, person, exceptions: [exception("2026-10-14", "PM", "unavailable", "user_other", "Away")], now });
    expect(services.find((service) => service.date === "2026-10-14")).toMatchObject({ state: "normally-available", note: null });
  });

  it("leave out a cancelled service, and include a special one with its name", () => {
    const planned = serviceOccurrences("2026-10-11", "2026-10-18", [
      { date: "2026-10-14", slot: "PM", cancelled: true },
      { date: "2026-10-16", slot: "PM", label: "Missions Conference", startsAt: "2026-10-16T19:00:00-07:00" },
    ]);
    const services = myServices({ occurrences: planned, person, exceptions: [], now });
    expect(services.some((service) => service.date === "2026-10-14")).toBe(false);
    expect(services.find((service) => service.date === "2026-10-16")).toMatchObject({ kind: "special", label: "Missions Conference" });
  });

  it("are a bounded list", () => {
    const year = serviceOccurrences("2026-10-11", "2027-10-11", []);
    expect(myServices({ occurrences: year, person, exceptions: [], now })).toHaveLength(QUICK_LIMIT);
  });
});

describe("the choices offered for a service", () => {
  it("are only ones that change something", () => {
    expect(choicesFor("normally-available")).toEqual(["unavailable"]);
    expect(choicesFor("normally-unavailable")).toEqual(["available"]);
    expect(choicesFor("available-by-exception")).toEqual(["normal"]);
    expect(choicesFor("unavailable-by-exception")).toEqual(["normal"]);
  });

  it("each really do change how you stand, by the page's own arithmetic", () => {
    const [sundayPm, wednesday] = myServices({ occurrences, person, exceptions: [], now });
    const cases: Array<[typeof sundayPm, AvailabilityState]> = [
      [sundayPm, "normally-unavailable"],
      [wednesday, "normally-available"],
    ];
    for (const [service, state] of cases) {
      expect(service.state).toBe(state);
      const occurrence = occurrences.find((item) => item.date === service.date && item.slot === service.slot)!;
      for (const choice of choicesFor(state)) {
        // What the write path would store for this choice...
        const { upserts } = planExceptionWrites(person.normal, [occurrence], choice);
        expect(upserts).toHaveLength(1);
        // ...and what that makes of the service afterwards.
        const after = effectiveAvailability(person.normal, occurrence, choice as "available" | "unavailable");
        expect(after.state).not.toBe(state);
        // From there, "back to usual" is the one thing on offer, and it puts things back.
        expect(choicesFor(after.state)).toEqual(["normal"]);
        expect(planExceptionWrites(person.normal, [occurrence], "normal").deletes).toHaveLength(1);
      }
    }
  });

});

describe("finding a service by typing", () => {
  const services = myServices({ occurrences, person, exceptions: [], now });
  const found = (query: string) => matchMyServices(services, query).map((service) => `${service.date} ${service.slot}`);

  it("lists them all with nothing typed", () => {
    expect(found("")).toHaveLength(4);
    expect(found("   ")).toHaveLength(4);
  });

  it("finds by day, by date and by time of day, every typed word counting", () => {
    expect(found("sunday")).toEqual(["2026-10-11 PM", "2026-10-18 AM", "2026-10-18 PM"]);
    expect(found("wednesday")).toEqual(["2026-10-14 PM"]);
    expect(found("oct 18")).toEqual(["2026-10-18 AM", "2026-10-18 PM"]);
    expect(found("october 18 morning")).toEqual(["2026-10-18 AM"]);
    expect(found("sunday evening")).toEqual(["2026-10-11 PM", "2026-10-18 PM"]);
    expect(found("friday")).toEqual([]);
  });

  it("finds a special service by its name", () => {
    const withSpecial = myServices({
      occurrences: serviceOccurrences("2026-10-11", "2026-10-18", [{ date: "2026-10-16", slot: "PM", label: "Missions Conference", startsAt: "2026-10-16T19:00:00-07:00" }]),
      person,
      exceptions: [],
      now,
    });
    expect(matchMyServices(withSpecial, "missions").map((service) => service.date)).toEqual(["2026-10-16"]);
  });
});
