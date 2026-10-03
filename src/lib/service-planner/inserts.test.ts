import { describe, expect, it } from "vitest";

import { insertMonths, insertRange, nextInsertMonth } from "./inserts";

// October 2026: Sundays 4, 11, 18, 25. November 2026: Sundays 1, 8, 15, 22, 29.
const OCTOBER = ["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"];
const NOVEMBER = ["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"];
const none = new Set<string>();

describe("insertMonths", () => {
  it("never shows a week that has begun, even on its Monday", () => {
    // Friday Oct 2: the week of Sep 27 is under way.
    expect(insertMonths("2026-10-02", none, 7)).toEqual([
      { month: "2026-10", weekStarts: OCTOBER, planned: false, collapsed: false },
    ]);
    // Sunday Oct 4 itself: that week has begun too.
    expect(insertMonths("2026-10-04", none, 7)[0].weekStarts).toEqual(OCTOBER.slice(1));
  });

  it("keeps a planned month in view until the next month is near", () => {
    expect(insertMonths("2026-10-02", new Set(OCTOBER), 7)).toEqual([
      { month: "2026-10", weekStarts: OCTOBER, planned: true, collapsed: false },
    ]);
  });

  it("brings in the next month leadDays before it starts, and nothing beyond", () => {
    // Jan 2027: Sundays 3, 10, 17, 24, 31; Feb 1 less 7 days is Jan 25.
    expect(insertMonths("2027-01-24", none, 7).map((month) => month.month)).toEqual(["2027-01"]);
    const months = insertMonths("2027-01-25", none, 7);
    expect(months.map((month) => month.month)).toEqual(["2027-01", "2027-02"]);
    expect(months[0].weekStarts).toEqual(["2027-01-31"]);
    expect(months[1].weekStarts).toEqual(["2027-02-07", "2027-02-14", "2027-02-21", "2027-02-28"]);
  });

  it("folds a planned month once the next is up, and drops it once the next is planned", () => {
    const today = "2027-01-25";
    expect(insertMonths(today, new Set(["2027-01-31"]), 7).map(({ month, collapsed }) => ({ month, collapsed }))).toEqual([
      { month: "2027-01", collapsed: true },
      { month: "2027-02", collapsed: false },
    ]);
    const all = new Set(["2027-01-31", "2027-02-07", "2027-02-14", "2027-02-21", "2027-02-28"]);
    expect(insertMonths(today, all, 7).map((month) => month.month)).toEqual(["2027-02"]);
  });

  it("leaves an unplanned month open beside the next one", () => {
    expect(insertMonths("2027-01-25", none, 7).every((month) => !month.collapsed)).toBe(true);
  });

  it("counts a week in the month of its Sunday", () => {
    // Oct 25's week runs into November but is October's.
    expect(insertMonths("2026-10-19", none, 14).map((month) => month.weekStarts)).toEqual([["2026-10-25"], NOVEMBER]);
  });

  it("rolls over the year", () => {
    expect(insertMonths("2026-12-28", none, 7).map((month) => month.month)).toEqual(["2027-01"]);
    expect(insertMonths("2026-12-25", none, 7).map((month) => month.month)).toEqual(["2026-12", "2027-01"]);
  });
});

describe("starting the next month early", () => {
  it("brings in one more month each time it is asked", () => {
    expect(nextInsertMonth("2026-10-02", 7)).toBe("2026-11");
    const months = insertMonths("2026-10-02", none, 7, 1);
    expect(months.map((month) => month.month)).toEqual(["2026-10", "2026-11"]);
    expect(months[1].weekStarts).toEqual(NOVEMBER);
    expect(nextInsertMonth("2026-10-02", 7, 1)).toBe("2026-12");
  });

  it("folds and drops planned months before the last one shown", () => {
    const planned = new Set([...OCTOBER, ...NOVEMBER]);
    // October and November planned, December just started: October goes, November folds.
    expect(insertMonths("2026-10-02", planned, 7, 2).map(({ month, collapsed }) => ({ month, collapsed }))).toEqual([
      { month: "2026-11", collapsed: true },
      { month: "2026-12", collapsed: false },
    ]);
  });
});

describe("insertRange", () => {
  it("runs from the first week to come to the end of the last week in view", () => {
    expect(insertRange("2026-10-02", 7)).toEqual({ from: "2026-10-04", to: "2026-10-31" });
    // Nov 29's week runs to Dec 5, and its Wednesday service is Dec 2.
    expect(insertRange("2026-10-02", 7, 1)).toEqual({ from: "2026-10-04", to: "2026-12-05" });
    expect(insertRange("2026-12-25", 7)).toEqual({ from: "2026-12-27", to: "2027-02-06" });
  });
});
