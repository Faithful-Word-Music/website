import { describe, expect, it } from "vitest";
import { identifySong, referenceEntries, resolveSong, sameSong, songIdentity, songsForSlug, songUrlSlug, type IdentityEntry } from "./song-identity";

const title = "All Hail the Power of Jesus' Name";
const book = "Soul-Stirring Songs & Hymns (1989)";
const songs: IdentityEntry[] = [
  { id: "SSSH1989-167", title, number: "167", collection: book },
  { id: "SSSH1989-168", title, number: "168", collection: book },
  { id: "OTHER-167", title, number: "167", collection: "Other" },
  { id: "PS-019-7-10", title: "Psalm 19:7–10", number: null, collection: "Psalms" },
];

describe("canonical song identity", () => {
  it("resolves collection and normalized number before title", () => {
    expect(resolveSong({ title, number: "0168" }, songs, book)?.id).toBe("SSSH1989-168");
    expect(resolveSong({ title, number: "167", collection: "Other" }, songs, book)?.id).toBe("OTHER-167");
  });
  it("never overrides an explicit identity, even when the index is unavailable", () => {
    const song = { title, number: "167", songId: "SSSH1989-168" };
    expect(resolveSong(song, songs, book)?.id).toBe("SSSH1989-168");
    expect(resolveSong(song, [], book)).toBeNull();
    expect(songIdentity(song, [], book)).toBe("SSSH1989-168");
    expect(resolveSong({ ...song, songId: "MISSING-168" }, songs, book)).toBeNull();
  });
  it("preserves ambiguous records without assigning them by title or key", () => {
    expect(resolveSong({ title }, songs, book)).toBeNull();
    expect(resolveSong({ title, number: "999" }, songs, book)).toBeNull();
    expect(songIdentity({ title, number: "167" }, [], book)).not.toBe(songIdentity({ title, number: "168" }, [], book));
  });
  it("uses unique punctuation-insensitive title matches for unnumbered songs", () => {
    expect(resolveSong({ title: "Psalm 19 7 10" }, songs, book)?.id).toBe("PS-019-7-10");
    expect(identifySong({ title: "Psalm 19 7 10" }, songs, book).songId).toBe("PS-019-7-10");
  });
  it("keeps catalog identities through title edits and different IDs separate", () => {
    const a = { title: "Old", songId: "catalog-0f1da0e1-6ac0-4da9-8d89-71f074b359c4" };
    expect(sameSong(a, { ...a, title: "New" })).toBe(true);
    expect(sameSong(a, { ...a, songId: "catalog-other" })).toBe(false);
    expect(sameSong({ title, songId: songs[0].id }, { title, songId: songs[1].id })).toBe(false);
  });
  it("uses explicit historical associations before creating unresolved number identities, independent of ordering", () => {
    const refs = [{ title, number: "167" }, { title, number: "167", songId: "SSSH1989-167" }];
    for (const ordered of [refs, [...refs].reverse()]) {
      const entries = referenceEntries(ordered, [], book);
      expect(resolveSong({ title, number: "167" }, entries, book)?.id).toBe("SSSH1989-167");
    }
  });
  it("does not turn a resolved unnumbered entry into a numbered alias from stale display data", () => {
    const entries = referenceEntries([{ title: "Psalm renamed", songId: "PS-019-7-10", number: "167" }], songs, book);
    expect(entries.find((entry) => entry.title === "Psalm renamed")).toMatchObject({ id: "PS-019-7-10", number: null, collection: "Psalms" });
  });
});

describe("identity URL suffixes", () => {
  it("uses readable canonical suffixes and resolves the entire ID", () => {
    const slug = songUrlSlug({ ...songs[1], songId: songs[1].id });
    expect(slug).toBe("all-hail-the-power-of-jesus-name-sssh1989-168");
    expect(songsForSlug(slug, songs).map((s) => s.id)).toEqual(["SSSH1989-168"]);
    expect(songsForSlug("renamed-2026-ps-019-7-10", songs).map((s) => s.id)).toEqual(["PS-019-7-10"]);
  });
  it("supports unique legacy links and exposes all ambiguous destinations", () => {
    expect(songsForSlug("psalm-19-7-10", songs).map((s) => s.id)).toEqual(["PS-019-7-10"]);
    expect(songsForSlug("all-hail-the-power-of-jesus-name", songs)).toHaveLength(3);
    expect(songsForSlug("all-hail-the-power-of-jesus-name-missing-168", songs)).toEqual([]);
    expect(songsForSlug(songUrlSlug({ title: "Psalm 19:7–10" }), songs).map((s) => s.id)).toEqual(["PS-019-7-10"]);
  });
});
