import { describe, expect, it } from "vitest";

import type { FavoriteEntry, FavoriteSongInfo, FavoriteSort } from "@/lib/favorites-api";

import {
  buildFavoritesPage,
  decodeFavoritesCursor,
  encodeFavoritesCursor,
  logicalFavorites,
  planMembership,
} from "./favorites";
import { buildPersonalDirectory, type PersonalDirectory } from "./identity";

const info = (songId: string, title: string, number: string | null, collection: string | null): FavoriteSongInfo => ({
  songId, title, number, collection, href: `/library/songs/${songId.toLowerCase()}`,
});
const SONGS = [
  info("SSSH-10", "Amazing Grace", "10", "SSSH"),
  info("SSSH-9", "be thou my vision", "9", "SSSH"),
  info("SSSH-9A", "Be Thou My Vision", "9a", "SSSH"),
  info("BTH-200", "Crown Him", "200", "BTH"),
  info("catalog-1", "Unnumbered Song", null, null),
];
const songs = new Map(SONGS.map((song) => [song.songId, song]));
const directory = buildPersonalDirectory(
  SONGS.filter((song) => !song.songId.startsWith("catalog")).map((song) => song.songId),
  [{ songId: "catalog-1", catalogId: "catalog-1" }, { songId: "SSSH-10", catalogId: "catalog-old" }],
);
const down: PersonalDirectory = { status: "unavailable" };
const at = (n: number) => `2026-01-01T00:00:00.${String(n).padStart(6, "0")}Z`;
const rows = (...ids: string[]) => ids.map((songId, index) => ({ songId, createdAt: at(index + 1) }));
const page = (input: ReturnType<typeof rows>, sort: FavoriteSort = "recent", query = "", cursor: string | null = null, limit = 50, dir = directory) =>
  buildFavoritesPage(input, dir, songs, { sort, query, cursor, limit });
const keys = (result: ReturnType<typeof page>) => (result.status === "ok" ? result.page.items.map((item) => item.key) : result.status);

describe("logical favorites", () => {
  it("collapses spellings of one song, keeping the earliest date", () => {
    const entries = logicalFavorites(
      [{ songId: "catalog-old", createdAt: at(5) }, { songId: "SSSH-10", createdAt: at(2) }, { songId: "ssSh-10", createdAt: at(9) }],
      directory, songs,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "song", key: "SSSH-10", addedAt: at(2) });
  });

  it("keeps missing and ambiguous rows under their exact key, with no guessed details", () => {
    const clash: PersonalDirectory = { status: "ok", entries: [{ id: "A-1", aliases: ["both"] }, { id: "B-1", aliases: ["both"] }] };
    const entries = logicalFavorites(rows("GONE-1", "both"), clash, songs);
    expect(entries).toEqual([
      { kind: "unavailable", key: "GONE-1", addedAt: at(1) },
      { kind: "ambiguous", key: "both", addedAt: at(2) },
    ]);
  });

  it("marks every row unknown in an outage, and removes none", () => {
    expect(logicalFavorites(rows("SSSH-10", "GONE-1"), down, songs).map((entry) => entry.kind)).toEqual(["unknown", "unknown"]);
  });

  it("exposes only the allowed song fields", () => {
    const withExtra = new Map([["SSSH-10", { ...songs.get("SSSH-10")! }]]);
    const [entry] = logicalFavorites(rows("SSSH-10"), directory, withExtra);
    expect(Object.keys(entry).sort()).toEqual(["addedAt", "collection", "href", "key", "kind", "number", "songId", "title"]);
  });
});

describe("sorting", () => {
  const all = rows("SSSH-10", "SSSH-9", "SSSH-9A", "BTH-200", "catalog-1", "GONE-1");

  it("defaults to newest first, with unavailable entries in date order", () => {
    expect(keys(page(all))).toEqual(["GONE-1", "catalog-1", "BTH-200", "SSSH-9A", "SSSH-9", "SSSH-10"]);
  });

  it("breaks equal timestamps by identity", () => {
    const tied = ["SSSH-9", "BTH-200", "SSSH-10"].map((songId) => ({ songId, createdAt: at(1) }));
    expect(keys(page(tied))).toEqual(["BTH-200", "SSSH-10", "SSSH-9"]);
  });

  it("sorts A-Z ignoring case, keeps arrangements apart, and puts unavailable last", () => {
    expect(keys(page(all, "title"))).toEqual(["SSSH-10", "SSSH-9", "SSSH-9A", "BTH-200", "catalog-1", "GONE-1"]);
  });

  it("sorts by collection then natural number, unnumbered and unavailable last", () => {
    expect(keys(page(all, "number"))).toEqual(["BTH-200", "SSSH-9", "SSSH-9A", "SSSH-10", "catalog-1", "GONE-1"]);
  });

  it("orders non-numeric numbers after numeric ones in a collection", () => {
    const local = new Map([["X-1", info("X-1", "One", "A", "C")], ["X-2", info("X-2", "Two", "2", "C")]]);
    const dir = buildPersonalDirectory(["X-1", "X-2"], []);
    const result = buildFavoritesPage(rows("X-1", "X-2"), dir, local, { sort: "number", query: "", cursor: null, limit: 10 });
    expect(keys(result)).toEqual(["X-2", "X-1"]);
  });
});

