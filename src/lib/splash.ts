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
 * The screen itself is src/components/app/Splash.tsx, and its styles are in
 * globals.css (.splash).
 */

/** sessionStorage: this tab (or this launch of the app) has had its loading screen. */
export const SPLASH_SEEN_KEY = "splash-seen";

/** The <html> attribute that shows the loading screen. */
export const SPLASH_ATTRIBUTE = "data-splash";

/** A Clerk sign-in cookie with a time in it, rather than 0. */
const SIGNED_IN_COOKIE = /(?:^|;\s*)__client_uat(?:_[^=;]*)?=[1-9]/;

/** Whether the page's cookies say someone is signed in. */
export function looksSignedIn(cookie: string): boolean {
  return SIGNED_IN_COOKIE.test(cookie);
}

/** If the loading screen is still up by then (a script failed), it goes anyway. */
const FAILSAFE_MS = 6000;

/**
 * Runs in <head> before the first paint (see layout.tsx). Plain ES5: it runs
 * before any bundle has loaded.
 */
export const splashInitScript = `(function(){try{if(sessionStorage.getItem(${JSON.stringify(
  SPLASH_SEEN_KEY,
)}))return;if(!${SIGNED_IN_COOKIE.toString()}.test(document.cookie))return;sessionStorage.setItem(${JSON.stringify(
  SPLASH_SEEN_KEY,
)},"1");var h=document.documentElement;h.setAttribute(${JSON.stringify(SPLASH_ATTRIBUTE)},"");setTimeout(function(){h.removeAttribute(${JSON.stringify(
  SPLASH_ATTRIBUTE,
)})},${FAILSAFE_MS})}catch(e){}})()`;

/** Fired on window to put the loading screen up again (see showSplash). */
export const SPLASH_SHOW_EVENT = "fwm:splash-show";

/**
 * Puts the loading screen up again until the next page has arrived - in the
 * app, straight after signing in, while the Dashboard loads. Browser-only.
 */
export function showSplash() {
  window.dispatchEvent(new Event(SPLASH_SHOW_EVENT));
}
