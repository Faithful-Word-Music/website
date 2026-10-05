import { describe, expect, it } from "vitest";

import type { ConductorData, UpcomingService } from "@/lib/ai/conductor/facts";
import { clampToolResult, CONDUCTOR_LIMITS } from "@/lib/ai/conductor/limits";
import {
  findLibrarySong,
  historyLookup,
  lyricMatches,
  NOT_INDEXED,
  SECTION_CHARS,
  similarMatches,
  songLyrics,
  THEME_SONGS_MAX,
  themeMatches,
  type LibraryEntry,
  type LibraryHit,
} from "@/lib/ai/conductor/lyrics";
import type { LyricSection } from "@/lib/library-content/lyrics";
import { startsAtFor } from "@/lib/service-time";
import { songKey } from "@/lib/song-list";
import type { DatedService, ServiceSlot, Song } from "@/types/song-list";

const HYMNAL = "Soul-Stirring Songs and Hymns 1989";

const sung = (title: string, number: string | null): Song => ({ title, number, key: "G" });
const service = (date: string, slot: ServiceSlot, songs: Song[]): DatedService => ({ date, slot, startsAt: startsAtFor(date, slot), songs });

// Monday, October 5, 2026, midday in Arizona.
const NOW = Date.parse("2026-10-05T12:00:00-07:00");
const planned: UpcomingService = { ...service("2026-10-11", "AM", [sung("Beulah Land", "53")]), status: "published", emptyPlaces: 0 };

const data = (overrides: Partial<ConductorData> = {}): ConductorData => ({
  now: NOW,
  today: "2026-10-05",
  past: [
    service("2026-04-19", "AM", [sung("Beulah Land", "53"), sung("Sweet By and By", "41")]),
    service("2026-09-27", "AM", [sung("When We All Get to Heaven", "56")]),
    service("2026-10-04", "AM", [sung("Sweet By and By", "41")]),
  ],
  upcoming: [planned],
  catalog: [],
  draftsIncluded: false,
  historyAvailable: true,
  ...overrides,
});

const entry = (songId: string, title: string, collection: string | null, hymnNumber: string | null, status: LibraryEntry["status"] = "indexed"): LibraryEntry => ({
  songId,
  title,
  titleKey: songKey(title),
  collection,
  hymnNumber,
  status,
});

const BEULAH = entry("SSSH1989-053", "Beulah Land", HYMNAL, "053");
const SWEET = entry("SSSH1989-041", "Sweet By and By", HYMNAL, "041");
const HEAVEN = entry("SSSH1989-056", "When We All Get to Heaven", HYMNAL, "056");
const BEAUTIFUL = entry("SSSH1989-039", "How Beautiful Heaven Must Be", HYMNAL, "039");
const SPARROW = entry("OS-014", "His Eye Is on the Sparrow", "Other Songs", null);
const SPARROW_COPY = entry("SHR-198", "His Eye Is On The Sparrow", "Songs & Hymns of Revival", "198");
const SILENT = entry("BTH-015", "I Love You, Lord", "Bible Truth Hymns", "15", "no_lyrics");
const LIBRARY = [BEULAH, SWEET, HEAVEN, BEAUTIFUL, SPARROW, SPARROW_COPY, SILENT];

const SECTIONS: LyricSection[] = [
  { kind: "verse", number: 1, text: "I've reached the land of corn and wine" },
  { kind: "verse", number: 2, text: "My Saviour comes and walks with me" },
  { kind: "refrain", number: null, text: "O Beulah Land, sweet Beulah Land" },
];

const found = (query: string) => {
  const result = findLibrarySong(LIBRARY, query);
  if (!result.found) throw new Error("not found");
  return result.song;
};
const hit = (song: LibraryEntry, score: number | null = null, section: LyricSection | null = null): LibraryHit => ({ song, section, score });

/** A tool result read loosely: which fields it has depends on what was found. */
interface Loose {
  songs: Array<{ title: string; [key: string]: unknown }>;
  [key: string]: unknown;
}
const loose = (value: object) => value as unknown as Loose;
const matchesOf = (...input: Parameters<typeof lyricMatches>) => loose(lyricMatches(...input));
const themesOf = (...input: Parameters<typeof themeMatches>) => loose(themeMatches(...input));
const similarOf = (...input: Parameters<typeof similarMatches>) => loose(similarMatches(...input));

