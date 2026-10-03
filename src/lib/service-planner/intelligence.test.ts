import { describe, expect, it } from "vitest";

import type { SheetMusicIndex } from "@/lib/sheet-music";
import type { DatedService } from "@/types/song-list";

import {
  buildCandidates,
  candidateFacts,
  candidateSheetMusicCheck,
  indexSheetMusicCheck,
  firstKey,
  serviceAvailability,
  serviceSignals,
  suggestKey,
} from "./intelligence";

const HYMNAL = "Soul-Stirring Songs and Hymns 1989";

function sung(date: string, titles: Array<[string, string | null]>): DatedService {
  return {
    date,
    slot: "AM",
    startsAt: `${date}T10:30:00-07:00`,
    songs: titles.map(([title, key]) => ({ title, number: null, key })),
  };
}

const past = [
  sung("2025-12-14", [["O Come All Ye Faithful", "G"]]),
  sung("2026-06-07", [["Amazing Grace", "F"], ["Victory in Jesus", "Bb"]]),
  sung("2026-09-27", [["Amazing Grace", "G"], ["Victory in Jesus", "Bb"]]),
  sung("2026-10-04", [["Amazing Grace", "G"]]),
];

function file(format: "pdf" | "musescore") {
  return { slug: format, name: format, format, driveFileId: "x", restricted: false } as never;
}

const index = {
  types: [
    { id: 1, label: "Standard" },
    { id: 2, label: "Capo (Chords)" },
  ],
  songs: [
    {
      id: "S-1",
      title: "Amazing Grace",
      composer: null,
      lyricist: null,
      keys: "G, Ab",
      type: null,
      collection: HYMNAL,
      hymnNumber: "330",
      category: null,
      occasion: null,
      source: null,
      rights: "public-domain",
      versions: [{ typeId: 1, label: "Standard", version: "1", keys: null, files: [file("pdf")] }],
    },
  ],
} as unknown as SheetMusicIndex;

const musicians = [
  { id: "a", name: "Ann", typeIds: [1] },
  { id: "b", name: "Ben", typeIds: [2] },
  { id: "c", name: "Cal", typeIds: [] },
];

describe("candidates", () => {
  const candidates = buildCandidates({
    past,
    musicians,
    planned: [{ startsAt: "2026-10-18T10:30:00-07:00", songs: [{ title: "Amazing Grace" }] }],
    catalog: [{ title: "A New Song", number: null, collection: "Choruses", defaultKey: "D" }],
    index,
    hymnalCollection: HYMNAL,
  });
  const byTitle = (title: string) => candidates.find((item) => item.title === title)!;

  it("brings history, the catalog and the Index together, once per song", () => {
    expect(candidates.map((item) => item.title).sort()).toEqual(
      ["A New Song", "Amazing Grace", "O Come All Ye Faithful", "Victory in Jesus"].sort(),
    );
    expect(byTitle("A New Song")).toMatchObject({ isNew: true, defaultKey: "D", playCount: 0 });
    expect(byTitle("Amazing Grace")).toMatchObject({
      number: "330",
      playCount: 3,
      sheetMusic: "complete",
      defaultKey: "G",
      upcoming: ["2026-10-18T10:30:00-07:00"],
    });
    expect(byTitle("Victory in Jesus").sheetMusic).toBe("unknown");
  });

  it("carries the sheet music check, so the browser can run it as songs change", () => {
    expect(byTitle("Amazing Grace")).toMatchObject({ inIndex: true, missingFor: ["Ben"] });
    const check = candidateSheetMusicCheck(new Map(candidates.map((item) => [item.id, item])));
    expect(check({ title: "Amazing grace", number: null })).toEqual({ inIndex: true, missing: ["Ben"] });
    expect(check({ title: "Unknown Song", number: null })).toEqual({ inIndex: false, missing: [] });
  });

  it("recognises Christmas songs from the record", () => {
    expect(byTitle("O Come All Ye Faithful").christmas).toBe(true);
    expect(byTitle("Amazing Grace").christmas).toBe(false);
  });

  it("works out the facts from the service being planned, and suggests the last key", () => {
    const facts = candidateFacts(byTitle("Amazing Grace"), "2026-10-11T10:30:00-07:00");
    expect(facts).toMatchObject({ daysSince: 7, lastYear: 3, thisYear: 3, recentKeys: ["G", "F"], suggestedKey: "G" });
    expect(facts.upcoming).toEqual(["2026-10-18T10:30:00-07:00"]);
    expect(candidateFacts(byTitle("Amazing Grace"), "2026-06-01T10:30:00-07:00").lastSung).toBeNull();
    expect(suggestKey(byTitle("A New Song"))).toBe("D");
    expect(firstKey("G, Ab")).toBe("G");
  });
});

