import { describe, expect, it } from "vitest";

import { DEFAULT_SORT, filterSummaries, sortSummaries, summarize } from "@/lib/archive-view";
import type { SongRecord } from "@/types/song-list";

const now = Date.parse("2026-09-24T12:00:00-07:00");

const records: SongRecord[] = [
  {
    id: "amazing grace",
    title: "Amazing Grace",
    number: "244",
    plays: [
      { startsAt: "2025-10-05T10:30:00-07:00", slot: "AM", key: "F" },
      { startsAt: "2026-02-01T10:30:00-07:00", slot: "AM", key: "F " },
      { startsAt: "2026-09-06T10:30:00-07:00", slot: "AM", key: "G" },
    ],
  },
  {
    id: "psalm 54",
    title: "Psalm 54",
    number: null,
    plays: [{ startsAt: "2026-09-20T10:30:00-07:00", slot: "AM", key: "Cm" }],
  },
  {
    id: "autumn hymn",
    title: "Autumn Hymn",
    number: "12",
    plays: [{ startsAt: "2025-09-01T19:00:00-07:00", slot: "PM", key: "D" }],
  },
];

describe("summarize", () => {
  it("counts every play for all time, merging key spellings", () => {
    const grace = summarize(records, "all", now).find((s) => s.id === "amazing grace");
    expect(grace?.count).toBe(3);
    expect(grace?.last).toBe("2026-09-06T10:30:00-07:00");
    expect(grace?.keys).toEqual([
      { key: "F", count: 2 },
      { key: "G", count: 1 },
    ]);
  });

  it("limits to this calendar year or the last 12 months", () => {
    expect(summarize(records, "year", now).find((s) => s.id === "amazing grace")?.count).toBe(2);
    expect(summarize(records, "twelveMonths", now).map((s) => s.id)).not.toContain("autumn hymn");
    expect(summarize(records, "twelveMonths", now).find((s) => s.id === "amazing grace")?.count).toBe(3);
  });
});

describe("sort and filter", () => {
  const all = summarize(records, "all", now);

  const ids = (sort: Parameters<typeof sortSummaries>[1]) => sortSummaries(all, sort).map((s) => s.id);

  it("defaults to the most recently sung first", () => {
    expect(ids(DEFAULT_SORT)).toEqual(["psalm 54", "amazing grace", "autumn hymn"]);
  });

  it("sorts each column both ways", () => {
    expect(ids({ column: "last", direction: "asc" })[0]).toBe("autumn hymn");
    expect(ids({ column: "count", direction: "desc" })[0]).toBe("amazing grace");
    expect(ids({ column: "title", direction: "asc" })).toEqual(["amazing grace", "autumn hymn", "psalm 54"]);
    expect(ids({ column: "title", direction: "desc" })).toEqual(["psalm 54", "autumn hymn", "amazing grace"]);
  });

  it("keeps songs without a hymnal number last in either direction", () => {
    expect(ids({ column: "number", direction: "asc" })).toEqual(["autumn hymn", "amazing grace", "psalm 54"]);
    expect(ids({ column: "number", direction: "desc" })).toEqual(["amazing grace", "autumn hymn", "psalm 54"]);
  });

  it("filters by any key a song has been sung in", () => {
    expect(filterSummaries(all, { query: "", key: "G" }).map((s) => s.id)).toEqual(["amazing grace"]);
    expect(filterSummaries(all, { query: "244", key: "" }).map((s) => s.id)).toEqual(["amazing grace"]);
  });
});
