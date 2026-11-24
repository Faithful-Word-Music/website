import "server-only";

import { NextResponse } from "next/server";

import { ACTION_ERRORS } from "@/lib/auth/session";
import { favoritesContent } from "@/content/favorites";
import {
  FAVORITE_SORTS,
  FAVORITES_PAGE_SIZE,
  MAX_FAVORITES_CURSOR,
  MAX_FAVORITES_PAGE_SIZE,
  MAX_FAVORITES_QUERY,
  MAX_MEMBERSHIP_IDS,
  type FavoriteErrorBody,
  type FavoriteErrorCode,
  type FavoriteMutationBody,
  type FavoriteSort,
  type FavoritesPage,
  type MembershipState,
} from "@/lib/favorites-api";
import { withPersonalLibrary } from "@/lib/personal-library/authorize";
import { buildFavoritesPage, planMembership } from "@/lib/personal-library/favorites";
import { MAX_SONG_ID_LENGTH, resolvePersonalSong } from "@/lib/personal-library/identity";
import { personalLibraryClient, personalSongs } from "@/lib/personal-library/server";
import {
  addFavorite,
  favoriteMembership,
  listFavoriteRows,
  removeExactFavorite,
  removeFavorite,
  type LibraryOwner,
} from "@/lib/personal-library/store";

/**
 * Every Favorites endpoint. The owner comes only from the session, through
 * withPersonalLibrary; no field in a request can name a person or environment.
 * Answers are private and never stored. Nothing here logs what a member saved.
 */

const HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };
/** Enough for the largest membership request, and no more. */
const MAX_BODY_BYTES = 64 * 1024;

const STATUS: Record<FavoriteErrorCode, number> = {
  unauthorized: 401,
  "profile-blocked": 403,
  "account-erasing": 403,
  "account-mismatch": 409,
  "cross-origin": 403,
  "invalid-input": 400,
  "invalid-cursor": 400,
  "unknown-song": 404,
  "unsupported-song": 422,
  "ambiguous-song": 409,
  "directory-unavailable": 503,
  unavailable: 503,
};

type Reply<T> = { ok: true; body: T } | { ok: false; code: FavoriteErrorCode };

const refuse = (code: FavoriteErrorCode) =>
  NextResponse.json<FavoriteErrorBody>({ ok: false, code, error: favoritesContent.errors[code] }, { status: STATUS[code], headers: HEADERS });

function boundaryCode(error: string): FavoriteErrorCode {
  if (error === ACTION_ERRORS.signedOut) return "unauthorized";
  if (error === ACTION_ERRORS.profileIncomplete) return "profile-blocked";
  return "unavailable";
}

async function respond<T>(work: (owner: LibraryOwner) => Promise<Reply<T>>): Promise<NextResponse> {
  const result = await withPersonalLibrary<Reply<T>>(async (owner) => ({ ok: true, value: await work(owner) }));
  if (!result.ok) return refuse(boundaryCode(result.error));
  if (!result.value.ok) return refuse(result.value.code);
  return NextResponse.json(result.value.body, { headers: HEADERS });
}

/** A browser says where a request came from; anything from another site is refused. */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host || new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return null;
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const validId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_SONG_ID_LENGTH && !/[\u0000-\u001f]/.test(value);

export async function listFavoritesResponse(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const rawSort = params.get("sort") ?? "recent";
  const sort = FAVORITE_SORTS.find((candidate) => candidate === rawSort) as FavoriteSort | undefined;
  const query = params.get("q") ?? "";
  const cursor = params.get("cursor");
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? FAVORITES_PAGE_SIZE : Number(rawLimit);
  if (
    !sort || query.length > MAX_FAVORITES_QUERY || (cursor !== null && (cursor.length === 0 || cursor.length > MAX_FAVORITES_CURSOR)) ||
    !Number.isInteger(limit) || limit < 1 || limit > MAX_FAVORITES_PAGE_SIZE
  ) {
    return refuse("invalid-input");
  }
  return respond<FavoritesPage>(async (owner) => {
    const sql = await personalLibraryClient(owner.env);
    const stored = await listFavoriteRows(sql, owner);
    if (stored.blocked) return { ok: false, code: "account-erasing" };
    const { directory, songs } = await personalSongs(owner.env);
    const result = buildFavoritesPage(stored.rows, directory, songs, { sort, query, cursor, limit });
    return result.status === "ok" ? { ok: true, body: result.page } : { ok: false, code: result.status };
  });
}

export async function membershipResponse(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return refuse("cross-origin");
  const body = await readJson(request);
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_MEMBERSHIP_IDS || !ids.every(validId)) {
    return refuse("invalid-input");
  }
  return respond<{ ok: true; songs: Record<string, MembershipState> }>(async (owner) => {
    const { directory } = await personalSongs(owner.env);
    const plan = planMembership(ids, directory);
    const sql = await personalLibraryClient(owner.env);
    const found = await favoriteMembership(sql, owner, plan.folded);
    if (found.blocked) return { ok: false, code: "account-erasing" };
    return { ok: true, body: { ok: true, songs: plan.answer(found.present) } };
  });
}

const RESOLUTION_ERROR = {
  unknown: "unknown-song",
  "not-durable": "unsupported-song",
  ambiguous: "ambiguous-song",
  "directory-unavailable": "directory-unavailable",
} as const;

/**
 * Sets one song to an explicit state. Repeating it is harmless, but that is
 * not ordering: a delayed older request can still overwrite a newer one.
 * `expectedAccount` grants nothing. It only refuses a request that a browser
 * queued for one account and sent after the session became another's.
 */
export async function setFavoriteResponse(request: Request, rawId: string): Promise<NextResponse> {
  if (!isSameOrigin(request)) return refuse("cross-origin");
  const body = await readJson(request);
  if (!body || typeof body.favorite !== "boolean" || typeof body.expectedAccount !== "string" || !validId(rawId)) {
    return refuse("invalid-input");
  }
  if (body.exact !== undefined && typeof body.exact !== "boolean") return refuse("invalid-input");
  const { favorite, expectedAccount } = body as { favorite: boolean; expectedAccount: string };
  const exact = body.exact === true;
  if (exact && favorite) return refuse("invalid-input");

  return respond<FavoriteMutationBody>(async (owner) => {
    if (expectedAccount !== owner.userId) return { ok: false, code: "account-mismatch" };
    const sql = await personalLibraryClient(owner.env);

    if (exact) {
      const removed = await removeExactFavorite(sql, owner, rawId);
      if (removed === "account-erasing") return { ok: false, code: "account-erasing" };
      return { ok: true, body: { ok: true, songId: rawId, favorite: false, changed: removed === "removed" } };
    }

    const { directory } = await personalSongs(owner.env);
    const song = resolvePersonalSong(rawId, directory);
    if (song.status !== "ok") return { ok: false, code: RESOLUTION_ERROR[song.status] };

    const outcome = favorite ? await addFavorite(sql, owner, song) : await removeFavorite(sql, owner, song.storedIds);
    if (outcome === "account-erasing") return { ok: false, code: "account-erasing" };
    return { ok: true, body: { ok: true, songId: song.songId, favorite, changed: outcome === "added" || outcome === "removed" } };
  });
}