describe("historyLookup", () => {
  it("ties a library song to what has been sung, by title or by its number in the hymnal", () => {
    const history = historyLookup(data());
    expect(history(SWEET)).toEqual({ timesSung: 2, lastSung: "2026-10-04", daysSinceLastSung: 1 });
    expect(history({ ...BEULAH, title: "Beulah Land (Is It Not?)", titleKey: "beulah land is it not" })).toMatchObject({ timesSung: 1, lastSung: "2026-04-19" });
    expect(history(BEULAH)?.plannedFor).toEqual([{ date: "2026-10-11", service: "Sunday morning", status: "published" }]);
  });

  it("says a song has never been sung, and says nothing when the history cannot be read", () => {
    expect(historyLookup(data())(BEAUTIFUL)).toEqual({ timesSung: 0, lastSung: null, daysSinceLastSung: null });
    expect(historyLookup(data({ historyAvailable: false }))(SWEET)).toBeNull();
  });
});

/** A song's lyrics as a tool hands them over, whichever shape the answer took. */
const lyricsOf = (...input: Parameters<typeof songLyrics>) =>
  songLyrics(...input) as { song: unknown; lyrics?: unknown[]; note?: string; source?: string };

describe("songLyrics", () => {
  it("gives a song's words in order, with its history and where they came from", () => {
    const result = lyricsOf(found("beulah land"), SECTIONS, data());
    expect(result).toMatchObject({
      found: true,
      song: { title: "Beulah Land", number: "053", collection: HYMNAL },
      lyricsIndexed: true,
      verses: 2,
      hasRefrain: true,
      timesSung: 1,
      lastSung: "2026-04-19",
    });
    expect(result.lyrics).toEqual([
      { section: "Verse 1", text: "I've reached the land of corn and wine" },
      { section: "Verse 2", text: "My Saviour comes and walks with me" },
      { section: "Refrain", text: "O Beulah Land, sweet Beulah Land" },
    ]);
    expect(result.source).toContain("MuseScore");
  });

  it("gives only the verse or the refrain asked for, and every section when there is no such one", () => {
    expect(lyricsOf(found("#53"), SECTIONS, data(), { verse: 2 }).lyrics).toEqual([{ section: "Verse 2", text: "My Saviour comes and walks with me" }]);
    expect(lyricsOf(found("#53"), SECTIONS, data(), { refrain: true }).lyrics).toEqual([{ section: "Refrain", text: "O Beulah Land, sweet Beulah Land" }]);
    const missing = lyricsOf(found("#53"), SECTIONS, data(), { verse: 7 });
    expect(missing.lyrics).toHaveLength(3);
    expect(missing.note).toContain("no such section");
  });

  it("says so when a song has no indexed lyrics, rather than leaving a gap to fill", () => {
    const result = lyricsOf(found("I Love You, Lord"), [], data());
    expect(result).toMatchObject({ found: true, lyricsIndexed: false });
    expect(result.note).toContain("no lyrics written");
    expect(result.note).toContain("do not give them from memory");
    expect("lyrics" in result).toBe(false);
  });

  it("names a song from another book by its book, and the other books a song is in", () => {
    expect(lyricsOf(found("his eye is on the sparrow"), SECTIONS, data()).song).toEqual({
      title: "His Eye Is on the Sparrow",
      collection: "Other Songs",
      alsoIn: ["Songs & Hymns of Revival"],
    });
  });

  it("asks which song is meant, and says when there is none", () => {
    const ambiguous = findLibrarySong(LIBRARY, "heaven");
    expect(ambiguous.found).toBe(false);
    if (!ambiguous.found) expect(ambiguous.answer.possibleSongs?.map((song) => song.title)).toEqual(["When We All Get to Heaven", "How Beautiful Heaven Must Be"]);
    const none = findLibrarySong(LIBRARY, "Canon in D");
    if (!none.found) expect(none.answer.note).toContain("not give its lyrics from memory");
  });

  it("tells the model the library is not indexed yet", () => {
    expect(NOT_INDEXED.note).toContain("not been indexed");
  });
});

