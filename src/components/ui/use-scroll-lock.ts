"use client";

import { useEffect } from "react";

/**
 * Locks the page while `active` - for overlays such as the mobile menu and the
 * search palette.
 *
 * `overflow: hidden` on <body> is the usual suggestion and it does not hold
 * on iOS Safari. Pinning the body with `position: fixed` and an offsetting
 * `top` does, and keeps the visual position identical.
 *
 * Restoring uses `behavior: "instant"` on purpose: globals.css sets
 * `html { scroll-behavior: smooth }`, so a plain scrollTo would visibly
 * animate the page back to where it already was.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const scrollY = window.scrollY;
    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      window.scrollTo({ top: scrollY, behavior: "instant" });
    };
  }, [active]);
}
