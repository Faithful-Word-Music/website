import { describe, expect, it } from "vitest";

import { DEFAULT_CAPO_POLICY, type CapoRules } from "@/lib/capo-policy";
import type { IndexSong, SheetMusicIndex } from "@/lib/sheet-music";
import { firstKey } from "@/lib/song-key";
import type { DatedService } from "@/types/song-list";

import {
  buildCandidates,
  candidateFacts,
  candidateSheetMusicCheck,
  indexSheetMusicCheck,
  missingSheetMusic,
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
    expect(check({ title: "Amazing grace", number: null })).toMatchObject({ inIndex: true, hasFiles: true, missing: ["Ben"], key: "G" });
    expect(check({ title: "Unknown Song", number: null })).toMatchObject({ inIndex: false, hasFiles: false, missing: [] });
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
    // Hymns from the hymnal: each has its number. (A song without one is an insert, which is not flagged for repeating in its own week.)
    { title: "Amazing Grace", number: "236", key: "G", insert: false },
    { title: "Victory in Jesus", number: "100", key: "Bb", insert: false },
    { title: "Amazing Grace", number: "236", key: "G", insert: false },
    { title: "O Come All Ye Faithful", number: "401", key: "G", insert: false },
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
    expect(signals).toContainEqual({ kind: "sheet-music-gap", title: "Amazing Grace", people: ["Ben"], everyone: false });
    expect(signals).toContainEqual({ kind: "no-sheet-music-entry", title: "Victory in Jesus" });
    expect(kinds).toContain("empty-places");
  });
});

describe("sheet music, said briefly", () => {
  const service = (titles: string[]) => ({
    date: "2026-10-11",
    startsAt: "2026-10-11T10:30:00-07:00",
    slots: titles.map((title) => ({ title, number: null, key: null, insert: false })),
  });
  const check = (people: typeof musicians) => indexSheetMusicCheck(index, HYMNAL, people);
  const capoOnly = [
    { id: "b", name: "Ben", typeIds: [2] },
    { id: "d", name: "Dee", typeIds: [2] },
  ];

  it("does not name the musicians when none of them has a song's sheet music", () => {
    const signals = serviceSignals({ service: service(["Amazing Grace"]), past: [], planned: [], sheetMusic: check(capoOnly) });
    expect(signals).toContainEqual({ kind: "sheet-music-gap", title: "Amazing Grace", people: ["Ben", "Dee"], everyone: true });
  });

  it("says it once when no song in the service has sheet music", () => {
    const none = serviceSignals({
      service: service(["Victory in Jesus", "Unknown Song"]),
      past: [],
      planned: [],
      sheetMusic: check(musicians),
    });
    expect(none).toEqual([{ kind: "no-sheet-music", anyFiles: false }]);

    // Files exist, but of no type the expected musicians use.
    const noneForThem = serviceSignals({
      service: service(["Amazing Grace", "Unknown Song"]),
      past: [],
      planned: [],
      sheetMusic: check(capoOnly),
    });
    expect(noneForThem).toEqual([{ kind: "no-sheet-music", anyFiles: true }]);
  });

  it("keeps the detail when only some are missing", () => {
    const some = serviceSignals({
      service: service(["Amazing Grace", "Unknown Song"]),
      past: [],
      planned: [],
      sheetMusic: check(musicians),
    });
    expect(some).toEqual([
      { kind: "sheet-music-gap", title: "Amazing Grace", people: ["Ben"], everyone: false },
      { kind: "no-sheet-music-entry", title: "Unknown Song" },
    ]);
  });
});

describe("a song's own key", () => {
  it("is the Index's first key, ahead of the catalog's and of any key it was sung in", () => {
    const candidates = buildCandidates({
      past,
      planned: [],
      // The catalog still says F; the Index has since settled on G.
      catalog: [{ title: "Amazing Grace", number: "330", collection: HYMNAL, defaultKey: "F" }],
      index,
      hymnalCollection: HYMNAL,
    });
    const grace = candidates.find((item) => item.title === "Amazing Grace")!;
    expect(grace.defaultKey).toBe("G");
    // Looking from just after it was sung in F: the old key is not offered.
    expect(candidateFacts(grace, "2026-06-14T10:30:00-07:00").suggestedKey).toBe("G");
  });

  it("falls back to the last key sung only for a song with no key of its own", () => {
    const candidates = buildCandidates({ past, planned: [], catalog: [], index, hymnalCollection: HYMNAL });
    const victory = candidates.find((item) => item.title === "Victory in Jesus")!;
    expect(victory.defaultKey).toBeNull();
    expect(suggestKey(victory)).toBe("Bb");
  });

  it("flags a service planned in another key, without touching it", () => {
    const slots = [{ title: "Amazing Grace", number: null, key: "F", insert: false }];
    const signals = serviceSignals({
      service: { date: "2026-11-01", startsAt: "2026-11-01T10:30:00-07:00", slots },
      past: [],
      planned: [],
      sheetMusic: indexSheetMusicCheck(index, HYMNAL, []),
    });
    expect(signals).toEqual([{ kind: "key-differs", title: "Amazing Grace", key: "F", current: "G" }]);
    expect(slots[0].key).toBe("F");
  });
});

describe("capo sheet music", () => {
  const STANDARD = 1;
  const CAPO = 2;
  const version = (typeId: number) => ({ typeId, label: String(typeId), version: "1", keys: null, capoFret: null, files: [file("pdf")] });
  const songIn = (keys: string, typeIds: number[]) =>
    ({ ...index.songs[0], title: "Like a River Glorious", keys, versions: typeIds.map(version) }) as IndexSong;
  const guitarist = [{ id: "g", name: "Gil", typeIds: [CAPO, STANDARD] }];
  const rules: CapoRules = { policy: { ...DEFAULT_CAPO_POLICY, typeId: CAPO }, overrides: {} };
  const missing = (song: IndexSong, capoRules: CapoRules) =>
    missingSheetMusic(song, guitarist, { song: { title: song.title, key: song.keys }, rules: capoRules });

  it("is asked for in a flat key, where another type is no substitute", () => {
    expect(missing(songIn("Eb", [STANDARD]), rules)).toEqual({ none: [], everyone: false, capo: ["Gil"] });
    expect(missing(songIn("Eb", [STANDARD, CAPO]), rules).capo).toEqual([]);
  });

  it("is not asked for in a key that needs no capo", () => {
    expect(missing(songIn("G", [STANDARD]), rules)).toEqual({ none: [], everyone: false, capo: [] });
  });

  it("follows the song's own setting over the policy", () => {
    const always: CapoRules = { ...rules, overrides: { "like a river glorious": "always" } };
    const never: CapoRules = { ...rules, overrides: { "like a river glorious": "never" } };
    expect(missing(songIn("G", [STANDARD]), always).capo).toEqual(["Gil"]);
    expect(missing(songIn("Eb", [STANDARD]), never).capo).toEqual([]);
  });

  it("is never asked of someone without the capo type", () => {
    const pianist = [{ id: "p", name: "Pat", typeIds: [STANDARD] }];
    const song = songIn("Eb", [STANDARD]);
    expect(missingSheetMusic(song, pianist, { song: { title: song.title, key: "Eb" }, rules }).capo).toEqual([]);
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
