"use client";

import { useRef, type ReactNode } from "react";

import { cn } from "./cn";
import { useFootClearance } from "./use-foot-clearance";

/**
 * A page's own bar of actions (the planner's Save and Publish, the
 * philosophy's Save changes): it follows the reader down the page, docked to
 * the very bottom of the window - never floating a little above it, where
 * the page would show through underneath.
 *
 * On a phone it is a strip from edge to edge, clear of the home indicator;
 * from `sm` a card on a backing of paper. While it is docked, <html> carries
 * `data-action-bar` and the bar's height, and the floating buttons in the
 * corner move out of its way (useFootClearance).
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
  useFootClearance(ref, stuck);

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
