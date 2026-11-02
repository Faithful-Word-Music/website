"use client";

import { useCallback, useEffect, useState, type ComponentPropsWithoutRef, type Ref } from "react";

import { cn } from "./cn";

/**
 * A scrolling panel whose edges show a soft shadow while there is more to
 * scroll past them: at the top once it has scrolled down, at the bottom until
 * it reaches the end. A panel that fits shows neither.
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
  const [edges, setEdges] = useState({ top: false, bottom: false, scrollbar: 0 });
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
        top: scrollTop > 1,
        bottom: scrollTop + clientHeight < scrollHeight - 1,
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

  const shadow = "pointer-events-none absolute left-0 z-10 h-8 transition-opacity duration-200 motion-reduce:transition-none";
  return (
    <div className={cn("relative", wrapperClassName)}>
      <div ref={attach} className={className} {...props}>
        {children}
      </div>
      <div
        aria-hidden="true"
        className={cn(shadow, "top-0 bg-linear-to-b from-(--scroll-shadow) to-transparent", edges.top ? "opacity-100" : "opacity-0")}
        style={{ right: edges.scrollbar }}
      />
      <div
        aria-hidden="true"
        className={cn(shadow, "bottom-0 bg-linear-to-t from-(--scroll-shadow) to-transparent", edges.bottom ? "opacity-100" : "opacity-0")}
        style={{ right: edges.scrollbar }}
      />
    </div>
  );
}
