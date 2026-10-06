import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config/site";
import type { DatedService } from "@/types/song-list";

import { buildCandidates } from "./intelligence";
import { isInsert } from "./model";
import { matchRank, pickerResults, PICKER_LIMIT } from "./picker";

const HYMNAL = siteConfig.sheetMusic.hymnalCollection;
const STARTS = "2026-10-11T10:30:00-07:00";

const SONGS: Record<string, string | null> = {
  "Amazing Grace": "330",
  "Victory in Jesus": "100",
  "At Calvary": "150",
  "Psalm 23": null,
  "Psalm 100": null,
  "Psalm 1": null,
  "Joy to the World": "400",
  "Christmas Psalm": null,
};

const sung = (date: string, titles: string[]): DatedService => ({
  date,
  slot: "AM",
  startsAt: `${date}T10:30:00-07:00`,
  songs: titles.map((title) => ({ title, number: SONGS[title], key: "G" })),
});

// Hymns and two Psalms sung often enough to be suggested; a Psalm never sung; Christmas songs sung only in December.
const candidates = buildCandidates({
  past: [
    sung("2025-12-07", ["Joy to the World", "Christmas Psalm"]),
    sung("2025-12-14", ["Joy to the World", "Christmas Psalm"]),
    sung("2025-12-21", ["Joy to the World", "Christmas Psalm"]),
    sung("2026-06-07", ["Amazing Grace", "Victory in Jesus", "At Calvary", "Psalm 23"]),
    sung("2026-07-05", ["Amazing Grace", "Victory in Jesus", "At Calvary", "Psalm 23", "Psalm 100"]),
    sung("2026-08-02", ["Amazing Grace", "Victory in Jesus", "Psalm 23", "Psalm 100"]),
    sung("2026-08-09", ["At Calvary", "Psalm 100"]),
  ],
  planned: [],
  catalog: Object.entries(SONGS).map(([title, number]) => ({ title, number, collection: HYMNAL, defaultKey: "G" })),
  index: null,
  hymnalCollection: HYMNAL,
});

const titles = (query: string, options: Partial<Parameters<typeof pickerResults>[2]> = {}) =>
  pickerResults(candidates, query, { serviceStartsAt: STARTS, ...options }).map((song) => song.title);

describe("what the song picker lists", () => {
  it("starts, with nothing typed, from familiar songs not sung for the longest", () => {
    expect(titles("")).toEqual(["Amazing Grace", "Psalm 23", "Victory in Jesus", "At Calvary", "Psalm 100"]);
  });

  it("leaves inserts out of that starting list in a service that has its insert already", () => {
    const listed = titles("", { hideInsertSuggestions: true });
    expect(listed).toEqual(["Amazing Grace", "Victory in Jesus", "At Calvary"]);
    expect(pickerResults(candidates, "", { serviceStartsAt: STARTS, hideInsertSuggestions: true }).some(isInsert)).toBe(false);
  });

  it("still finds any insert that is typed for: the suggestions are narrowed, not what can be chosen", () => {
    expect(titles("psalm 100", { hideInsertSuggestions: true })).toEqual(["Psalm 100"]);
    expect(titles("psalm", { hideInsertSuggestions: true }).sort()).toEqual(["Christmas Psalm", "Psalm 1", "Psalm 100", "Psalm 23"]);
    // Typing finds exactly what it finds without the option.
    for (const query of ["psalm", "psalm 1", "grace", "100", "p"]) {
      expect(titles(query, { hideInsertSuggestions: true })).toEqual(titles(query));
    }
  });

  it("lists only inserts on the Inserts page, typed for or not, and all of them", () => {
    // Sung ones first, the longest rested first; then the one never sung.
    expect(titles("", { only: "inserts" })).toEqual(["Psalm 23", "Psalm 100", "Psalm 1"]);
    expect(titles("psalm 1", { only: "inserts" })).toEqual(["Psalm 1", "Psalm 100"]);
    // A hymn is not an insert, so it is not found there at all - by title or by number.
    expect(titles("amazing", { only: "inserts" })).toEqual([]);
    expect(titles("330", { only: "inserts" })).toEqual([]);
  });

  it("keeps Christmas songs for their season in the starting lists, and finds them any time when typed", () => {
    expect(titles("")).not.toContain("Joy to the World");
    expect(titles("", { only: "inserts" })).not.toContain("Christmas Psalm");
    const december = "2026-12-06T10:30:00-08:00";
    expect(pickerResults(candidates, "", { serviceStartsAt: december }).map((song) => song.title)).toContain("Joy to the World");
    expect(pickerResults(candidates, "", { serviceStartsAt: december, only: "inserts" }).map((song) => song.title)).toContain("Christmas Psalm");
    expect(titles("joy")).toEqual(["Joy to the World"]);
  });

  it("finds a song by its number or by part of its title, best match first", () => {
    expect(titles("330")).toEqual(["Amazing Grace"]);
    expect(titles("#100")[0]).toBe("Victory in Jesus");
    expect(titles("calvary")).toEqual(["At Calvary"]);
    expect(matchRank({ id: "amazing grace", title: "Amazing Grace", number: "330" }, "330")).toBe(0);
    expect(matchRank({ id: "amazing grace", title: "Amazing Grace", number: "330" }, "amazing")).toBe(2);
    expect(matchRank({ id: "amazing grace", title: "Amazing Grace", number: "330" }, "grace")).toBe(3);
    expect(matchRank({ id: "amazing grace", title: "Amazing Grace", number: "330" }, "calvary")).toBeNull();
  });

  it("never lists more than its limit", () => {
    const many = buildCandidates({
      past: [],
      planned: [],
      catalog: Array.from({ length: 200 }, (_, n) => ({ title: `Psalm ${n + 1}`, number: null, collection: null, defaultKey: null })),
      index: null,
      hymnalCollection: HYMNAL,
    });
    expect(pickerResults(many, "psalm", { serviceStartsAt: STARTS })).toHaveLength(PICKER_LIMIT);
    expect(pickerResults(many, "", { serviceStartsAt: STARTS, only: "inserts" })).toHaveLength(PICKER_LIMIT);
  });
});
