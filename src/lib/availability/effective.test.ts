import { describe, expect, it } from "vitest";

import { effectiveAvailability, planExceptionWrites } from "@/lib/availability/effective";
import { regularOccurrences } from "@/lib/availability/occurrences";

const SUNDAY_AM = { normalKey: "sunday_am" as const };
const WEDNESDAY_PM = { normalKey: "wednesday_pm" as const };

describe("effectiveAvailability", () => {
  it("normally available + no exception -> available", () => {
    expect(effectiveAvailability(["sunday_am"], SUNDAY_AM)).toEqual({
      normal: true,
      effective: true,
      exception: null,
      state: "normally-available",
    });
  });

  it("normally unavailable + no exception -> unavailable", () => {
    expect(effectiveAvailability(["sunday_am"], WEDNESDAY_PM)).toEqual({
      normal: false,
      effective: false,
      exception: null,
      state: "normally-unavailable",
    });
  });

  it("normally available + an unavailable exception -> unavailable by exception", () => {
    const result = effectiveAvailability(["sunday_am", "sunday_pm", "wednesday_pm"], SUNDAY_AM, "unavailable");
    expect(result).toEqual({ normal: true, effective: false, exception: "unavailable", state: "unavailable-by-exception" });
  });

  it("normally unavailable + an available exception -> available by exception", () => {
    const result = effectiveAvailability(["sunday_am"], WEDNESDAY_PM, "available");
    expect(result).toEqual({ normal: false, effective: true, exception: "available", state: "available-by-exception" });
  });

  it("removing the exception returns to normal", () => {
    expect(effectiveAvailability(["sunday_am"], SUNDAY_AM, "unavailable").effective).toBe(false);
    expect(effectiveAvailability(["sunday_am"], SUNDAY_AM, null)).toEqual(effectiveAvailability(["sunday_am"], SUNDAY_AM));
  });

  it("treats an exception that matches normal as no exception at all", () => {
    expect(effectiveAvailability(["sunday_am"], SUNDAY_AM, "available")).toMatchObject({
      exception: null,
      state: "normally-available",
    });
    expect(effectiveAvailability([], SUNDAY_AM, "unavailable")).toMatchObject({
      exception: null,
      state: "normally-unavailable",
    });
  });

  it("matches special services against the 'special' choice", () => {
    expect(effectiveAvailability(["special"], { normalKey: "special" }).effective).toBe(true);
    expect(effectiveAvailability(["sunday_am"], { normalKey: "special" }).effective).toBe(false);
  });
});

describe("planExceptionWrites", () => {
  // Oct 18 (Sun AM, Sun PM) and Oct 21 (Wed PM), 2026.
  const week = regularOccurrences("2026-10-18", "2026-10-21");

  it("stores only real differences from normal", () => {
    const { upserts, deletes } = planExceptionWrites(["sunday_am", "sunday_pm"], week, "unavailable");
    expect(upserts.map((occ) => `${occ.date} ${occ.slot}`)).toEqual(["2026-10-18 AM", "2026-10-18 PM"]);
    // Not normally there on Wednesday: "unavailable" changes nothing, so nothing is kept.
    expect(deletes.map((occ) => `${occ.date} ${occ.slot}`)).toEqual(["2026-10-21 PM"]);
  });

  it("turns Normal into removing every exception", () => {
    const { upserts, deletes } = planExceptionWrites(["sunday_am"], week, "normal");
    expect(upserts).toEqual([]);
    expect(deletes).toHaveLength(3);
  });

  it("stores an available exception only where they are normally away", () => {
    const { upserts } = planExceptionWrites(["sunday_am", "sunday_pm"], week, "available");
    expect(upserts.map((occ) => occ.normalKey)).toEqual(["wednesday_pm"]);
  });
});
