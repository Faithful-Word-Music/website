import { describe, expect, it } from "vitest";

import { isSongPage, songBackTarget } from "@/lib/song-origin";

describe("isSongPage", () => {
  it("matches only a single song's page", () => {
    expect(isSongPage("/song-list/archive/amazing-grace")).toBe(true);
    expect(isSongPage("/song-list/archive")).toBe(false);
    expect(isSongPage("/song-list")).toBe(false);
    expect(isSongPage("/song-list/year/2026")).toBe(false);
  });
});

describe("songBackTarget", () => {
  it("goes back to the song list", () => {
    expect(songBackTarget("/song-list")).toEqual({ href: "/song-list", label: "Back to the song list" });
  });

  it("goes back to a year page, named by its year", () => {
    expect(songBackTarget("/song-list/year/2026")).toEqual({
      href: "/song-list/year/2026",
      label: "Back to 2026 in song",
    });
  });

  it("goes back to the archive, keeping its search", () => {
    expect(songBackTarget("/song-list/archive?q=grace")).toEqual({
      href: "/song-list/archive?q=grace",
      label: "Back to the archive",
    });
  });

  it("falls back to the song list when the origin is unknown or elsewhere", () => {
    const songList = { href: "/song-list", label: "Back to the song list" };
    expect(songBackTarget(null)).toEqual(songList);
    expect(songBackTarget("/contact")).toEqual(songList);
    expect(songBackTarget("/")).toEqual(songList);
  });
});
