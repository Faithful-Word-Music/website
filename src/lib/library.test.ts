import { describe, expect, it } from "vitest";

import { buildLibrary, libraryLetter } from "@/lib/library";
import type { SongRecord } from "@/types/song-list";

function record(title: string, number: string | null = null): SongRecord {
  return { id: title.toLowerCase(), title, number, plays: [] };
}

describe("buildLibrary", () => {
  it("lists sung and scheduled-only songs once each, A-Z ignoring punctuation", () => {
    const library = buildLibrary(
      [record("Victory in Jesus", "82"), record("'Tis So Sweet", "121")],
      [
        { title: "Victory In Jesus!", number: "82" },
        { title: "Amazing Grace", number: "233" },
      ],
    );

    expect(library).toEqual([
      { slug: "amazing-grace", title: "Amazing Grace", number: "233", sheetMusic: false },
      { slug: "tis-so-sweet", title: "'Tis So Sweet", number: "121", sheetMusic: false },
      { slug: "victory-in-jesus", title: "Victory in Jesus", number: "82", sheetMusic: false },
    ]);
  });

  it("fills a missing number from a scheduled listing, as the song page does", () => {
    expect(buildLibrary([record("Holy, Holy, Holy")], [{ title: "Holy Holy Holy", number: "1" }])).toEqual([
      { slug: "holy-holy-holy", title: "Holy, Holy, Holy", number: "1", sheetMusic: false },
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
