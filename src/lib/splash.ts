/**
 * The loading screen: the mark and the name on paper, shown while the site
 * first loads - once per browser tab or app launch, and only for signed-in
 * members. Visitors never see it; the public site loads as it always has.
 *
 * It has to be up from the very first frame, before React or Clerk have
 * loaded, and the public pages are static, so the server cannot know who is
 * looking. The script below decides in <head> instead: Clerk keeps a
 * `__client_uat` cookie readable by the page (`__client_uat_<suffix>` too),
 * holding the time of the last sign-in, or 0 when signed out. That says
 * "probably signed in" without asking anyone, which is all a loading screen
 * needs; it is never used to decide what anyone may see.
 *
 * It is complete from its very first frame (nothing fades or scales in), and
 * once up it stays until the page is really there: at least MIN_VISIBLE_MS,
 * never while a loading placeholder that holds it (SplashHold, in a
 * loading.tsx) is still on the page, and never before the page's fonts have
 * loaded - so a slow page, like the Dashboard, appears complete as the screen
 * fades rather than as a skeleton or in fallback type.
 *
 * It is one screen from start to finish, however the page gets there. Put up
 * again after signing in (showSplash), it may outlive the page it went up on
 * - Clerk can finish with a full page load - so it leaves a handoff in
 * sessionStorage (SPLASH_CONTINUE_KEY) and the next page's <head> script
 * carries on with it from the first frame, its minimum time still counted
 * from when it first went up, rather than the screen going and coming back.
 *
 * The screen itself is src/components/app/Splash.tsx, and its styles are in
 * globals.css (.splash).
 */

/** sessionStorage: this tab (or this launch of the app) has had its loading screen. */
export const SPLASH_SEEN_KEY = "splash-seen";

/**
 * sessionStorage: the loading screen is up and waiting for the next page,
 * since this time (Date.now(), in ms) - for a full page load to carry on with.
 */
export const SPLASH_CONTINUE_KEY = "splash-continue";

/** A handoff older than this is stale (the next page never came), and ignored. */
export const SPLASH_CONTINUE_MS = 10_000;

/**
 * The <html> attribute that shows the loading screen. Its value is when it
 * went up (performance.now(), in ms), so its minimum time counts from then.
 */
export const SPLASH_ATTRIBUTE = "data-splash";

/** Marks a loading placeholder that keeps the loading screen up (SplashHold). */
export const SPLASH_HOLD_ATTRIBUTE = "data-splash-hold";

/**
 * The shortest the loading screen is up, however fast the page is: long
 * enough to take in the mark and see the gold glow rise and settle once (one
 * 2s pulse, .splash-glow in globals.css - keep the two in step), so it fades
 * just as the glow comes back to rest.
 */
export const MIN_VISIBLE_MS = 2000;

/** If the loading screen is still up by then (a script failed, or the page never came), it goes anyway. */
export const SPLASH_FAILSAFE_MS = 8000;

declare global {
  interface Window {
    /** The <head> script's failsafe timer, for Splash to take over. */
    __splashFailsafe?: number;
  }
}

/** Clerk's sign-in page, coming back from Google or another provider (a full page load). */
const SIGN_IN_CALLBACK = "/login/sso-callback";

export function isSignInCallback(pathname: string): boolean {
  return pathname.startsWith(SIGN_IN_CALLBACK);
}

/** A Clerk sign-in cookie with a time in it, rather than 0. */
export const SIGNED_IN_COOKIE = /(?:^|;\s*)__client_uat(?:_[^=;]*)?=[1-9]/;

/** Whether the page's cookies say someone is signed in. */
export function looksSignedIn(cookie: string): boolean {
  return SIGNED_IN_COOKIE.test(cookie);
}

/**
 * Whether the loading screen may go: it has had its minimum time, no
 * placeholder is holding it, the page's fonts are in, and it is not still
 * waiting for the next page (after signing in).
 */
export function readyToHide({
  shownFor,
  held,
  fontsReady,
  waitingForPage,
}: {
  shownFor: number;
  held: boolean;
  fontsReady: boolean;
  waitingForPage: boolean;
}): boolean {
  return shownFor >= MIN_VISIBLE_MS && !held && fontsReady && !waitingForPage;
}

/**
 * Runs in <head> before the first paint (see layout.tsx). Plain ES5: it runs
 * before any bundle has loaded. It puts the screen up for a signed-in
 * member's first load in this tab; carries on with one the page before left
 * up (a fresh SPLASH_CONTINUE_KEY handoff); and - inside the installed app -
 * puts it up on the way back from signing in with Google, where the sign-in
 * form would otherwise sit empty while Clerk finishes.
 */
export const splashInitScript = `(function(){try{var n=navigator,s=sessionStorage,p=performance.now(),t=null,c=s.getItem(${JSON.stringify(
  SPLASH_CONTINUE_KEY,
)});if(c){var d=Date.now()-Number(c);if(d>=0&&d<=${SPLASH_CONTINUE_MS})t=Math.round(p-d);else s.removeItem(${JSON.stringify(SPLASH_CONTINUE_KEY)})}if(t===null){var a=window.matchMedia("(display-mode: standalone)").matches||n.standalone===true;if(!(a&&location.pathname.indexOf(${JSON.stringify(
  SIGN_IN_CALLBACK,
)})===0)){if(s.getItem(${JSON.stringify(SPLASH_SEEN_KEY)}))return;if(!${SIGNED_IN_COOKIE.toString()}.test(document.cookie))return}t=Math.round(p)}s.setItem(${JSON.stringify(
  SPLASH_SEEN_KEY,
)},"1");var h=document.documentElement;h.setAttribute(${JSON.stringify(SPLASH_ATTRIBUTE)},String(t));window.__splashFailsafe=setTimeout(function(){h.removeAttribute(${JSON.stringify(
  SPLASH_ATTRIBUTE,
)})},Math.max(0,${SPLASH_FAILSAFE_MS}-(p-t)))}catch(e){}})()`;

/** Fired on window to put the loading screen up again (see showSplash). */
export const SPLASH_SHOW_EVENT = "fwm:splash-show";

/**
 * Puts the loading screen up again until the next page has arrived - in the
 * app, straight after signing in, while the Dashboard loads. Browser-only.
 */
export function showSplash() {
  window.dispatchEvent(new Event(SPLASH_SHOW_EVENT));
}
