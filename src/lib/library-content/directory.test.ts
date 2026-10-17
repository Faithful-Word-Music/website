import { describe, expect, it } from "vitest";

import { foldCopies, isSameSong, resolveLibrarySong, type DirectorySong } from "./directory";

const HYMNAL = "Soul-Stirring Songs and Hymns 1989";
const title = "All Hail the Power of Jesus' Name";
const entry = (songId: string, hymnNumber: string | null, collection = HYMNAL): DirectorySong => ({
  songId, title, titleKey: "all hail the power of jesus name", collection, hymnNumber, status: "indexed",
});
const first = entry("SSSH1989-167", "167");
const second = entry("SSSH1989-168", "168");

describe("lyric directory arrangement identity", () => {
  it("keeps distinct Song IDs addressable even when their titles and collections match", () => {
    expect(foldCopies([first, second, { ...first }], HYMNAL).map(({ song }) => song.songId)).toEqual(["SSSH1989-167", "SSSH1989-168"]);
    expect(resolveLibrarySong([first, second], "all hail", HYMNAL)).toMatchObject({ match: null, candidates: [{ song: first }, { song: second }] });
    expect(resolveLibrarySong([first, second], title, HYMNAL).match).toBeNull();
  });

  it("resolves ordinary hymn numbers and full Song IDs to the correct arrangement", () => {
    expect(resolveLibrarySong([first, second], "168", HYMNAL).match?.song.songId).toBe("SSSH1989-168");
    expect(resolveLibrarySong([first, second], "#0167", HYMNAL).match?.song.songId).toBe("SSSH1989-167");
    expect(resolveLibrarySong([first, second], "sssh1989-168", HYMNAL).match?.song.songId).toBe("SSSH1989-168");
    expect(resolveLibrarySong([first, second], "all-hail-the-power-of-jesus-name-sssh1989-168", HYMNAL).match?.song.songId).toBe("SSSH1989-168");
  });

  it("does not infer a cross-collection association from a shared title or number", () => {
    const other = entry("REV-167", "167", "Revival Hymns");
    expect(foldCopies([first, other], HYMNAL)).toHaveLength(2);
    expect(isSameSong(other, { id: "SSSH1989-167", songId: "SSSH1989-167", title, number: "167", collection: HYMNAL }, HYMNAL)).toBe(false);
    expect(isSameSong(second, { id: "SSSH1989-167", songId: "SSSH1989-167", title, number: "168", collection: HYMNAL }, HYMNAL)).toBe(false);
  });
});
