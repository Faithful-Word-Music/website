/**
 * Moving between this site's pages, as the browser sees it: which clicks do
 * it, and a way for a page with unsaved work to be asked first.
 *
 * The page-loading bar (NavigationProgress), the unsaved-changes guard
 * (use-unsaved-guard.ts) and the installed app (InstalledApp) all need to
 * agree on these, so they are decided once, here. Browser only.
 */

/**
 * Where a click leads, when it is a plain left-click on a link to a
 * different page of this site that opens in this tab - or null for anything
 * else: a modified click or a link to a new tab (both leave this page where
 * it is), a download, another site, or a #section or ?query on this page.
 */
export function pageLinkOf(event: MouseEvent): URL | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = (event.target as Element | null)?.closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement)) return null;
  if (link.target && link.target !== "_self") return null;
  if (link.hasAttribute("download")) return null;

  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname) return null;
  return url;
}

/**
 * Asked before leaving for `href`; true means "not yet" - the page has taken
 * the request and will go there itself if the person confirms.
 */
type LeaveGuard = (href: string) => boolean;

let leaveGuard: LeaveGuard | null = null;

/** Puts a guard up while a page has unsaved work; the returned function takes it down. */
export function setLeaveGuard(guard: LeaveGuard): () => void {
  leaveGuard = guard;
  return () => {
    if (leaveGuard === guard) leaveGuard = null;
  };
}

/**
 * For code about to change page itself (router.push) on a person's behalf:
 * true when a page with unsaved work has stepped in, and the move must not be
 * made. Link clicks need not ask - the guard sees those for itself.
 */
export function leaveBlocked(href: string): boolean {
  return leaveGuard?.(href) ?? false;
}
