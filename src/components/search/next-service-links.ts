import type { NextServicePrivate } from "@/lib/site-search";

/**
 * The signed-in person's own next-service links (/api/account/next-service),
 * for the search palette, kept for a short while during the visit - but only
 * ever for the person, and the permissions, they were fetched for.
 *
 * `key` (linksKey) names both. A different key, signing out (a null key), or
 * the session having ended (any refused answer: 401, 403) throws them away.
 * A link kept here grants nothing: the sheet music PDF route checks the
 * session, the profile and every file again whenever it is opened.
 */

const FRESH_MS = 2 * 60_000;

/** Only a link to the person's own sheet music PDF is ever offered from the answer. */
const SHEET_MUSIC_PATH = /^\/dashboard\/sheet-music\/[0-9a-z-]+$/;

let cached: { key: string; at: number; request: Promise<NextServicePrivate | null> } | null = null;

/** Who the links are for: the person and what they may do. Null when signed out. */
export function linksKey(userId: string | null | undefined, signedIn: boolean, permissions: ReadonlySet<string>): string | null {
  return signedIn && userId ? `${userId}|${[...permissions].sort().join(",")}` : null;
}

/** Forget whatever is kept, unless it is for `keep`. */
export function forgetLinks(keep: string | null = null) {
  if (cached && cached.key !== keep) cached = null;
}

/** The links for `key`: kept ones while fresh, else fetched. Null signed out, refused or failed. */
export function loadLinks(key: string | null, now = Date.now()): Promise<NextServicePrivate | null> {
  forgetLinks(key);
  if (key === null) return Promise.resolve(null);
  if (cached && now - cached.at < FRESH_MS) return cached.request;

  const drop = () => {
    if (cached?.key === key && cached.request === request) cached = null;
  };
  const request: Promise<NextServicePrivate | null> = fetch("/api/account/next-service", { cache: "no-store", credentials: "same-origin" })
    .then(async (response) => {
      if (!response.ok) {
        drop();
        return null;
      }
      const body = (await response.json()) as Partial<NextServicePrivate>;
      return {
        anchor: typeof body.anchor === "string" ? body.anchor : null,
        sheetMusicHref: typeof body.sheetMusicHref === "string" && SHEET_MUSIC_PATH.test(body.sheetMusicHref) ? body.sheetMusicHref : null,
      };
    })
    .catch(() => {
      drop();
      return null;
    });
  cached = { key, at: now, request };
  return request;
}
