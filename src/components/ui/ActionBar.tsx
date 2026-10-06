"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "./cn";

/** How much of the foot of the window the bar is taking, for the floating buttons to clear (globals.css). */
const CLEAR = "--action-bar-clear";

/**
 * A page's own bar of actions (the planner's Save and Publish, the
 * philosophy's Save changes): it follows the reader down the page, docked to
 * the very bottom of the window - never floating a little above it, where
 * the page would show through underneath.
 *
 * On a phone it is a strip from edge to edge, clear of the home indicator;
 * from `sm` a card on a backing of paper. While it is docked, <html> carries
 * `data-action-bar` and the bar's height, and the floating buttons in the
 * corner move out of its way.
 *
 * With `stuck` off it is an ordinary card in the page: for a bar that has
 * nothing to act on yet, and so no reason to cover what is being read.
 */
export function ActionBar({
  stuck = true,
  className,
  barClassName,
  children,
}: {
  stuck?: boolean;
  /** The bar's place in the page: its margins. */
  className?: string;
  /** How the bar lays out what is in it. */
  barClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = ref.current;
    if (!stuck || !bar) return;

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
      // Docked while it rests on the foot of the window; scrolled to its own place in the page, it is not.
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

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      release();
    };
  }, [stuck]);

  return (
    <div
      ref={ref}
      className={cn(
        "group/bar",
        // Out of the page's gutter on a phone (Container's px-5), to both edges of the screen; from sm, paper
        // under and around the card.
        stuck && "sticky bottom-0 z-10 max-sm:-mx-5 sm:bg-paper sm:pb-4 sm:pt-1",
        className,
      )}
    >
      <div
        className={cn(
          "rounded-card border border-line bg-surface px-4 py-3 shadow-lift sm:px-5",
          stuck &&
            "max-sm:rounded-none max-sm:border-x-0 max-sm:px-5 max-sm:group-data-docked/bar:border-b-0 max-sm:group-data-docked/bar:pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          barClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
