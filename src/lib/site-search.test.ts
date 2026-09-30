import { describe, expect, it } from "vitest";

import { MAX_SONGS, type SearchIndex, searchSite, serviceAnchor } from "@/lib/site-search";

const index: SearchIndex = {
  songs: [
    { slug: "amazing-grace", title: "Amazing Grace", number: "108", sheetMusic: true },
    { slug: "great-is-thy-faithfulness", title: "Great Is Thy Faithfulness", number: "441", sheetMusic: false },
    { slug: "how-great-thou-art", title: "How Great Thou Art", number: null, sheetMusic: false },
    { slug: "wonderful-grace-of-jesus", title: "Wonderful Grace of Jesus", number: "210", sheetMusic: false },
    { slug: "the-44th-hymn", title: "The Forty-Fourth", number: "44", sheetMusic: false },
  ],
  services: [
    {
      anchor: "2026-09-30-pm",
      heading: "Wednesday Evening · Sept 30 · 7:00 PM",
      dateLabel: "Wednesday, September 30, 2026",
      songs: [{ number: "210", title: "Wonderful Grace of Jesus" }],
    },
    {
      anchor: "2026-10-04-am",
      heading: "Sunday Morning · Oct 4 · 10:30 AM",
      dateLabel: "Sunday, October 4, 2026",
      songs: [{ number: "441", title: "Great Is Thy Faithfulness" }],
    },
  ],
  years: [2026, 2025],
  pdfs: [{ month: "October", href: "/song-list/pdf/october" }],
};

function labels(query: string, group: string) {
  return searchSite(index, query, false).groups.find((g) => g.group === group)?.entries.map((e) => e.label) ?? [];
}

describe("serviceAnchor", () => {
  it("is made from the date and time of day", () => {
    expect(serviceAnchor("2026-09-30", "PM")).toBe("2026-09-30-pm");
    expect(serviceAnchor("2026-09-30", null)).toBe("2026-09-30");
  });
});

describe("searchSite", () => {
  it("opens on the coming services, pages and actions, without songs", () => {
    const groups = searchSite(index, "", false).groups.map((g) => g.group);
    expect(groups).toEqual(["services", "pages", "actions"]);
    // Year recaps wait to be searched for.
    expect(labels("", "pages")).not.toContain("2026 in songs");
  });

  it("finds songs by title, starting matches first", () => {
    expect(labels("great", "songs")).toEqual(["Great Is Thy Faithfulness", "How Great Thou Art"]);
  });

  it("finds songs by hymn number, the exact number first", () => {
    expect(labels("44", "songs")).toEqual(["The Forty-Fourth", "Great Is Thy Faithfulness"]);
    expect(labels("#441", "songs")).toEqual(["Great Is Thy Faithfulness"]);
  });

  it("finds a service by a song in it, and by its date", () => {
    expect(labels("grace of jesus", "services")).toEqual(["Wednesday Evening · Sept 30 · 7:00 PM"]);
    expect(labels("oct 4", "services")).toEqual(["Sunday Morning · Oct 4 · 10:30 AM"]);
    expect(labels("october", "services")).toEqual(["Sunday Morning · Oct 4 · 10:30 AM"]);
  });

  it("finds pages and actions by their keywords", () => {
    expect(labels("archive", "pages")[0]).toBe("Song archive");
    expect(labels("2025", "pages")).toEqual(["2025 in songs"]);
    expect(labels("dark", "actions")).toEqual(["Switch to dark mode"]);
    expect(labels("pdf", "actions")).toEqual(["October song list as a PDF"]);
  });

  it("names the theme it would switch to", () => {
    const actions = searchSite(index, "theme", true).groups.find((g) => g.group === "actions");
    expect(actions?.entries.map((e) => e.label)).toEqual(["Switch to light mode"]);
  });

  it("shows a limited number of songs and counts the rest", () => {
    const many: SearchIndex = {
      ...index,
      songs: Array.from({ length: MAX_SONGS + 3 }, (_, i) => ({
        slug: `hymn-${i}`,
        title: `Hymn ${i}`,
        number: null,
        sheetMusic: false,
      })),
    };
    const results = searchSite(many, "hymn", false);
    expect(results.groups[0].entries).toHaveLength(MAX_SONGS);
    expect(results.moreSongs).toBe(3);
  });

  it("still finds pages before the index has loaded", () => {
    expect(searchSite(null, "contact", false).groups.map((g) => g.group)).toEqual(["pages", "actions"]);
  });
});
