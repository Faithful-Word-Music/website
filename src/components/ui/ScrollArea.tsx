"use client";

import { useCallback, useEffect, useState, type ComponentPropsWithoutRef, type Ref } from "react";

import { cn } from "./cn";

/** How far from an end the shadow takes to reach full strength. */
const FADE_PX = 40;

/** How strong a shadow is with `distance` px left to scroll on its side: 0 to 1, eased, in steps of 0.05. */
function strength(distance: number): number {
  const t = Math.min(1, Math.max(0, distance / FADE_PX));
  const eased = 1 - (1 - t) ** 2;
  return Math.round(eased * 20) / 20;
}

/**
 * A scrolling panel whose edges show a soft shadow while there is more to
 * scroll past them: at the top once it has scrolled down, at the bottom until
 * it reaches the end. A panel that fits shows neither.
 *
 * Each shadow follows the scroll rather than switching on: it deepens over
 * the first FADE_PX scrolled from an end (and lightens over the last FADE_PX
 * before one), so it eases in and out under the finger instead of popping.
 * The gradient itself falls away on a curve, not a straight line, so the
 * edge reads as depth rather than a dark band.
 *
 * `className` and the other props go on the scrolling element itself (give it
 * `overflow-y-auto` and any height limit); `wrapperClassName` on the box that
 * holds it and the shadows (in a flex column, `flex min-h-0 flex-1 flex-col`,
 * with `min-h-0 flex-1` on the scroller).
 */
export function ScrollArea({
  ref,
  className,
  wrapperClassName,
  children,
  ...props
}: ComponentPropsWithoutRef<"div"> & { ref?: Ref<HTMLDivElement>; wrapperClassName?: string }) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ top: 0, bottom: 0, scrollbar: 0 });
  // Ours and the caller's ref, both.
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      setNode(element);
      if (typeof ref === "function") ref(element);
      else if (ref) ref.current = element;
    },
    [ref],
  );

  useEffect(() => {
    if (!node) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const { scrollTop, scrollHeight, clientHeight, offsetWidth, clientWidth } = node;
      const next = {
        top: strength(scrollTop),
        bottom: strength(scrollHeight - clientHeight - scrollTop),
        // The shadows stop short of a scrollbar that takes room, so it stays crisp.
        scrollbar: Math.max(0, offsetWidth - clientWidth - node.clientLeft * 2),
      };
      setEdges((last) =>
        last.top === next.top && last.bottom === next.bottom && last.scrollbar === next.scrollbar ? last : next,
      );
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(measure);
    };

    // The panel and what is in it: either growing or shrinking moves the end.
    const resize = new ResizeObserver(schedule);
    const observeChildren = () => {
      resize.disconnect();
      resize.observe(node);
      for (const child of Array.from(node.children)) resize.observe(child);
      schedule();
    };
    const mutation = new MutationObserver(observeChildren);
    mutation.observe(node, { childList: true });
    observeChildren();
    node.addEventListener("scroll", schedule, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      node.removeEventListener("scroll", schedule);
    };
  }, [node]);

  // A short transition only smooths jumps (content changing size, a scroll by the keyboard); while
  // scrolling, the strength itself follows the finger.
  const shadow = "pointer-events-none absolute left-0 z-10 h-10 transition-opacity duration-150 ease-out motion-reduce:transition-none";
  // Falls away on a curve: most of the depth right at the edge, a long soft tail.
  const curve = (direction: "bottom" | "top") =>
    `linear-gradient(to ${direction}, var(--scroll-shadow), color-mix(in srgb, var(--scroll-shadow) 45%, transparent) 30%, color-mix(in srgb, var(--scroll-shadow) 15%, transparent) 65%, transparent)`;
  return (
    <div className={cn("relative", wrapperClassName)}>
      <div ref={attach} className={className} {...props}>
        {children}
      </div>
      <div
        aria-hidden="true"
        className={cn(shadow, "top-0")}
        style={{ right: edges.scrollbar, opacity: edges.top, backgroundImage: curve("bottom") }}
      />
      <div
        aria-hidden="true"
        className={cn(shadow, "bottom-0")}
        style={{ right: edges.scrollbar, opacity: edges.bottom, backgroundImage: curve("top") }}
      />
    </div>
  );
}
