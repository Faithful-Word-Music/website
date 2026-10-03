"use client";

import { useEffect, useRef } from "react";

import { Logo } from "@/components/layout/Logo";
import { usePagePath } from "@/components/ui/use-page-path";
import { siteConfig } from "@/config/site";
import { isOpenInApp } from "@/lib/app-only";
import {
  MIN_VISIBLE_MS,
  isSignInCallback,
  readyToHide,
  SPLASH_ATTRIBUTE,
  SPLASH_CONTINUE_KEY,
  SPLASH_FAILSAFE_MS,
  SPLASH_HOLD_ATTRIBUTE,
  SPLASH_SHOW_EVENT,
} from "@/lib/splash";

/** Its fade out; keep in step with .splash[data-leaving] in globals.css. */
const FADE_MS = 400;
/**
 * How often to look again while a placeholder holds it. The page that
 * replaces a placeholder on a first load is swapped in by the server's
 * stream, not by React, so there is nothing to listen for.
 */
const RECHECK_MS = 100;

/**
 * The loading screen (src/lib/splash.ts): the mark, glowing gold while the
 * page loads, and the name beneath it. Always in the page, and hidden by CSS
 * unless data-splash is on <html>.
 *
 * - First load: the <head> script put it up. Once React has taken over, it
 *   holds until it has been seen and the page has arrived, then fades away.
 * - showSplash() (after signing in, in the app), or back from signing in with
 *   Google: it stays until a page beyond the login pages has arrived - on
 *   this page, or (through the handoff in sessionStorage) the next one.
 *
 * Asked to show while it is already up, it carries on as it is; asked while
 * fading, it simply stops fading. It never starts over: going off and coming
 * back on is exactly what it must not do.
 */

function writeHandoff(since: number | null) {
  try {
    if (since === null) sessionStorage.removeItem(SPLASH_CONTINUE_KEY);
    else sessionStorage.setItem(SPLASH_CONTINUE_KEY, String(Math.round(Date.now() - (performance.now() - since))));
  } catch {
    // Storage blocked: a full page load just starts its own screen.
  }
}

function fontsReady(): boolean {
  return !document.fonts || document.fonts.status === "loaded";
}

export function Splash() {
  const ref = useRef<HTMLDivElement>(null);
  const path = usePagePath();
  const pathRef = useRef(path);
  /** While it is up: since when, and the page it is waiting to move on from, if any. */
  const shown = useRef<{ since: number; from: string | null } | null>(null);
  const check = useRef<() => void>(() => {});

  useEffect(() => {
    const html = document.documentElement;
    const splash = ref.current;
    if (!splash) return;
    let recheck = 0;
    let fade = 0;
    let failsafe = 0;
    /** When the screen last went up - kept while it fades, in case it is asked back. */
    let lastSince = 0;

    function clearTimers() {
      window.clearTimeout(recheck);
      window.clearTimeout(fade);
      window.clearTimeout(failsafe);
    }

    function hide() {
      shown.current = null;
      clearTimers();
      writeHandoff(null);
      splash!.setAttribute("data-leaving", "");
      fade = window.setTimeout(() => {
        html.removeAttribute(SPLASH_ATTRIBUTE);
        splash!.removeAttribute("data-leaving");
      }, FADE_MS);
    }

    check.current = () => {
      const current = shown.current;
      if (!current) return;
      window.clearTimeout(recheck);
      const shownFor = performance.now() - current.since;
      const ready = readyToHide({
        shownFor,
        held: document.querySelector(`[${SPLASH_HOLD_ATTRIBUTE}]`) !== null,
        fontsReady: fontsReady(),
        waitingForPage: current.from !== null && (pathRef.current === current.from || isOpenInApp(pathRef.current)),
      });
      if (ready) hide();
      else recheck = window.setTimeout(check.current, Math.max(RECHECK_MS, MIN_VISIBLE_MS - shownFor));
    };

    function show(since: number, from: string | null) {
      // Already up: the same screen carries on, now (also) waiting for `from` to be left.
      if (shown.current) {
        shown.current = { since: shown.current.since, from: from ?? shown.current.from };
        if (from !== null) writeHandoff(shown.current.since);
        check.current();
        return;
      }
      // Fading: it stops fading, still counted from when it first went up.
      if (splash!.hasAttribute("data-leaving") && html.hasAttribute(SPLASH_ATTRIBUTE)) since = lastSince;
      clearTimers();
      splash!.removeAttribute("data-leaving");
      html.setAttribute(SPLASH_ATTRIBUTE, String(Math.round(since)));
      shown.current = { since, from };
      lastSince = since;
      if (from !== null) writeHandoff(since);
      failsafe = window.setTimeout(hide, Math.max(0, SPLASH_FAILSAFE_MS - (performance.now() - since)));
      check.current();
    }

    // The first load's screen, if the <head> script put one up: from here on
    // it is ours, failsafe included. Put up on the way back from signing in,
    // it waits for the page after it.
    const initial = html.getAttribute(SPLASH_ATTRIBUTE);
    if (initial !== null) {
      window.clearTimeout(window.__splashFailsafe);
      const path = pathRef.current;
      show(Number(initial) || 0, isSignInCallback(path) ? path : null);
    }

    const onShow = () => show(performance.now(), pathRef.current);
    window.addEventListener(SPLASH_SHOW_EVENT, onShow);
    // The fonts arriving may be the last thing it was waiting for.
    document.fonts?.ready.then(() => check.current());
    return () => {
      window.removeEventListener(SPLASH_SHOW_EVENT, onShow);
      clearTimers();
    };
  }, []);

  // A new page: perhaps the one it was waiting for.
  useEffect(() => {
    pathRef.current = path;
    check.current();
  }, [path]);

  return (
    <div ref={ref} aria-hidden="true" className="splash fixed inset-0 z-[100] flex-col items-center justify-center bg-paper">
      <span className="block">
        <span className="splash-glow block rounded-[21px]">
          <Logo size={96} className="block" />
        </span>
      </span>
      <p className="mt-7 font-display text-3xl tracking-tight text-ink">{siteConfig.name}</p>
    </div>
  );
}