describe("lyricMatches", () => {
  it("lists each song once with the section the words are in", () => {
    const result = matchesOf(
      { mode: "phrase", hits: [hit(SPARROW_COPY, null, SECTIONS[0]), hit(SPARROW, null, SECTIONS[0]), hit(BEULAH, null, null)] },
      "land of corn",
      LIBRARY,
      data(),
    );
    expect(result.matched).toBe("the exact phrase");
    expect(result.songsMatching).toBe(2);
    expect(result.songs?.[0]).toMatchObject({ title: "His Eye Is on the Sparrow", collection: "Other Songs", foundIn: { section: "Verse 1" }, timesSung: 0 });
    expect(result.songs?.[1]).toMatchObject({ title: "Beulah Land", foundIn: { note: expect.stringContaining("one section into the next") } });
  });

  it("says when it fell back to the words in any order, when nothing matched, and when there is too little to search", () => {
    expect(matchesOf({ mode: "words", hits: [hit(BEULAH, null, SECTIONS[2])] }, "sweet land Beulah", LIBRARY, data()).matched).toContain("any order");
    expect(matchesOf({ mode: "phrase", hits: [] }, "no such words", LIBRARY, data()).note).toContain("poetic spellings");
    expect(matchesOf({ mode: "too-short", hits: [] }, "o", LIBRARY, data()).note).toContain("too short");
  });

  it("cuts a long section short", () => {
    const long = { kind: "section" as const, number: null, text: "word ".repeat(400).trim() };
    const result = matchesOf({ mode: "phrase", hits: [hit(BEULAH, null, long)] }, "word word", LIBRARY, data());
    const text = (result.songs?.[0].foundIn as { text: string }).text;
    expect(text.length).toBeLessThanOrEqual(SECTION_CHARS);
    expect(text.endsWith("…")).toBe(true);
  });
});

describe("themeMatches", () => {
  const hits = [hit(HEAVEN, 0.612, SECTIONS[2]), hit(BEAUTIFUL, 0.6), hit(SWEET, 0.55), hit(BEULAH, 0.5), hit(SPARROW_COPY, 0.31)];

  it("ranks songs by closeness, each with its history", () => {
    const result = themesOf(hits, "heaven", LIBRARY, data());
    expect(result.songs.map((song) => song.title)).toEqual([
      "When We All Get to Heaven",
      "How Beautiful Heaven Must Be",
      "Sweet By and By",
      "Beulah Land",
      "His Eye Is on the Sparrow",
    ]);
    expect(result.songs[0]).toMatchObject({ closeness: 0.61, closestSection: { section: "Refrain" }, timesSung: 1, lastSung: "2026-09-27" });
    expect(result.howToRead).toContain("not a verdict");
    expect(result.recordsBegin).toBe("2026-04-19");
  });

  it("keeps only songs not sung lately and not already planned", () => {
    const result = themesOf(hits, "heaven", LIBRARY, data(), { notSungForDays: 60 });
    // Sweet By and By was sung yesterday, When We All Get to Heaven last week, Beulah Land is planned.
    expect(result.songs.map((song) => song.title)).toEqual(["How Beautiful Heaven Must Be", "His Eye Is on the Sparrow"]);
    expect(result).toMatchObject({ onlySongsNotSungForDays: 60, plannedSongsLeftOut: true });
  });

  it("keeps only songs sung here before, and both limits together", () => {
    expect(themesOf(hits, "heaven", LIBRARY, data(), { onlySungBefore: true }).songs.map((song) => song.title)).toEqual([
      "When We All Get to Heaven",
      "Sweet By and By",
      "Beulah Land",
    ]);
    const both = themesOf(hits, "heaven", LIBRARY, data({ upcoming: [] }), { onlySungBefore: true, notSungForDays: 60 });
    expect(both.songs.map((song) => song.title)).toEqual(["Beulah Land"]);
  });

  it("caps the list and says so, and stays within a tool result's size", () => {
    const many = Array.from({ length: 60 }, (_, index) => hit(entry(`X-${index}`, `Song ${index}`, HYMNAL, String(index)), 0.9 - index / 100, SECTIONS[0]));
    const result = themesOf(many, "anything", LIBRARY, data(), { limit: 500 });
    expect(result.songs).toHaveLength(THEME_SONGS_MAX);
    expect(result.truncated).toBe(true);
    expect(JSON.stringify(clampToolResult(result)).length).toBeLessThanOrEqual(CONDUCTOR_LIMITS.toolResultChars);
  });

  it("does not limit by a history it could not read", () => {
    const result = themesOf(hits, "heaven", LIBRARY, data({ historyAvailable: false }), { notSungForDays: 60, onlySungBefore: true });
    expect(result.songs).toHaveLength(5);
    expect(result.note).toContain("could not be read");
  });
});

describe("similarMatches", () => {
  it("leaves out the song's own copies", () => {
    const result = similarOf(found("his eye is on the sparrow"), [hit(SPARROW_COPY, 0.99), hit(SWEET, 0.5)], LIBRARY, data());
    expect(result.songs.map((song) => song.title)).toEqual(["Sweet By and By"]);
  });

  it("says when the song has no lyrics, or has not been embedded yet", () => {
    expect(similarOf(found("I Love You, Lord"), null, LIBRARY, data())).toMatchObject({ lyricsIndexed: false });
    expect(similarOf(found("beulah land"), null, LIBRARY, data()).note).toContain("not been embedded");
  });
});
