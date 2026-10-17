import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config/site";
import type { DirectorySong } from "@/lib/library-content/directory";
import type { Song } from "@/types/song-list";

import { checkSongForService, findSongs, listServices, resolveSong, songFacts, songUses, upcomingServices, yearSummary, type ConductorData } from "./facts";
import { describePageContext, normalizePageContext, pageContextFor } from "./context";
import { findLibrarySong, historyLookup, lyricMatches, similarMatches, themeMatches } from "./lyrics";

const HYMNAL = siteConfig.sheetMusic.hymnalCollection;
const title = "All Hail the Power of Jesus' Name";
const entries = ["167", "168"].map((number) => ({ id: `SSSH1989-${number}`, title, number, collection: HYMNAL }));
const library: DirectorySong[] = entries.map((entry) => ({ songId: entry.id, title, titleKey: "all hail the power of jesus name", hymnNumber: entry.number, collection: HYMNAL, status: "indexed" }));
const song = (number: string, explicit = true): Song => ({ ...(explicit ? { songId: `SSSH1989-${number}` } : {}), title, number, key: number === "167" ? "G" : "Ab" });
const service = (date: string, song: Song) => ({ date, slot: "AM" as const, startsAt: `${date}T10:30:00-07:00`, songs: [song] });
const data: ConductorData = {
  now: Date.parse("2026-10-16T12:00:00-07:00"), today: "2026-10-16",
  past: [service("2026-09-06", song("167", false)), service("2026-10-04", song("168", false))],
  upcoming: [{ ...service("2026-10-18", song("168")), status: "published", emptyPlaces: 0 }],
  catalog: [], identities: entries, draftsIncluded: false, historyAvailable: true,
};

describe("Conductor arrangement identity", () => {
  it("offers both same-title arrangements, and resolves hymn numbers and complete Song IDs", () => {
    expect(resolveSong(data, title).match).toBeNull();
    expect(findSongs(data, "all hail").songs.map((item) => item.number)).toEqual(["167", "168"]);
    expect(resolveSong(data, "167").match?.id).toBe("SSSH1989-167");
    expect(resolveSong(data, "sssh1989-168").match?.id).toBe("SSSH1989-168");
    expect(resolveSong(data, "all-hail-the-power-of-jesus-name-sssh1989-168").match?.id).toBe("SSSH1989-168");
  });

  it("keeps history, keys and upcoming services independent", () => {
    expect(songFacts(data, "167")).toMatchObject({ found: true, song: { songId: "SSSH1989-167" }, timesSung: 1, keysUsed: [{ key: "G", times: 1 }], plannedFor: [] });
    expect(songFacts(data, "168")).toMatchObject({ found: true, song: { songId: "SSSH1989-168" }, timesSung: 1, keysUsed: [{ key: "Ab", times: 1 }], plannedFor: [{ date: "2026-10-18", key: "Ab" }] });
    expect(songUses(data, "168", "2026-01-01", "2026-12-31")).toMatchObject({ timesSung: 1 });
    expect(listServices(data, { from: "2026-01-01", to: "2026-12-31", song: "167" })).toMatchObject({ servicesMatching: 1 });
    expect(upcomingServices(data, { song: "167" })).toMatchObject({ services: [] });
  });

  it("gives lyric results distinct identities and arrangement-specific history", () => {
    const history = historyLookup(data);
    expect(history(library[0])).toMatchObject({ timesSung: 1, lastSung: "2026-09-06" });
    expect(history(library[0])?.plannedFor).toBeUndefined();
    expect(history(library[1])?.plannedFor).toHaveLength(1);
    expect(findLibrarySong(library, title).found).toBe(false);
    const hits = library.map((song) => ({ song, section: null, score: 0.9 }));
    const lyrics = lyricMatches({ mode: "phrase", hits }, "all hail", library, data);
    expect("songs" in lyrics && lyrics.songs.map((item) => item.songId)).toEqual(["SSSH1989-167", "SSSH1989-168"]);
    expect(themeMatches(hits, "praise", library, data).songs.map((item) => item.songId)).toEqual(["SSSH1989-167", "SSSH1989-168"]);
    const similar = similarMatches({ song: library[0], alsoIn: [] }, hits, library, data);
    expect("songs" in similar && similar.songs.map((item) => item.songId)).toEqual(["SSSH1989-168"]);
  });

  it("leaves title-only historical performances unresolved when two arrangements fit", () => {
    const ambiguous = { ...data, past: [service("2026-10-04", { title, number: null, key: "G" })] };
    expect(songFacts(ambiguous, "SSSH1989-167")).toMatchObject({ timesSung: 0 });
    expect(songFacts(ambiguous, "SSSH1989-168")).toMatchObject({ timesSung: 0 });
    expect(checkSongForService(ambiguous, "SSSH1989-167", "2026-10-18", "AM")).toMatchObject({ found: true, song: { songId: "SSSH1989-167" }, lastSungBeforeIt: null });
  });

  it("keeps arrangement identities in the year's usage ranking", () => {
    const summary = yearSummary(data, 2026);
    expect(summary.found && summary.mostUsedSongs.map((item) => item.songId).sort()).toEqual(["SSSH1989-167", "SSSH1989-168"]);
  });

  it("preserves canonical page addresses and the identities of unsaved planner songs", () => {
    const slug = "all-hail-the-power-of-jesus-name-sssh1989-168";
    expect(describePageContext({ area: "library", song: slug })).toContain(`search for "${slug}"`);
    const plan = normalizePageContext({ area: "service-planner", service: "2026-10-18-am", plan: { slots: [song("168")], unsaved: true } });
    expect(plan?.plan?.slots[0]).toMatchObject({ songId: "SSSH1989-168" });
    expect(describePageContext(plan)).toContain("SSSH1989-168");
  });

  it("accepts a long title followed by a catalog identity in page context", () => {
    const slug = `${"a-long-song-title-".repeat(7)}catalog-00000000-0000-4000-8000-000000000001`;
    expect(pageContextFor(`/library/songs/${slug}`)).toEqual({ area: "library", song: slug });
    expect(normalizePageContext({ area: "library", song: slug })).toEqual({ area: "library", song: slug });
  });

  it("preserves long unresolved IDs in planner context and song page addresses", () => {
    const songId = `legacy-t-${"ab".repeat(1000)}`;
    const slug = `a-long-song-title-${songId}`;
    const plan = normalizePageContext({ area: "service-planner", service: "2026-10-18-am", plan: { slots: [{ songId, title: "Unindexed Song", number: null, key: "G" }], unsaved: true } });
    expect(plan?.plan?.slots[0]?.songId).toBe(songId);
    expect(pageContextFor(`/library/songs/${slug}`)).toEqual({ area: "library", song: slug });
    expect(normalizePageContext({ area: "library", song: slug })).toEqual({ area: "library", song: slug });
  });

  it("preserves explicit catalog associations without letting alias rows create a second song", () => {
    const associated = {
      ...data, past: [], identities: [{ ...entries[1], aliases: ["catalog-old"] }],
      upcoming: [{ ...service("2026-10-18", { ...song("168"), songId: "catalog-old" }), status: "published" as const, emptyPlaces: 0 }],
    };
    expect(songFacts(associated, "SSSH1989-168")).toMatchObject({ plannedFor: [{ date: "2026-10-18" }] });
    expect(findSongs(associated, title).songs).toHaveLength(1);
    expect(resolveSong(associated, "catalog-old").match?.id).toBe("SSSH1989-168");
    expect(resolveSong(associated, "an-old-title-catalog-old").match?.id).toBe("SSSH1989-168");
  });
});