describe("search", () => {
  const all = rows("SSSH-10", "SSSH-9", "BTH-200", "catalog-1", "GONE-1");

  it("matches title, number and collection", () => {
    expect(keys(page(all, "recent", "amazing"))).toEqual(["SSSH-10"]);
    expect(keys(page(all, "recent", "#200"))).toEqual(["BTH-200"]);
    expect(keys(page(all, "title", "bth"))).toEqual(["BTH-200"]);
  });

  it("covers entries beyond the first page", () => {
    const many = rows(...Array.from({ length: 120 }, (_, i) => `GONE-${i}`), "SSSH-10");
    const oldest = [{ songId: "SSSH-10", createdAt: at(0) }, ...many.slice(0, 120)];
    const result = page(oldest, "recent", "amazing", null, 10);
    expect(keys(result)).toEqual(["SSSH-10"]);
  });

  it("reports matched and total separately", () => {
    const result = page(all, "recent", "amazing");
    expect(result.status === "ok" && [result.page.matched, result.page.total]).toEqual([1, 5]);
  });

  it("refuses to search during an outage rather than show a false empty result", () => {
    expect(page(all, "recent", "amazing", null, 50, down)).toEqual({ status: "directory-unavailable" });
  });
});

describe("outage ordering", () => {
  it("falls back to Recently Added and says so", () => {
    const result = page(rows("SSSH-10", "SSSH-9"), "title", "", null, 50, down);
    expect(result.status === "ok" && [result.page.sort, result.page.directory]).toEqual(["recent", "unavailable"]);
  });
});

describe("pagination", () => {
  const many = Array.from({ length: 237 }, (_, i) => ({ songId: `GONE-${String(i).padStart(3, "0")}`, createdAt: at(Math.floor(i / 10)) }));

  it.each(["recent", "title", "number"] as const)("walks %s with ties, without repeats or gaps", (sort) => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const result: ReturnType<typeof page> = page(many, sort, "", cursor, 17);
      if (result.status !== "ok") throw new Error(result.status);
      seen.push(...result.page.items.map((item: FavoriteEntry) => item.key));
      cursor = result.page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(237);
    expect(new Set(seen).size).toBe(237);
  });

  it("does not repeat or skip when the last-seen entry is removed between pages", () => {
    const first = page(many, "recent", "", null, 10);
    if (first.status !== "ok") throw new Error(first.status);
    const removed = first.page.items[9].key;
    const second = page(many.filter((row) => row.songId !== removed), "recent", "", first.page.nextCursor, 10);
    if (second.status !== "ok") throw new Error(second.status);
    const whole = page(many, "recent", "", null, 20);
    if (whole.status !== "ok") throw new Error(whole.status);
    expect(second.page.items.map((item) => item.key)).toEqual(whole.page.items.slice(10, 20).map((item) => item.key));
  });

  it("keeps microsecond order across a page boundary", () => {
    const close = [{ songId: "GONE-A", createdAt: "2026-01-01T00:00:00.123457Z" }, { songId: "GONE-B", createdAt: "2026-01-01T00:00:00.123456Z" }];
    const first = page(close, "recent", "", null, 1);
    if (first.status !== "ok") throw new Error(first.status);
    expect(first.page.items[0].key).toBe("GONE-A");
    expect(keys(page(close, "recent", "", first.page.nextCursor, 1))).toEqual(["GONE-B"]);
  });

  it("returns an empty last page past the end", () => {
    const cursor = encodeFavoritesCursor({ sort: "recent", query: "", key: ["2000-01-01T00:00:00.000000Z", "z"] });
    expect(keys(page(many, "recent", "", cursor))).toEqual([]);
  });

  it("rejects malformed cursors", () => {
    for (const bad of ["nonsense", "e30", Buffer.from('{"v":2}').toString("base64url"), Buffer.from('{"v":1,"s":"recent","q":"","k":[1,2]}').toString("base64url"), Buffer.from('{"v":1,"s":"title","q":"","k":["a"]}').toString("base64url")]) {
      expect(decodeFavoritesCursor(bad)).toBeNull();
      expect(page(many, "recent", "", bad)).toEqual({ status: "invalid-cursor" });
    }
  });

  it("binds a cursor to its sort and search", () => {
    const first = page(many, "recent", "", null, 10);
    if (first.status !== "ok") throw new Error(first.status);
    expect(page(many, "title", "", first.page.nextCursor)).toEqual({ status: "invalid-cursor" });
    expect(page(many, "recent", "other", first.page.nextCursor)).toEqual({ status: "invalid-cursor" });
  });

  it("handles empty, single and exact-page collections", () => {
    expect(keys(page([]))).toEqual([]);
    expect(keys(page(rows("SSSH-10")))).toEqual(["SSSH-10"]);
    const exact = page(many.slice(0, 50), "recent", "", null, 50);
    expect(exact.status === "ok" && exact.page.nextCursor).toBeNull();
  });
});

