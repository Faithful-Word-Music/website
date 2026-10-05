import { describe, expect, it } from "vitest";

import type { SongVersion } from "@/lib/sheet-music";

import { foldCopies, isSameSong, preferredCopy, resolveLibrarySong, type DirectorySong } from "./directory";
import { EMPTY_REPORT, lyricsSource, mergeReports, songWork, sourceUnchanged, type IndexedSong, type SongSource } from "./plan";

const HYMNAL = "Soul-Stirring Songs and Hymns 1989";

const version = (label: string, number: string, files: SongVersion["files"]): SongVersion => ({
  typeId: 1,
  label,
  version: number,
  keys: null,
  capoFret: null,
  files,
});
const file = (format: "pdf" | "musescore", driveFileId: string, md5?: string) => ({
  format,
  slug: `${driveFileId}.${format}`,
  driveFileId,
  modifiedTime: "2026-09-01T10:00:00.000Z",
  ...(md5 ? { md5 } : {}),
});

describe("lyricsSource", () => {
  it("is the Standard MuseScore file, lowest version first - and nothing else", () => {
    const versions = [
      version("Standard", "1", [file("pdf", "standard-pdf")]),
      version("Standard", "2", [file("pdf", "standard-2-pdf"), file("musescore", "standard-2", "abc")]),
      version("Standard (Chords)", "1", [file("musescore", "chords")]),
      version("Clarinet (Bb)", "1", [file("musescore", "clarinet")]),
    ];
    expect(lyricsSource({ versions }, "Standard")).toEqual({ driveFileId: "standard-2", modifiedTime: "2026-09-01T10:00:00.000Z", md5: "abc" });
    expect(lyricsSource({ versions }, "standard ")?.driveFileId).toBe("standard-2");
  });

  it("is nothing for a song with only chords, capo or instrument files", () => {
    const versions = [version("Standard", "1", [file("pdf", "pdf")]), version("Capo (Chords)", "1", [file("musescore", "capo")])];
    expect(lyricsSource({ versions }, "Standard")).toBeNull();
  });
});

describe("songWork", () => {
  const song = { title: "Amazing Grace", collection: HYMNAL, hymnNumber: "107" };
  const source: SongSource = { driveFileId: "file-1", modifiedTime: "2026-09-01T10:00:00.000Z", md5: "aaa" };
  const indexed = (overrides: Partial<IndexedSong> = {}): IndexedSong => ({
    songId: "SSSH1989-107",
    ...song,
    status: "indexed",
    sourceFileId: "file-1",
    sourceModifiedTime: "2026-09-01T10:00:00.000Z",
    sourceMd5: "aaa",
    parserVersion: 1,
    ...overrides,
  });

  it("reads a song it has never read, and one whose file has changed", () => {
    expect(songWork(song, source, undefined, 1)).toBe("read");
    expect(songWork(song, { ...source, md5: "bbb" }, indexed(), 1)).toBe("read");
    expect(songWork(song, source, indexed({ status: "no_source", sourceFileId: null, sourceMd5: null }), 1)).toBe("read");
  });

  it("opens nothing when the file is the one already read", () => {
    expect(songWork(song, source, indexed(), 1)).toBe("unchanged");
    expect(songWork(song, source, indexed({ status: "no_lyrics" }), 1)).toBe("unchanged");
    // Saved again without a change: a new date, the same bytes.
    expect(songWork(song, { ...source, modifiedTime: "2026-10-01T10:00:00.000Z" }, indexed(), 1)).toBe("touch");
    // The same file somewhere else, or the song renumbered.
    expect(songWork(song, { ...source, driveFileId: "file-2" }, indexed(), 1)).toBe("touch");
    expect(songWork({ ...song, hymnNumber: "108" }, source, indexed(), 1)).toBe("touch");
  });

  it("falls back to the file and its date when Drive gave no checksum", () => {
    const plain = { ...source, md5: null };
    expect(sourceUnchanged(plain, indexed({ sourceMd5: null }))).toBe(true);
    expect(songWork(song, plain, indexed({ sourceMd5: null }), 1)).toBe("unchanged");
    expect(songWork(song, { ...plain, modifiedTime: "2026-10-01T10:00:00.000Z" }, indexed({ sourceMd5: null }), 1)).toBe("read");
    expect(songWork(song, { ...plain, driveFileId: "file-2" }, indexed({ sourceMd5: null }), 1)).toBe("read");
  });

  it("reads everything again when the parser changes, or a title does", () => {
    expect(songWork(song, source, indexed(), 2)).toBe("read");
    expect(songWork({ ...song, title: "Amazing Grace!" }, source, indexed(), 1)).toBe("read");
  });

  it("tries a failed file again - once per refresh", () => {
    expect(songWork(song, source, indexed({ status: "failed" }), 1)).toBe("read");
    expect(songWork(song, source, indexed({ status: "failed" }), 1, false)).toBe("unchanged");
  });

  it("notes a song with no file once", () => {
    expect(songWork(song, null, undefined, 1)).toBe("no-source");
    expect(songWork(song, null, indexed(), 1)).toBe("no-source");
    expect(songWork(song, null, indexed({ status: "no_source" }), 1)).toBe("unchanged");
  });
});

