import {
  FAVORITE_SORTS,
  type FavoriteEntry,
  type FavoriteSongInfo,
  type FavoriteSort,
  type FavoritesPage,
  type MembershipState,
} from "@/lib/favorites-api";
import { matchesSong, songKey } from "@/lib/song-list";

import { describeStoredSong, foldSongId, resolvePersonalSong, type PersonalDirectory } from "./identity";
import type { FavoriteRow } from "./store";

/**
 * Favorites as the member sees them. Pure.
 *
 * Stored rows are never rewritten. Spellings of one song collapse into one
 * logical Favorite here, BEFORE search, sorting and paging, so a page boundary
 * can never split or repeat a song.
 */

type SortKey = Array<string | number>;

/** One Favorite per song, dated by its earliest stored row. */
export function logicalFavorites(
  rows: readonly FavoriteRow[],
  directory: PersonalDirectory,
  songs: ReadonlyMap<string, FavoriteSongInfo>,
): FavoriteEntry[] {
  const bySong = new Map<string, FavoriteEntry>();
  const others: FavoriteEntry[] = [];
  for (const row of rows) {
    const stored = describeStoredSong(row.songId, directory);
    const info = stored.state === "available" ? songs.get(stored.songId) : undefined;
    if (stored.state === "available" && info) {
      const known = bySong.get(info.songId);
      if (!known) bySong.set(info.songId, { kind: "song", key: info.songId, addedAt: row.createdAt, ...info });
      else if (row.createdAt < known.addedAt) known.addedAt = row.createdAt;
    } else {
      others.push({ kind: stored.state === "available" ? "unavailable" : stored.state, key: row.songId, addedAt: row.createdAt });
    }
  }
  return [...bySong.values(), ...others];
}

function naturalNumber(number: string | null): { has: 0 | 1; value: number; rest: string } {
  const match = number?.trim().match(/^(\d{1,15})(.*)$/);
  if (match) return { has: 0, value: Number(match[1]), rest: match[2].toLowerCase() };
  return { has: 1, value: 0, rest: number?.trim().toLowerCase() ?? "" };
}

/**
 * What an entry sorts by. The stored or canonical key always comes last, so no
 * two entries tie. Entries without details go after those with them, except in
 * Recently Added, where only the date matters.
 */
function sortKey(entry: FavoriteEntry, sort: FavoriteSort): SortKey {
  if (sort === "recent") return [entry.addedAt, entry.key];
  if (entry.kind !== "song") {
    return sort === "title" ? [1, "", "", 0, 0, "", entry.key] : [1, 0, "", 0, 0, "", "", entry.key];
  }
  const number = naturalNumber(entry.number);
  const collection = entry.collection?.trim().toLowerCase() ?? "";
  const title = songKey(entry.title);
  if (sort === "title") return [0, title, collection, number.has, number.value, number.rest, entry.key];
  return [0, collection ? 0 : 1, collection, number.has, number.value, number.rest, title, entry.key];
}

function compareKeys(a: SortKey, b: SortKey, sort: FavoriteSort): number {
  for (let i = 0; i < a.length; i += 1) {
    const [x, y] = [a[i], b[i]];
    if (x === y) continue;
    const order = x < y ? -1 : 1;
    // Recently Added is newest first; its tie-breaker still runs A-Z.
    return sort === "recent" && i === 0 ? -order : order;
  }
  return 0;
}

function matchesQuery(entry: FavoriteEntry, query: string): boolean {
  if (entry.kind !== "song") return false;
  if (matchesSong({ title: entry.title, number: entry.number, keys: [] }, { query, key: "" })) return true;
  return entry.collection?.toLowerCase().includes(query.trim().toLowerCase()) ?? false;
}

interface Cursor {
  sort: FavoriteSort;
  query: string;
  key: SortKey;
}

const KEY_LENGTH: Record<FavoriteSort, number> = { recent: 2, title: 7, number: 8 };

export function encodeFavoritesCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify({ v: 1, s: cursor.sort, q: cursor.query, k: cursor.key }), "utf8").toString("base64url");
}

