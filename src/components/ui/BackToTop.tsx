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
        // Solid, with a border and a lifted shadow: frosted glass all but
        // vanished against the paper background.
        "group fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-lift sm:bottom-8 sm:right-8 print:hidden",
        "transition-[opacity,transform,box-shadow,border-color] duration-300",
        "hover:-translate-y-0.5 hover:border-gold active:translate-y-0 active:scale-95",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        // Steps aside for the song list's share bar, which takes the bottom of the screen.
        "[:root[data-share-bar]_&]:invisible",
      )}
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="transition-transform duration-300 group-hover:-translate-y-0.5"
      >
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
