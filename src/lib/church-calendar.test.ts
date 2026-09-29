import { describe, expect, it } from "vitest";

import { christmasSeason, christmasSongs, inChristmasSeason, thanksgiving } from "@/lib/church-calendar";
import { startsAtFor } from "@/lib/service-time";
import { songKey } from "@/lib/song-list";
import type { DatedService } from "@/types/song-list";

const service = (date: string, titles: string[]): DatedService => ({
  date,
  slot: "AM",
  startsAt: startsAtFor(date, "AM"),
  songs: titles.map((title) => ({ number: null, title, key: null })),
});

describe("the Christmas season", () => {
  it("finds Thanksgiving, the fourth Thursday of November", () => {
    expect(thanksgiving(2025)).toBe("2025-11-27");
    expect(thanksgiving(2026)).toBe("2026-11-26");
    expect(thanksgiving(2029)).toBe("2029-11-22"); // November 1 is itself a Thursday
  });

  it("runs from the day after Thanksgiving to Christmas Day", () => {
    expect(christmasSeason(2025)).toEqual({ from: "2025-11-28", to: "2025-12-25" });
    expect(inChristmasSeason("2025-11-27")).toBe(false); // Thanksgiving itself
    expect(inChristmasSeason("2025-11-30")).toBe(true); // the first Sunday after, when the carols began
    expect(inChristmasSeason("2025-12-24")).toBe(true);
    expect(inChristmasSeason("2025-12-28")).toBe(false);
  });

  it("counts a song as a Christmas song only if it was never sung out of season", () => {
    const songs = christmasSongs([
      service("2025-11-23", ["Great Is Thy Faithfulness"]),
      service("2025-11-30", ["Praise Him! Praise Him!", "Good Christian Men, Rejoice"]),
      service("2025-12-21", ["Joy to the World!", "O Worship the King"]),
      service("2026-03-01", ["Praise Him! Praise Him!"]),
    ]);
    expect([...songs].sort()).toEqual(
      [songKey("Good Christian Men, Rejoice"), songKey("Joy to the World!"), songKey("O Worship the King")].sort(),
    );
  });
});
