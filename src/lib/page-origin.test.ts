import { describe, expect, it } from "vitest";

import { backLabel, backTarget, findOrigin, isSongPage, recordVisit } from "@/lib/page-origin";

/** The history after visiting each page in turn. */
const visit = (...pages: string[]) => pages.reduce<string[]>((history, page) => recordVisit(history, page), []);

describe("isSongPage", () => {
  it("matches only a single song's page", () => {
    expect(isSongPage("/library/songs/amazing-grace")).toBe(true);
    expect(isSongPage("/library")).toBe(false);
    expect(isSongPage("/song-list/archive")).toBe(false);
  });
});

describe("recordVisit", () => {
  it("adds each new page", () => {
    expect(visit("/dashboard", "/library/songs/a")).toEqual(["/dashboard", "/library/songs/a"]);
  });

  it("replaces the page when only its query changes", () => {
    expect(visit("/song-list/archive", "/song-list/archive?q=grace")).toEqual(["/song-list/archive?q=grace"]);
  });

  it("steps back when the visitor returns to the page before", () => {
    expect(visit("/dashboard", "/song-list/archive", "/song-list/year/2026", "/song-list/archive")).toEqual([
      "/dashboard",
      "/song-list/archive",
    ]);
  });

  it("stays short", () => {
    const pages = Array.from({ length: 50 }, (_, index) => `/library/songs/song-${index}`);
    expect(visit(...pages)).toHaveLength(30);
  });
});

describe("findOrigin", () => {
  it("leads from a song back to the Dashboard it was opened from", () => {
    expect(findOrigin(visit("/dashboard", "/library/songs/a"), "/library/songs/a")).toBe("/dashboard");
  });

  it("works before the current page has been recorded", () => {
    expect(findOrigin(visit("/dashboard"), "/library/songs/a")).toBe("/dashboard");
  });

  it("keeps the origin's query, e.g. an archive search", () => {
    expect(findOrigin(visit("/song-list/archive?q=grace", "/library/songs/a"), "/library/songs/a")).toBe(
      "/song-list/archive?q=grace",
    );
  });

  it("passes over other songs for a song page, back to where the visitor started", () => {
    const history = visit("/dashboard", "/library/songs/a", "/library/songs/b");
    expect(findOrigin(history, "/library/songs/b", { skipSongPages: true })).toBe("/dashboard");
    expect(findOrigin(history, "/library/songs/b")).toBe("/library/songs/a");
  });

  it("after stepping back, the page leads to its own origin - not round in a loop", () => {
    const history = visit("/dashboard", "/song-list/archive", "/song-list/year/2026", "/song-list/archive");
    expect(findOrigin(history, "/song-list/archive")).toBe("/dashboard");
  });

  it("is null for a page opened straight from a link", () => {
    expect(findOrigin(visit("/library/songs/a"), "/library/songs/a")).toBeNull();
    expect(findOrigin([], "/library/songs/a")).toBeNull();
  });
});

describe("backTarget", () => {
  it("names the page it leads to", () => {
    expect(backTarget("/dashboard", "/song-list")).toEqual({ href: "/dashboard", label: "Back to Dashboard" });
    expect(backTarget("/song-list/year/2026", "/song-list")).toEqual({
      href: "/song-list/year/2026",
      label: "Back to 2026 in song",
    });
    expect(backTarget("/admin/requests?status=pending", "/admin/requests").label).toBe("Back to requests");
  });

  it("uses the page's fallback when there is no origin", () => {
    expect(backTarget(null, "/song-list")).toEqual({ href: "/song-list", label: "Back to the song list" });
  });

  it("says just Back for a page without a name", () => {
    expect(backLabel("/request-access")).toBe("Back");
  });
});
