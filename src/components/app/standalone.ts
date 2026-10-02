"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the site is running as the installed app (src/lib/install.ts):
 * `display-mode: standalone` everywhere, plus iOS's own navigator.standalone
 * for a Home Screen icon added before iOS honoured the manifest.
 */
export const STANDALONE_QUERY = "(display-mode: standalone)";

export function isStandalone(): boolean {
  return (
    window.matchMedia(STANDALONE_QUERY).matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function subscribeStandalone(onChange: () => void) {
  const query = window.matchMedia(STANDALONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** A finger rather than a mouse: phones and tablets. */
const TOUCH_QUERY = "(pointer: coarse)";

function appOnTouchSnapshot(): boolean {
  return isStandalone() && window.matchMedia(TOUCH_QUERY).matches;
}

/**
 * True inside the installed app on a phone or tablet - where there is no
 * browser around the site to supply tabs, a PDF viewer's controls or a reload.
 * False on the server and in any browser.
 */
export function useInstalledAppOnTouch(): boolean {
  return useSyncExternalStore(subscribeStandalone, appOnTouchSnapshot, () => false);
}