describe("batched membership", () => {
  it("deduplicates and looks up every safe spelling once", () => {
    const plan = planMembership(["SSSH-10", "SSSH-10", "catalog-old", "BTH-200"], directory);
    expect(plan.folded.sort()).toEqual(["bth-200", "catalog-old", "sssh-10"]);
  });

  it("reports a favorite stored under an alias or another case", () => {
    const plan = planMembership(["SSSH-10", "catalog-old", "BTH-200"], directory);
    expect(plan.answer(new Set(["catalog-old"]))).toEqual({
      "SSSH-10": { state: "favorited", songId: "SSSH-10" },
      "catalog-old": { state: "favorited", songId: "SSSH-10" },
      "BTH-200": { state: "not-favorited", songId: "BTH-200" },
    });
  });

  it("never turns an unsupported or unreadable identity into a confirmed answer", () => {
    const plan = planMembership(["legacy-t-abc", "nope"], directory);
    expect(plan.folded).toEqual([]);
    expect(plan.answer(new Set())).toEqual({ "legacy-t-abc": { state: "unsupported" }, nope: { state: "unsupported" } });
    expect(planMembership(["SSSH-10"], down).answer(new Set())).toEqual({ "SSSH-10": { state: "unavailable" } });
  });

  it("does not let an ambiguous alias make another song look favorited", () => {
    const clash: PersonalDirectory = { status: "ok", entries: [{ id: "A-1", aliases: ["both"] }, { id: "B-1", aliases: ["both"] }] };
    const plan = planMembership(["A-1", "B-1"], clash);
    expect(plan.folded.sort()).toEqual(["a-1", "b-1"]);
    expect(plan.answer(new Set(["both"]))).toEqual({
      "A-1": { state: "not-favorited", songId: "A-1" },
      "B-1": { state: "not-favorited", songId: "B-1" },
    });
  });
});

describe("collection sizes", () => {
  const directoryFor = (size: number) => buildPersonalDirectory(Array.from({ length: size }, (_, i) => `S-${i}`), []);
  const songsFor = (size: number) => new Map(Array.from({ length: size }, (_, i) => [`S-${i}`, info(`S-${i}`, `Title ${size - i}`, String(i), i % 2 ? "A" : "B")]));

  it.each([0, 1, 50, 500, 5000])("sorts, searches and pages %i favorites", (size) => {
    const stored = Array.from({ length: size }, (_, i) => ({ songId: `S-${i}`, createdAt: at(i % 999_999) }));
    const dir = directoryFor(size);
    const map = songsFor(size);
    for (const sort of ["recent", "title", "number"] as const) {
      const result = buildFavoritesPage(stored, dir, map, { sort, query: "", cursor: null, limit: 50 });
      expect(result.status === "ok" && result.page.total).toBe(size);
      expect(result.status === "ok" && result.page.items.length).toBe(Math.min(size, 50));
    }
    const searched = buildFavoritesPage(stored, dir, map, { sort: "title", query: "title 1", cursor: null, limit: 50 });
    expect(searched.status).toBe("ok");
  });
});
