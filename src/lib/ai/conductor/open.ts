/**
 * Asking for Conductor's panel to open, from somewhere that is not the
 * panel's own button - the site search's "Ask Conductor"
 * (src/components/search/CommandPalette.tsx).
 *
 * The panel belongs to ConductorDock, mounted once in the root layout; what
 * wants it open has no hold on it. So it is asked for with an event on
 * window, the way the search tells the song list which service to show
 * (SHOW_SERVICE_EVENT in src/lib/site-search.ts). The dock decides: it opens
 * only for someone holding use_ai, and not on the Conductor page, which is
 * already the conversation.
 *
 * Opening is all this does. The question itself goes through the shared
 * conversation store (conductor-store.ts) like any other.
 */
export const OPEN_CONDUCTOR_EVENT = "fwm:open-conductor";

/** Asks the dock to open Conductor's panel (the drawer on a wide screen, the sheet on a phone). */
export function requestConductorOpen() {
  window.dispatchEvent(new CustomEvent(OPEN_CONDUCTOR_EVENT));
}
