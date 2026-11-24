/**
 * What the Favorites API sends and accepts. Shared by the server and the
 * browser, so it holds types and limits only: no data access.
 */

export const FAVORITE_SORTS = ["recent", "title", "number"] as const;
export type FavoriteSort = (typeof FAVORITE_SORTS)[number];

export const FAVORITES_PAGE_SIZE = 50;
export const MAX_FAVORITES_PAGE_SIZE = 100;
export const MAX_FAVORITES_QUERY = 100;
export const MAX_FAVORITES_CURSOR = 1024;
/** The most songs one membership request may ask about. A request limit, not a collection limit. */
export const MAX_MEMBERSHIP_IDS = 200;

/** Public song details only. Never rights, files or anything entitlement-related. */
export interface FavoriteSongInfo {
  songId: string;
  title: string;
  number: string | null;
  collection: string | null;
  href: string;
}

export type FavoriteEntry =
  | ({ kind: "song"; key: string; addedAt: string } & FavoriteSongInfo)
  /**
   * The stored record, with no guessed details. `unavailable`: the song is no
   * longer listed. `ambiguous`: more than one song claims it. `unknown`: the
   * song list could not be read just now. `key` is the exact stored key.
   */
  | { kind: "unavailable" | "ambiguous" | "unknown"; key: string; addedAt: string };

export interface FavoritesPage {
  items: FavoriteEntry[];
  nextCursor: string | null;
  /** How many match the search, across the whole collection. */
  matched: number;
  /** How many logical Favorites there are in all. */
  total: number;
  /** The order actually used: Recently Added while song details are unavailable. */
  sort: FavoriteSort;
  directory: "ok" | "unavailable";
}

export type MembershipState =
  | { state: "favorited" | "not-favorited"; songId: string }
  /** This identity cannot be favorited: historical, unknown or ambiguous. */
  | { state: "unsupported" }
  /** The song list could not be read, so the answer is not known. */
  | { state: "unavailable" };

export type FavoriteErrorCode =
  | "unauthorized"
  | "profile-blocked"
  | "account-erasing"
  | "account-mismatch"
  | "cross-origin"
  | "invalid-input"
  | "invalid-cursor"
  | "unknown-song"
  | "unsupported-song"
  | "ambiguous-song"
  | "directory-unavailable"
  | "unavailable";

export interface FavoriteErrorBody {
  ok: false;
  code: FavoriteErrorCode;
  error: string;
}

export interface FavoriteMutationBody {
  ok: true;
  songId: string;
  favorite: boolean;
  changed: boolean;
}
