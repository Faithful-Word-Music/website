import { describe, expect, it } from "vitest";

import { placeCards, stackSize } from "@/lib/card-layout";

const full = (rows = 5) => ({ full: true, rows });
const placeholder = { full: false, rows: 0 };
const at = (cards: Parameters<typeof placeCards>[0]) =>
  placeCards(cards).map(({ column, row, span }) => `${column}:${row}+${span}`);

describe("placeCards", () => {
  it("pairs full cards two to a row", () => {
    expect(at([full(), full(), full()])).toEqual(["1:1+1", "2:1+1", "1:2+1"]);
  });

  it("stacks placeholders beside a full card, then pairs the rest in line", () => {
    // October mid-planning: Oct 4 AM/PM, Oct 7, then nine placeholders.
    const cards = [full(), full(), full(), ...Array.from({ length: 9 }, () => placeholder)];
    expect(at(cards)).toEqual([
      "1:1+1",
      "2:1+1",
      "1:2+3", // Oct 7, three rows tall
      "2:2+1",
      "2:3+1",
      "2:4+1",
      "1:5+1", // back in step: pairs share a row again
      "2:5+1",
      "1:6+1",
      "2:6+1",
      "1:7+1",
      "2:7+1",
    ]);
  });

  it("stacks on the left when the full card is on the right", () => {
    expect(at([placeholder, full(), placeholder, placeholder, full()])).toEqual([
      "1:1+1",
      "2:1+3",
      "1:2+1",
      "1:3+1",
      "1:4+1",
    ]);
  });

  it("shortens the full card's span when fewer placeholders follow", () => {
    expect(at([full(), placeholder, full()])).toEqual(["1:1+1", "2:1+1", "1:2+1"]);
  });

  it("fits more placeholders beside a longer service", () => {
    expect(stackSize(1)).toBe(1);
    expect(stackSize(5)).toBe(3);
    expect(stackSize(8)).toBeGreaterThan(3);
  });
});
