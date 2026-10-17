import { songUrlSlug } from "./song-identity";
import { describe, expect, it } from "vitest";

import { buildLibrary, libraryLetter } from "@/lib/library";
import type { SongRecord } from "@/types/song-list";

function record(title: string, number: string | null = null): SongRecord {
  return { id: title.toLowerCase(), title, number, plays: [] };
}

describe("buildLibrary", () => {
  it("lists every indexed arrangement even before its first service, and never merges catalog UUIDs by title", () => {
    const entries = [167, 168].map((n) => ({ id: `SSSH1989-${n}`, title: "All Hail", number: `${n}`, collection: "Hymnal" }));
    const result = buildLibrary([], [{ songId: "catalog-one", title: "All Hail", number: null }], () => false, entries);
    expect(result).toHaveLength(3);
    expect(result.map((song) => song.slug)).toContain("all-hail-sssh1989-168");
    expect(result.map((song) => song.slug)).toContain("all-hail-sssh1989-167");
  });
  it("lists sung and scheduled-only songs once each, A-Z ignoring punctuation", () => {
    const library = buildLibrary(
      [record("Victory in Jesus", "82"), record("'Tis So Sweet", "121")],
      [
        { title: "Victory In Jesus!", number: "82" },
        { title: "Amazing Grace", number: "233" },
      ],
    );

    expect(library).toMatchObject([
      { slug: songUrlSlug({ title: "Amazing Grace", number: "233" }), title: "Amazing Grace", number: "233", sheetMusic: false },
      { slug: songUrlSlug({ title: "'Tis So Sweet", number: "121" }), title: "'Tis So Sweet", number: "121", sheetMusic: false },
      { slug: songUrlSlug({ title: "Victory in Jesus", number: "82" }), title: "Victory in Jesus", number: "82", sheetMusic: false },
    ]);
  });

  it("fills a missing number from a scheduled listing, as the song page does", () => {
    expect(buildLibrary([record("Holy, Holy, Holy")], [{ title: "Holy Holy Holy", number: "1" }])).toMatchObject([
      { slug: songUrlSlug({ title: "Holy, Holy, Holy", number: "1" }), title: "Holy, Holy, Holy", number: "1", sheetMusic: false },
    ]);
  });
});

describe("libraryLetter", () => {
  it("files by the first letter, skipping punctuation", () => {
    expect(libraryLetter("'Tis So Sweet")).toBe("T");
    expect(libraryLetter("amazing grace")).toBe("A");
    expect(libraryLetter("1 Corinthians 13")).toBe("#");
  });
});
