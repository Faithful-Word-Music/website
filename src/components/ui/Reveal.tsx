"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "./cn";

/**
 * Fades content up as it is scrolled into view.
 *
 * The rule, which is what keeps this from being annoying:
 *
 *   already on screen when it mounts -> appear at once, no animation
 *   below the fold                   -> fade up when scrolled to
 *
 * That single rule means content never animates in behind the page transition,
 * nobody waits to read something already in front of them, and the song list's
 * search filter needs no special handling - filtered results render on screen,
 * so they appear instantly instead of re-animating on every keystroke.
 *
 * Only wrap content that is normally below the fold. Wrapping a page heading
 * gains nothing (the rule would show it instantly anyway) and would leave it
 * hidden until hydration.
 *
 * Revealing is done by setting data attributes on the node rather than through
 * React state. The reveal is purely a visual concern, so there is no reason to
 * re-render - which matters on the song list, where a dozen or more of these
 * are on screen at once.
 */

/** One observer shared by every Reveal on the page, rather than one each. */
let sharedObserver: IntersectionObserver | null = null;
const handlers = new WeakMap<Element, (entry: IntersectionObserverEntry) => void>();

function getObserver(): IntersectionObserver | null {
  if (sharedObserver) return sharedObserver;
  if (typeof IntersectionObserver === "undefined") return null;

  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) handlers.get(entry.target)?.(entry);
    },
    // Pulling the bottom edge in slightly means an element reveals once it is
    // properly on screen, not as its first pixel appears.
    { rootMargin: "0px 0px -8% 0px", threshold: 0 },
  );

  return sharedObserver;
}

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Stagger, in milliseconds. For groups that come into view together. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Already revealed: nothing to do, and re-observing would be wasteful.
    if (node.dataset.revealed === "true") return;

    // Tells the stylesheet that JavaScript is driving, which cancels the
    // failsafe that would otherwise reveal everything after 800ms.
    document.documentElement.classList.add("motion-ready");

    function reveal(node: HTMLDivElement, instantly: boolean) {
      if (instantly) {
        node.dataset.instant = "true";
      } else if (delay > 0) {
        node.style.transitionDelay = `${delay}ms`;
      }
      node.dataset.revealed = "true";
    }

    const prefersReducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const observer = getObserver();

    // Honour the visitor's motion preference in JS as well as in CSS, so the
    // behaviour survives any future change to the stylesheet.
    if (prefersReducedMotion || !observer) {
      reveal(node, true);
      return;
    }

    // The observer always delivers one callback shortly after observe(). If the
    // element is already intersecting in that first callback, it was on screen
    // when it mounted, so it should appear rather than animate.
    let isFirstCallback = true;

    handlers.set(node, (entry) => {
      if (entry.isIntersecting) {
        reveal(node, isFirstCallback);
        observer.unobserve(node);
        handlers.delete(node);
      }
      isFirstCallback = false;
    });

    observer.observe(node);

    return () => {
      observer.unobserve(node);
      handlers.delete(node);
    };
  }, [delay]);

  return (
    <div ref={ref} className={cn("reveal", className)} data-revealed="false">
      {children}
    </div>
  );
}
