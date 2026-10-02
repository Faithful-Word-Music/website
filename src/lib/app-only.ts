import { looksSignedIn } from "@/lib/splash";

/**
 * The installed app is for members only (src/lib/install.ts). Inside it, a
 * signed-out person never sees the public site: every page sends them to log
 * in, apart from the pages that lead to an account. The website in a browser
 * is unaffected - the public site stays public there.
 *
 * Two layers, because the public pages are static and cannot know who is
 * looking:
 *   - appOnlyInitScript, in <head>, sends a signed-out app straight to /login
 *     before the public page has even painted (on a full page load);
 *   - AppOnly (src/components/app/AppOnly.tsx) does the same after Clerk has
 *     loaded, for moves between pages and for logging out inside the app.
 * Neither is protection - the members' pages check on the server as always.
 */

/** Pages a signed-out person may still see inside the app: the way to an account. */
const OPEN_IN_APP = ["/login", "/accept-invite", "/request-access"];

export function isOpenInApp(pathname: string): boolean {
  return OPEN_IN_APP.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Where to send a signed-out app: the login page, then back to the page they
 * were opening. From the home page there is nothing to go back to, so logging
 * in lands on the Dashboard as usual.
 */
export function appLoginUrl(origin: string, pathname: string, search: string): string {
  if (pathname === "/") return "/login";
  return `/login?redirect_url=${encodeURIComponent(`${origin}${pathname}${search}`)}`;
}

/** Whether, inside the app, this page load should go to the login page first. */
export function needsAppLogin({ cookie, pathname }: { cookie: string; pathname: string }): boolean {
  return !looksSignedIn(cookie) && !isOpenInApp(pathname);
}

/**
 * Runs in <head> (see layout.tsx, only while accounts are switched on). Plain
 * ES5, mirroring the functions above, which the tests hold it to.
 */
export const appOnlyInitScript = `(function(){try{var n=navigator;if(!(window.matchMedia("(display-mode: standalone)").matches||n.standalone===true))return;if(/(?:^|;\\s*)__client_uat(?:_[^=;]*)?=[1-9]/.test(document.cookie))return;var l=location,p=l.pathname,o=${JSON.stringify(
  OPEN_IN_APP,
)};for(var i=0;i<o.length;i++){if(p===o[i]||p.indexOf(o[i]+"/")===0)return}l.replace(p==="/"?"/login":"/login?redirect_url="+encodeURIComponent(l.origin+p+l.search))}catch(e){}})()`;
