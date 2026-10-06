/**
 * Where the site's own back links ("← Back to …") lead: the page the visitor
 * actually came from, in this tab - the Dashboard, the song list, a year
 * page, an admin list - rather than a fixed parent page.
 *
 * Every page visited in the tab is recorded in a short history
 * (recordVisit(), run by PageHistoryTracker in the root layout). A back link
 * then asks findOrigin() for the page before the current one. Following a
 * back link - or the browser's own Back - steps the history back too, so
 * "archive → year → back" lands on the archive, and the archive's own back
 * link then leads to wherever the archive was reached from, not to the year
 * page again.
 *
 * With no history (a shared link opened straight to the page) a back link
 * uses its page's fallback, which is its natural parent.
 *
 * Pure - no browser APIs - so it can be unit tested.
 */

import { navigationContent } from "@/content/navigation";

export const PAGE_HISTORY_KEY = "fwm:page-history";

/** Enough to step back through any real path through the site. */
const MAX_ENTRIES = 30;

/** "/song-list/archive?q=grace" -> "/song-list/archive". */
export function pathOf(entry: string): string {
  return entry.split(/[?#]/)[0].replace(/(.)\/$/, "$1") || "/";
}

export function isSongPage(pathname: string): boolean {
  return /^\/library\/songs\/[^/]+\/?$/.test(pathname);
}

/**
 * Whether an entry is a page on this site: a path starting with exactly one
 * "/". The history is only ever written by this site, but it lives in the
 * browser, so anything else ("//elsewhere.example", "/\elsewhere",
 * "https://…", "javascript:…") is ignored rather than followed - a back
 * link can never lead off the site.
 */
export function isSitePath(entry: string): boolean {
  return /^\/(?![/\\])/.test(entry) && !/[\s\u0000-\u001f]/.test(entry);
}

/**
 * The history after visiting `entry` (a path with its query).
 *
 *   same page again (a new query)  -> replaces the last entry
 *   the page before the last one   -> a step back: the last entry is dropped
 *   anything else                  -> added
 */
export function recordVisit(history: readonly string[], entry: string): string[] {
  const path = pathOf(entry);
  const last = history.length - 1;
  if (last >= 0 && pathOf(history[last]) === path) return [...history.slice(0, last), entry];
  if (last >= 1 && pathOf(history[last - 1]) === path) return [...history.slice(0, last - 1), entry];
  return [...history, entry].slice(-MAX_ENTRIES);
}

/**
 * The page the visitor came to `currentPath` from, with its query, or null.
 * `skipSongPages`: a song page's back link passes over other song pages, so
 * hopping between "Often sung with" songs still leads back to where the
 * visitor started.
 */
export function findOrigin(
  history: readonly string[],
  currentPath: string,
  options: { skipSongPages?: boolean } = {},
): string | null {
  const current = pathOf(currentPath);
  let end = history.length;
  // The current page may already be recorded (or not yet): either way it is not its own origin.
  while (end > 0 && pathOf(history[end - 1]) === current) end -= 1;

  for (let index = end - 1; index >= 0; index -= 1) {
    if (!isSitePath(history[index])) continue;
    const path = pathOf(history[index]);
    if (path === current) continue;
    if (options.skipSongPages && isSongPage(path)) continue;
    return history[index];
  }
  return null;
}

/** "Back to …" for a page, or the plain "Back" for one without a name. */
export function backLabel(entry: string): string {
  const labels = navigationContent.back;
  const path = pathOf(entry);

  const year = path.match(/^\/song-list\/year\/(\d{4})$/)?.[1];
  if (year) return labels.year.replace("{year}", year);
  if (isSongPage(path)) return labels.song;
  if (/^\/(service-planner|song-list\/archive\/services)\/\d{4}-\d{2}-\d{2}-(am|pm)$/.test(path)) return labels.service;

  const named: Record<string, string> = {
    "/": labels.home,
    "/dashboard": labels.dashboard,
    "/service-planner": labels.servicePlanner,
    "/conductor": labels.conductor,
    "/service-planner/inserts": labels.inserts,
    "/song-list/archive/services": labels.serviceArchive,
    "/availability": labels.availability,
    "/song-list": labels.songList,
    "/song-list/archive": labels.archive,
    "/song-list/year": labels.years,
    "/library": labels.library,
    "/contact": labels.contact,
    "/profile": labels.profile,
    "/account": labels.account,
    "/notifications": labels.notifications,
    "/notifications/settings": labels.notificationSettings,
    "/admin": labels.admin,
    "/admin/requests": labels.requests,
    "/admin/invitations": labels.invitations,
    "/admin/users": labels.people,
    "/admin/roles": labels.roles,
    "/admin/configuration": labels.configuration,
    "/admin/notifications": labels.notificationCenter,
    "/admin/notifications/history": labels.notificationHistory,
    "/admin/notifications/templates": labels.notificationTemplates,
    "/admin/notifications/policies": labels.notificationPolicies,
    "/admin/ai": labels.ai,
  };
  return named[path] ?? labels.generic;
}

/** Where a back link leads, and what it says: the origin if known, else the page's fallback. */
export function backTarget(origin: string | null, fallback: string): { href: string; label: string } {
  const href = origin && isSitePath(origin) ? origin : fallback;
  return { href, label: backLabel(href) };
}
