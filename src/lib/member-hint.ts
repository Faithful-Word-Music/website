import { isMemberPath, MEMBER_SECTIONS } from "@/lib/navigation";
import { looksSignedIn, SIGNED_IN_COOKIE } from "@/lib/splash";

/**
 * Which footer a page shows: the full site footer for visitors, the compact
 * app footer (src/components/layout/AppFooter.tsx) for signed-in members -
 * on every page, the static public ones included.
 *
 * Both footers are in every page's HTML, so the public pages stay static and
 * cached. The <head> script below marks <html> with data-member before the
 * first paint when Clerk's sign-in cookie says someone is signed in, or the
 * page is one only a member can open; globals.css then shows the app footer
 * and hides the other. Once Clerk has loaded, MemberHint
 * (src/components/account/MemberHint.tsx) sets or clears the mark to match
 * the real session.
 *
 * Presentation only: it picks between two footers that hold nothing private.
 * It is never used to decide what anyone may see or do - every members' page
 * and action checks the session on the server.
 */

/** On <html> while the page is being shown to a signed-in member. */
export const MEMBER_ATTRIBUTE = "data-member";

/** Whether to show the member's footer, from the cookie and the page alone. */
export function isMemberHint({ cookie, pathname }: { cookie: string; pathname: string }): boolean {
  return looksSignedIn(cookie) || isMemberPath(pathname);
}

/** Runs in <head> before the first paint (see layout.tsx). Plain ES5; the same rule as isMemberHint. */
export const memberInitScript = `(function(){try{var p=location.pathname,s=${JSON.stringify(
  MEMBER_SECTIONS,
)},m=${SIGNED_IN_COOKIE.toString()}.test(document.cookie);for(var i=0;!m&&i<s.length;i++)m=p===s[i]||p.indexOf(s[i]+"/")===0;if(m)document.documentElement.setAttribute(${JSON.stringify(
  MEMBER_ATTRIBUTE,
)},"")}catch(e){}})()`;
