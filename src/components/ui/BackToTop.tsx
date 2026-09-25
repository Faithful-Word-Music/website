"use client";

import { useSyncExternalStore } from "react";

import { cn } from "./cn";

/**
 * A floating "Back to top" button for long pages.
 *
 * Fades in once the visitor is more than about a screen down, and takes them
 * to the very top of the page - smoothly, unless they prefer reduced motion.
 * Keyboard focus moves to the top of the page too, so the next Tab starts from
 * there rather than from the button at the bottom.
 */

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

const isScrolledDown = () => window.scrollY > window.innerHeight;

export function BackToTop({ label = "Back to top" }: { label?: string }) {
  const visible = useSyncExternalStore(subscribe, isScrolledDown, () => false);

  function toTop() {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });

    const main = document.getElementById("main");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
    }
  }

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label={label}
      title={label}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={cn(
        "glass fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full text-ink sm:bottom-8 sm:right-8 print:hidden",
        "transition-[opacity,transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:ring-2 hover:ring-gold/40",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 13V3M3.5 7.5L8 3l4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
