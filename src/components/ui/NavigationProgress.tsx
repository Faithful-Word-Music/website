"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * A thin gold bar across the very top of the window while a new page loads -
 * the familiar strip many sites show between pages.
 *
 * It starts the moment a visitor follows a link to another page on this site
 * (or presses Back/Forward) and finishes when the address changes, which is
 * when Next.js has the new page ready.
 *
 * The site is fast, so most pages arrive almost at once. Rather than flash for
 * a frame, the bar always stays up for at least MIN_VISIBLE_MS: every page
 * change gets one short, visible sweep across the top. A slow load gets the
 * longer version - it creeps toward the end without ever reaching it (nobody
 * knows how long a page will take), then fills the rest and fades out.
 *
 * Driven by writing styles to the bar directly rather than through React
 * state: it changes many times a second and nothing else depends on it.
 * Purely visual - screen readers hear the new page's title instead.
 */

/** The shortest the bar is ever on screen, so a quick page change still reads. */
const MIN_VISIBLE_MS = 300;
/** How often the bar creeps forward while waiting. */
const TRICKLE_MS = 200;
/** Where the creeping levels off: the last stretch waits for the page. */
const CEILING = 0.9;
/** Give up, and finish anyway, if a page has not arrived by then. */
const GIVE_UP_MS = 15_000;

export function NavigationProgress() {
  const pathname = usePathname();
  const barRef = useRef<HTMLDivElement>(null);
  const run = useRef({
    active: false,
    startedAt: 0,
    progress: 0,
    timers: [] as number[],
    /** The path on screen, to tell a real page change from a #section jump. */
    path: "",
    finish: null as null | (() => void),
  });

  useEffect(() => {
    const state = run.current;
    const bar = barRef.current;
    if (!bar) return;

    function clearTimers() {
      state.timers.forEach((id) => window.clearTimeout(id));
      state.timers = [];
    }

    function set(progress: number) {
      state.progress = progress;
      bar!.style.transform = `scaleX(${progress})`;
    }

    function start() {
      if (state.active) return;
      // A new page change replaces whatever the last one was still doing.
      clearTimers();
      state.active = true;
      state.startedAt = performance.now();

      // Appear at once from the left edge, with no transition from the last
      // run, then leap to a head start so it moves the moment you click.
      bar!.style.transition = "none";
      set(0.02);
      bar!.style.opacity = "1";
      void bar!.offsetWidth;
      bar!.style.transition = "";
      set(0.3);

      state.timers.push(
        window.setTimeout(trickle, TRICKLE_MS),
        window.setTimeout(finish, GIVE_UP_MS),
      );
    }

    function trickle() {
      if (!state.active) return;
      // Each step covers a share of what is left: quick at first, then slower.
      set(state.progress + (CEILING - state.progress) * 0.12);
      state.timers.push(window.setTimeout(trickle, TRICKLE_MS));
    }

    function finish() {
      if (!state.active) return;
      state.active = false;
      clearTimers();

      // Hold on until the bar has been seen, then fill it and fade it out.
      const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - state.startedAt));
      state.timers.push(
        window.setTimeout(() => set(1), wait),
        window.setTimeout(() => {
          bar!.style.opacity = "0";
        }, wait + 180),
        window.setTimeout(() => set(0), wait + 480),
      );
    }

    /** A plain left-click on a link to a different page of this site. */
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;

      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page - a #section, or just a ?query - is not a page load. The
      // bar finishes when the path changes, so it only starts when it will.
      if (url.pathname === window.location.pathname) return;

      start();
    }

    /** Back/Forward: only when it lands on another page, not a #section. */
    function onPopState() {
      if (window.location.pathname !== state.path) start();
    }

    state.finish = finish;
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      clearTimers();
    };
  }, []);

  // The new page is here.
  useEffect(() => {
    run.current.path = pathname;
    run.current.finish?.();
  }, [pathname]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] print:hidden"
    >
      <div
        ref={barRef}
        style={{ transform: "scaleX(0)", opacity: 0 }}
        className="h-full origin-left bg-gold-dark shadow-[0_0_8px_color-mix(in_srgb,var(--color-gold)_70%,transparent)] transition-[transform,opacity] duration-[250ms]"
      />
    </div>
  );
}
