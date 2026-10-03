"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Whether the header shows its links in a row ("wide") or behind the menu
 * button ("narrow"). "auto" is the server's render and the first one in the
 * browser, before anything is measured: the nav-wide variant in globals.css
 * then falls back to the old 1024px breakpoint, so nothing flashes.
 */
export type NavMode = "auto" | "wide" | "narrow";

/** Room to spare before the row comes back, so it cannot flap at the edge. */
const HYSTERESIS = 16;

export interface NavFit {
  mode: Exclude<NavMode, "auto">;
  /** The row width the links need, once they have been seen not to fit. */
  required: number | null;
}

/**
 * The next mode, from what the header measures. Pure, for testing.
 *
 * `overflow` is how far the links spill past the room they have, or null
 * while they are hidden (behind the menu button, or below the fallback
 * breakpoint before the first measurement).
 */
export function nextNavMode(
  required: number | null,
  { rowWidth, overflow }: { rowWidth: number; overflow: number | null },
): NavFit {
  if (overflow !== null) {
    return overflow > 0
      ? { mode: "narrow", required: rowWidth + overflow + HYSTERESIS }
      : { mode: "wide", required };
  }
  // Hidden, and no idea yet what the links need: show them and measure.
  if (required === null) return { mode: "wide", required };
  return { mode: rowWidth >= required ? "wide" : "narrow", required };
}

/**
 * Collapses the header's links behind the menu button exactly when they no
 * longer fit - which depends on who is signed in, not on a breakpoint.
 *
 * `itemsKey` names the links; when it changes (signing in, a new role) the
 * links are shown and measured again. Every measurement happens in a layout
 * effect, so a row too long for the bar is never painted.
 */
export function useNavFit(itemsKey: string) {
  const rowRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const required = useRef<number | null>(null);
  const [mode, setMode] = useState<NavMode>("auto");

  const measure = useCallback(() => {
    const row = rowRef.current;
    const nav = navRef.current;
    if (!row || !nav) return;
    const shown = nav.getClientRects().length > 0;
    const next = nextNavMode(required.current, {
      rowWidth: row.clientWidth,
      overflow: shown ? nav.scrollWidth - nav.clientWidth : null,
    });
    required.current = next.required;
    setMode(next.mode);
  }, []);

  // New links: forget what the old ones needed.
  useLayoutEffect(() => {
    required.current = null;
    measure();
  }, [itemsKey, measure]);

  // Each change of mode is checked before it paints.
  useLayoutEffect(measure, [mode, measure]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const nav = navRef.current;
    if (!row || !nav) return;
    // The row for the window; the nav for a control appearing beside it
    // (the avatar, once Clerk has loaded).
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(nav);
    // The web fonts change the links' width once they arrive.
    let live = true;
    document.fonts?.ready.then(() => {
      if (!live) return;
      required.current = null;
      measure();
    });
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [measure]);

  return { mode, rowRef, navRef };
}
