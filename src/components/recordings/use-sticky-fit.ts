"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * The `top` for a sticky panel that may be taller than the screen. A panel
 * that fits sticks at `preferred`. A taller one gets a negative top, so it
 * scrolls with the page until its bottom is in view and then stays put -
 * nothing at its bottom is ever out of reach.
 */
export function useStickyFit<T extends HTMLElement>(preferred = 96, gap = 16): [RefObject<T | null>, number | undefined] {
  const ref = useRef<T>(null);
  const [top, setTop] = useState<number>();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setTop(Math.min(preferred, window.innerHeight - element.offsetHeight - gap));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [preferred, gap]);

  return [ref, top];
}
