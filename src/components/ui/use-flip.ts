"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Smooths a list that is filtered in place: when `trigger` changes, items that
 * stay glide from where they were to where they now are, and items that
 * appear fade up, a few at a time. Items that go simply leave.
 *
 * Mark each animated element with a unique `data-flip` key. Marked elements
 * may be nested (a group and its items): each is measured against the
 * nearest marked ancestor, so a group and its items move together rather
 * than twice over.
 *
 * The technique is FLIP (First, Last, Invert, Play), run with the Web
 * Animations API, so nothing is left in the styles afterwards. Skipped for
 * visitors who ask for reduced motion.
 */

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const MOVE_MS = 340;
const ENTER_MS = 260;
/** Each appearing item starts this much after the one before... */
const STAGGER_MS = 18;
/** ...up to this many, so a long list never keeps you waiting. */
const MAX_STAGGERED = 12;

type Position = { x: number; y: number };

function measure(root: HTMLElement): Map<string, Position> {
  const positions = new Map<string, Position>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-flip]")) {
    const rect = el.getBoundingClientRect();
    const parent = el.parentElement?.closest<HTMLElement>("[data-flip]");
    if (parent && root.contains(parent)) {
      const outer = parent.getBoundingClientRect();
      positions.set(el.dataset.flip!, { x: rect.left - outer.left, y: rect.top - outer.top });
    } else {
      // Page coordinates, so scrolling between two searches changes nothing.
      positions.set(el.dataset.flip!, { x: rect.left + window.scrollX, y: rect.top + window.scrollY });
    }
  }
  return positions;
}

export function useFlip(root: RefObject<HTMLElement | null>, trigger: unknown) {
  const last = useRef<Map<string, Position> | null>(null);

  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;

    const elements = [...container.querySelectorAll<HTMLElement>("[data-flip]")];
    // Settle anything still moving, so positions are read from the layout alone.
    for (const el of elements) for (const animation of el.getAnimations()) animation.cancel();

    const previous = last.current;
    const next = measure(container);
    last.current = next;
    // The first render only takes the measurements the next change starts from.
    if (!previous || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const entering = new Set<HTMLElement>();
    let staggered = 0;
    for (const el of elements) {
      const key = el.dataset.flip!;
      const from = previous.get(key);
      const to = next.get(key)!;

      if (!from) {
        entering.add(el);
        // Inside a group that is itself appearing: the group's fade covers it.
        const parent = el.parentElement?.closest<HTMLElement>("[data-flip]");
        if (parent && entering.has(parent)) continue;
        el.animate(
          [
            { opacity: 0, transform: "translateY(6px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: ENTER_MS, delay: Math.min(staggered++, MAX_STAGGERED) * STAGGER_MS, easing: EASE, fill: "backwards" },
        );
        continue;
      }

      const dx = from.x - to.x;
      const dy = from.y - to.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: MOVE_MS,
        easing: EASE,
      });
    }
    // `root` is a ref: only a change of `trigger` should replay this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  // A resized window reflows the list: start the next change from the new layout.
  useEffect(() => {
    function onResize() {
      if (root.current) last.current = measure(root.current);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [root]);
}
