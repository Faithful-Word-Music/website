"use client";

import { useEffect, type RefObject } from "react";

/** How much of the foot of the window a bar is taking, for the floating buttons to clear (globals.css). */
const CLEAR = "--action-bar-clear";

/**
 * For a bar that sits on the foot of the window (ActionBar, the playlist's
 * player bar): while it rests there, <html> carries `data-action-bar` and the
 * bar's height in --action-bar-clear, so Conductor's button rises above it and
 * "Back to top" steps aside (globals.css, BackToTop.tsx). The bar itself gets
 * `data-docked`.
 *
 * It counts as resting there only when it is showing and its bottom edge is on
 * the window's: hidden (`lg:hidden`), slid away below the window, or scrolled
 * to its own place in the page, it is not.
 */
export function useFootClearance(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const bar = ref.current;
    if (!enabled || !bar) return;

    const root = document.documentElement;
    let frame = 0;

    const release = () => {
      bar.removeAttribute("data-docked");
      root.style.removeProperty(CLEAR);
      delete root.dataset.actionBar;
    };

    const measure = () => {
      frame = 0;
      const rect = bar.getBoundingClientRect();
      // The foot is the window's less a horizontal scrollbar, where there is one.
      const foot = [window.innerHeight, root.clientHeight];
      if (rect.height > 0 && foot.some((edge) => Math.abs(rect.bottom - edge) < 2)) {
        bar.setAttribute("data-docked", "");
        root.style.setProperty(CLEAR, `${Math.round(rect.height)}px`);
        root.dataset.actionBar = "";
      } else release();
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(measure);
    };

    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(bar);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // A bar that slides in or out settles where it ends up.
    bar.addEventListener("transitionend", schedule);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      bar.removeEventListener("transitionend", schedule);
      release();
    };
  }, [ref, enabled]);
}
