"use client";

import { useEffect } from "react";

/**
 * Clerk focuses its first field as soon as its form loads. On a short
 * window that field starts below the fold, so the browser jumps down to it -
 * and someone arriving from the footer's "Log in!" lands with the page heading
 * cut off instead of at the top.
 *
 * Arriving on this page should always mean starting at the top, so any jump
 * caused by that automatic focus is undone - whether Clerk focuses before
 * this runs (its script is often cached) or after. The field keeps its focus,
 * so typing still works at once. Once the visitor clicks, taps or types,
 * their own scrolling is never touched.
 */
export function KeepScrollOnAutofocus() {
  useEffect(() => {
    const openedAt = performance.now();

    function toTop() {
      requestAnimationFrame(() => {
        if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
      });
    }
    function stop() {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("pointerdown", stop, true);
      document.removeEventListener("keydown", stop, true);
    }
    function onFocusIn(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest(".cl-rootBox")) return;
      if (performance.now() - openedAt < 3000) toTop();
      stop();
    }

    // Clerk may already have focused its field before this ran.
    if (document.activeElement instanceof HTMLElement && document.activeElement.closest(".cl-rootBox")) {
      toTop();
      return;
    }

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("pointerdown", stop, true);
    document.addEventListener("keydown", stop, true);
    return stop;
  }, []);

  return null;
}