export function decodeFavoritesCursor(raw: string): Cursor | null {
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { v?: unknown; s?: unknown; q?: unknown; k?: unknown };
    if (value.v !== 1 || typeof value.q !== "string" || !Array.isArray(value.k)) return null;
    const sort = FAVORITE_SORTS.find((candidate) => candidate === value.s);
    if (!sort || value.k.length !== KEY_LENGTH[sort]) return null;
    const shape = sortKey(
      sort === "recent"
        ? { kind: "unknown", key: "", addedAt: "" }
        : { kind: "song", key: "", addedAt: "", songId: "", title: "", number: null, collection: null, href: "" },
      sort,
    );
    if (!value.k.every((part, index) => typeof part === typeof shape[index] && (typeof part !== "number" || Number.isFinite(part)))) return null;
    return { sort, query: value.q, key: value.k as SortKey };
  } catch {
    return null;
  }
}

export type FavoritesPageResult =
  | { status: "ok"; page: FavoritesPage }
  | { status: "invalid-cursor" | "directory-unavailable" };

/**
 * One page, chosen after every stored row has been collapsed, searched and
 * sorted. The cursor holds a position in the order rather than an offset, so a
 * Favorite added or removed between requests cannot repeat or skip the others.
 * It does not freeze the collection across requests.
 */
export function buildFavoritesPage(
  rows: readonly FavoriteRow[],
  directory: PersonalDirectory,
  songs: ReadonlyMap<string, FavoriteSongInfo>,
  options: { sort: FavoriteSort; query: string; cursor: string | null; limit: number },
): FavoritesPageResult {
  const query = options.query.trim();
  const down = directory.status !== "ok";
  if (down && query) return { status: "directory-unavailable" };
  const sort: FavoriteSort = down ? "recent" : options.sort;

  const cursor = options.cursor ? decodeFavoritesCursor(options.cursor) : null;
  if (options.cursor && (!cursor || cursor.sort !== sort || cursor.query !== query)) return { status: "invalid-cursor" };

  const all = logicalFavorites(rows, directory, songs);
  const keyed = (query ? all.filter((entry) => matchesQuery(entry, query)) : all)
    .map((entry) => ({ entry, key: sortKey(entry, sort) }))
    .sort((a, b) => compareKeys(a.key, b.key, sort));
  const start = cursor ? keyed.findIndex(({ key }) => compareKeys(key, cursor.key, sort) > 0) : 0;
  const rest = start < 0 ? [] : keyed.slice(start);
  const shown = rest.slice(0, options.limit);
  const last = shown[shown.length - 1];
  return {
    status: "ok",
    page: {
      items: shown.map(({ entry }) => entry),
      nextCursor: rest.length > options.limit && last ? encodeFavoritesCursor({ sort, query, key: last.key }) : null,
      matched: keyed.length,
      total: all.length,
      sort,
      directory: down ? "unavailable" : "ok",
    },
  };
}

export interface MembershipPlan {
  /** Every spelling to look up, folded and without repeats. */
  folded: string[];
  answer(present: ReadonlySet<string>): Record<string, MembershipState>;
}

/** Resolves a batch once, so the database is asked one question however many songs it covers. */
export function planMembership(ids: readonly string[], directory: PersonalDirectory): MembershipPlan {
  const resolved = [...new Set(ids)].map((id) => ({ id, result: resolvePersonalSong(id, directory) }));
  const folded = new Set<string>();
  for (const { result } of resolved) {
    if (result.status === "ok") for (const stored of result.storedIds) folded.add(foldSongId(stored));
  }
  return {
    folded: [...folded],
    answer(present) {
      const states: Record<string, MembershipState> = {};
      for (const { id, result } of resolved) {
        if (result.status === "ok") {
          const favorited = result.storedIds.some((stored) => present.has(foldSongId(stored)));
          states[id] = { state: favorited ? "favorited" : "not-favorited", songId: result.songId };
        } else {
          states[id] = { state: result.status === "directory-unavailable" ? "unavailable" : "unsupported" };
        }
      }
      return states;
    },
  };
}
