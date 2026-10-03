import { describe, expect, it } from "vitest";

import { nextNavMode } from "./use-nav-fit";

describe("nextNavMode", () => {
  it("shows the links to measure them when nothing is known yet", () => {
    expect(nextNavMode(null, { rowWidth: 600, overflow: null })).toEqual({ mode: "wide", required: null });
  });

  it("keeps the row while the links fit", () => {
    expect(nextNavMode(null, { rowWidth: 1200, overflow: 0 })).toEqual({ mode: "wide", required: null });
  });

  it("collapses when the links spill over, remembering what they need", () => {
    expect(nextNavMode(null, { rowWidth: 1000, overflow: 40 })).toEqual({ mode: "narrow", required: 1056 });
  });

  it("stays collapsed until there is room to spare", () => {
    expect(nextNavMode(1056, { rowWidth: 1040, overflow: null }).mode).toBe("narrow");
    expect(nextNavMode(1056, { rowWidth: 1056, overflow: null }).mode).toBe("wide");
  });
});
