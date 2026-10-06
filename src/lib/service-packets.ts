/**
 * The song list's "Sheet music" buttons, remembered in the
 * browser (src/components/song-list/ServicePackets.tsx).
 *
 * The song list is static and the same for everyone, so it cannot render a
 * person's own buttons on the server. Instead the last answer is kept in
 * localStorage - with whose it is - and shown the moment the page renders.
 * The Dashboard, which works the answer out on the server anyway, hands it
 * over too, so opening the song list from it needs no round trip at all.
 *
 * On a full page load the HTML arrives before any script, though, and a
 * button appearing a moment later would push the card's edge down. The
 * <head> script below sets data-packets on <html> when this browser has an
 * answer for someone with sheet music assigned (and someone is signed in),
 * and globals.css (.packet-slot) then holds the button's space open until it
 * is drawn. Visitors never get the space. It only reserves room: what is
 * shown is always checked against the signed-in person.
 */

import { SIGNED_IN_COOKIE } from "@/lib/splash";

/** localStorage: { userId, packets } - the last answer, and whose it is. */
export const PACKETS_STORAGE_KEY = "fwm:service-packets";

/** On <html> while the last answer was for someone with sheet music assigned. */
export const PACKETS_ATTRIBUTE = "data-packets";

/** Runs in <head> before the first paint (see layout.tsx). Plain ES5. */
export const packetsInitScript = `(function(){try{var v=JSON.parse(localStorage.getItem(${JSON.stringify(
  PACKETS_STORAGE_KEY,
)})||"null");if(v&&v.packets&&v.packets.assigned===true&&${SIGNED_IN_COOKIE.toString()}.test(document.cookie))document.documentElement.setAttribute(${JSON.stringify(
  PACKETS_ATTRIBUTE,
)},"")}catch(e){}})()`;