describe("mergeReports", () => {
  it("adds up what the passes of one refresh did, and takes the last pass's word for how things stand", () => {
    const first = { ...EMPTY_REPORT, songs: 563, read: 280, added: 280, unchanged: 0, noSource: 75, songsRemaining: 208, embeddingsRemaining: 1500 };
    const second = { ...EMPTY_REPORT, songs: 563, read: 208, added: 200, updated: 3, unchanged: 280, noSource: 75, noLyrics: 4, failed: 1, embedded: 900, embeddingsRemaining: 600 };
    expect(mergeReports(first, second)).toEqual({
      songs: 563,
      read: 488,
      added: 480,
      updated: 3,
      unchanged: 0,
      noSource: 75,
      noLyrics: 4,
      failed: 1,
      removed: 0,
      embedded: 900,
      songsRemaining: 0,
      embeddingsRemaining: 600,
    });
  });
});

describe("the library's songs", () => {
  const song = (songId: string, title: string, collection: string | null, hymnNumber: string | null, status: DirectorySong["status"] = "indexed"): DirectorySong => ({
    songId,
    title,
    titleKey: title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    collection,
    hymnNumber,
    status,
  });
  const library = [
    song("SSSH1989-107", "Amazing Grace", HYMNAL, "107"),
    song("MH-203", "Amazing Grace", "Majesty Hymns", "203"),
    song("SSSH1989-022", "Are You Washed in the Blood?", HYMNAL, "022"),
    song("OS-014", "His Eye Is on the Sparrow", "Other Songs", null),
    song("SHR-198", "His Eye Is On The Sparrow", "Songs & Hymns of Revival", "198"),
    song("PS-023", "Psalm 23", "Psalms", null),
    song("PS-023-2", "Psalm 23 (Crimond)", "Psalms", null),
    song("BTH-015", "I Love You, Lord", "Bible Truth Hymns", "15", "no_lyrics"),
  ];

  it("folds a song printed in several books into one: the church's hymnal, then its own songs, then other hymnals", () => {
    const folded = foldCopies(library, HYMNAL);
    expect(folded).toHaveLength(6);
    expect(folded[0]).toEqual({ song: library[0], alsoIn: ["Majesty Hymns"] });
    expect(folded.find((entry) => entry.song.titleKey === "his eye is on the sparrow")).toEqual({ song: library[3], alsoIn: ["Songs & Hymns of Revival"] });
  });

  it("prefers a copy that has lyrics", () => {
    const copies = [song("SSSH1989-107", "Amazing Grace", HYMNAL, "107", "no_source"), song("MH-203", "Amazing Grace", "Majesty Hymns", "203")];
    expect(preferredCopy(copies, HYMNAL).songId).toBe("MH-203");
  });

  it("finds a song by title, part of a title, or its number in the church's hymnal", () => {
    expect(resolveLibrarySong(library, "amazing grace!", HYMNAL).match?.song.songId).toBe("SSSH1989-107");
    expect(resolveLibrarySong(library, "washed in the blood", HYMNAL).match?.song.songId).toBe("SSSH1989-022");
    expect(resolveLibrarySong(library, "#22", HYMNAL).match?.song.songId).toBe("SSSH1989-022");
    // 203 is Amazing Grace in another hymnal, not a number the song list uses.
    expect(resolveLibrarySong(library, "203", HYMNAL).match).toBeNull();
  });

  it("hands back the candidates rather than choosing between them", () => {
    const { match, candidates } = resolveLibrarySong(library, "psalm 2", HYMNAL);
    expect(match).toBeNull();
    expect(candidates.map((entry) => entry.song.title)).toEqual(["Psalm 23", "Psalm 23 (Crimond)"]);
    expect(resolveLibrarySong(library, "nothing like this", HYMNAL)).toEqual({ match: null, candidates: [] });
    expect(resolveLibrarySong(library, "   ", HYMNAL).candidates).toEqual([]);
  });

  it("ties a library song to a song of the song list by title, or by its hymnal number", () => {
    expect(isSameSong(library[0], { id: "amazing grace", number: "107" }, HYMNAL)).toBe(true);
    expect(isSameSong(library[2], { id: "are you washed", number: "22" }, HYMNAL)).toBe(true);
    expect(isSameSong(library[1], { id: "some other title", number: "203" }, HYMNAL)).toBe(false);
  });
});
