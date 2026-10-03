import { describe, expect, it } from "vitest";

import { MAX_AHEAD, monthAfter, monthEnd, monthName, parseAhead, planningMonths } from "./planning-window";

describe("planningMonths", () => {
  it("is the planning month alone until the next is a week away", () => {
    expect(planningMonths("2026-10", "2026-10-02", 7, 0)).toEqual(["2026-10"]);
    expect(planningMonths("2026-10", "2026-10-24", 7, 0)).toEqual(["2026-10"]);
    expect(planningMonths("2026-10", "2026-10-25", 7, 0)).toEqual(["2026-10", "2026-11"]);
  });

  it("adds one more month for each Start planning", () => {
    expect(planningMonths("2026-10", "2026-10-02", 7, 1)).toEqual(["2026-10", "2026-11"]);
    expect(planningMonths("2026-10", "2026-10-25", 7, 1)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(planningMonths("2026-12", "2026-12-01", 7, 1)).toEqual(["2026-12", "2027-01"]);
  });
});

describe("month helpers", () => {
  it("steps and ends months, across the year", () => {
    expect(monthAfter("2026-12")).toBe("2027-01");
    expect(monthEnd("2026-11")).toBe("2026-11-30");
    expect(monthEnd("2028-02")).toBe("2028-02-29");
    expect(monthName("2026-11")).toBe("November");
  });

  it("reads ?ahead= safely", () => {
    expect(parseAhead(undefined)).toBe(0);
    expect(parseAhead("2")).toBe(2);
    expect(parseAhead("-1")).toBe(0);
    expect(parseAhead("1.5")).toBe(0);
    expect(parseAhead(["1", "2"])).toBe(0);
    expect(parseAhead("999")).toBe(MAX_AHEAD);
  });
});
