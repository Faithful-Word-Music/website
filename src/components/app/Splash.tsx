"use client";

import { useEffect, useRef } from "react";

import { Logo } from "@/components/layout/Logo";
import { usePagePath } from "@/components/ui/use-page-path";
import { siteConfig } from "@/config/site";
import { SPLASH_ATTRIBUTE, SPLASH_SHOW_EVENT } from "@/lib/splash";

/**
 * The shortest the loading screen is up, however fast the page is: long
 * enough to take in the mark and see the gold glow rise and settle once
 * (300ms delay + one 1600ms pulse, .splash-glow in globals.css - keep the
 * two in step), so it fades just after the glow comes back to rest.
 */
const MIN_VISIBLE_MS = 2000;
/** Its fade out; keep in step with .splash[data-leaving] in globals.css. */
const FADE_MS = 400;
/** Put up again by showSplash(): taken down anyway if no page has arrived by then. */
const SHOW_FAILSAFE_MS = 8000;

/**
 * The loading screen (src/lib/splash.ts): the mark, glowing gold while the
 * page loads, and the name beneath it. Always in the page, and hidden by CSS
 * unless data-splash is on <html>.
 *
 * - First load: the <head> script put it up. Once React has taken over, it
 *   holds until it has been seen, then fades away.
 * - showSplash() (after signing in, in the app): it comes back at once and
 *   stays until the next page has arrived.
 */
export function Splash() {
  const ref = useRef<HTMLDivElement>(null);
  const path = usePagePath();
  const pathRef = useRef(path);
  /** Waiting for the page after this one, since this time. */
  const waiting = useRef<{ from: string; since: number } | null>(null);
  const timers = useRef<number[]>([]);
  const hideAfter = useRef<(ms: number) => void>(() => {});

  useEffect(() => {
    const html = document.documentElement;
    const splash = ref.current;
    if (!splash) return;
    const pending = timers.current;

    function clearTimers() {
      pending.forEach((id) => window.clearTimeout(id));
      pending.length = 0;
    }

    hideAfter.current = (ms: number) => {
      clearTimers();
      pending.push(
        window.setTimeout(() => {
          splash.setAttribute("data-leaving", "");
          pending.push(
            window.setTimeout(() => {
              html.removeAttribute(SPLASH_ATTRIBUTE);
              splash.removeAttribute("data-leaving");
            }, FADE_MS),
          );
        }, ms),
      );
    };

    function onShow() {
      clearTimers();
      splash!.removeAttribute("data-leaving");
      html.setAttribute(SPLASH_ATTRIBUTE, "");
      waiting.current = { from: pathRef.current, since: performance.now() };
      hideAfter.current(SHOW_FAILSAFE_MS);
    }

    // The first load's screen, if the <head> script put one up.
    if (html.hasAttribute(SPLASH_ATTRIBUTE)) hideAfter.current(Math.max(0, MIN_VISIBLE_MS - performance.now()));

    window.addEventListener(SPLASH_SHOW_EVENT, onShow);
    return () => {
      window.removeEventListener(SPLASH_SHOW_EVENT, onShow);
      clearTimers();
    };
  }, []);

  // The page it was waiting for has arrived.
  useEffect(() => {
    pathRef.current = path;
    const wait = waiting.current;
    if (!wait || path === wait.from) return;
    waiting.current = null;
    hideAfter.current(Math.max(0, MIN_VISIBLE_MS - (performance.now() - wait.since)));
  }, [path]);

  return (
    <div ref={ref} aria-hidden="true" className="splash fixed inset-0 z-[100] flex-col items-center justify-center bg-paper">
      <span className="splash-mark block">
        <span className="splash-glow block rounded-[21px]">
          <Logo size={96} className="block" />
        </span>
      </span>
      <p className="splash-name mt-7 font-display text-3xl tracking-tight text-ink">{siteConfig.name}</p>
    </div>
  );
}