describe("serviceSignals", () => {
  const slots = [
    { title: "Amazing Grace", number: null, key: "G", insert: false },
    { title: "Victory in Jesus", number: null, key: "Bb", insert: false },
    { title: "Amazing Grace", number: null, key: "G", insert: false },
    { title: "O Come All Ye Faithful", number: null, key: "G", insert: false },
    null,
  ];
  const signals = serviceSignals({
    service: { date: "2026-10-11", startsAt: "2026-10-11T10:30:00-07:00", slots },
    past,
    planned: [{ startsAt: "2026-10-14T19:00:00-07:00", songs: [{ title: "Victory in Jesus" }] }],
    sheetMusic: indexSheetMusicCheck(index, HYMNAL, musicians),
  });
  const kinds = signals.map((signal) => signal.kind);

  it("flags duplicates, recent use and nearby plans", () => {
    expect(signals).toContainEqual({ kind: "duplicate", title: "Amazing Grace" });
    expect(signals).toContainEqual({ kind: "recently-sung", title: "Amazing Grace", at: "2026-10-04T10:30:00-07:00", days: 7 });
    expect(signals).toContainEqual({ kind: "planned-nearby", title: "Victory in Jesus", at: "2026-10-14T19:00:00-07:00" });
  });

  it("flags a pairing repeated from recent services and a carol out of season", () => {
    expect(signals).toContainEqual({
      kind: "repeated-pair",
      titles: ["Amazing Grace", "Victory in Jesus"],
      at: "2026-09-27T10:30:00-07:00",
    });
    expect(signals).toContainEqual({ kind: "out-of-season", title: "O Come All Ye Faithful" });
  });

  it("names the musicians missing their sheet music, and songs the Index lacks", () => {
    expect(signals).toContainEqual({ kind: "sheet-music-gap", title: "Amazing Grace", people: ["Ben"] });
    expect(signals).toContainEqual({ kind: "no-sheet-music-entry", title: "Victory in Jesus" });
    expect(kinds).toContain("empty-places");
  });
});

describe("serviceAvailability", () => {
  it("splits the team into expected, away and extra", () => {
    const roster = [
      { id: "a", name: "Ann", normal: ["sunday_am" as const] },
      { id: "b", name: "Ben", normal: ["sunday_am" as const] },
      { id: "c", name: "Cal", normal: [] },
    ];
    const result = serviceAvailability({ normalKey: "sunday_am" }, roster, [
      { userId: "b", status: "unavailable", note: "Travelling" },
      { userId: "c", status: "available", note: null },
    ]);
    expect(result.expected.map((person) => person.name)).toEqual(["Ann", "Cal"]);
    expect(result.away).toEqual([{ id: "b", name: "Ben", note: "Travelling" }]);
    expect(result.extra.map((person) => person.name)).toEqual(["Cal"]);
  });
});

describe("the week's insert", () => {
  it("is not flagged for being sung in each of its week's services", () => {
    const insert = { title: "Psalm 120", number: null, key: "D", insert: true };
    const signals = serviceSignals({
      service: { date: "2026-10-14", startsAt: "2026-10-14T19:00:00-07:00", slots: [null, null, insert] },
      past: [sung("2026-10-11", [["Psalm 120", "D"]])],
      planned: [{ startsAt: "2026-10-18T10:30:00-07:00", songs: [{ title: "Psalm 120" }] }],
      sheetMusic: null,
    });
    expect(signals.map((signal) => signal.kind)).not.toContain("recently-sung");
    // The next week's service is not this week's: still worth knowing.
    expect(signals.map((signal) => signal.kind)).toContain("planned-nearby");
  });
});
