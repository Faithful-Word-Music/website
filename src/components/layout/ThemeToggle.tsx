"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/components/ui/cn";
import { THEME_STORAGE_KEY, parseTheme, resolveTheme, type Theme } from "@/lib/theme";

/**
 * The sun / moon button in the header that switches between light and dark.
 *
 * Picking the theme the device already uses clears the saved choice, so the
 * site goes back to following the device - someone who tried dark mode and
 * switched back is not left stuck in light mode after changing their phone
 * to dark later.
 */

const DARK_QUERY = "(prefers-color-scheme: dark)";
/** Fired on window when this tab changes theme, so every toggle re-reads it. */
const CHANGE_EVENT = "themechange";

function systemPrefersDark() {
  return window.matchMedia?.(DARK_QUERY).matches ?? false;
}

function readStored(): Theme | null {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

function apply(stored: Theme | null) {
  const root = document.documentElement;
  if (stored) root.setAttribute("data-theme", stored);
  else root.removeAttribute("data-theme");
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia?.(DARK_QUERY);
  // Another tab changed the theme: follow it here too.
  function onStorage(event: StorageEvent) {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    apply(readStored());
    onChange();
  }
  media?.addEventListener("change", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    media?.removeEventListener("change", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Theme {
  const attribute = parseTheme(document.documentElement.getAttribute("data-theme"));
  return resolveTheme(attribute, systemPrefersDark());
}

export function ThemeToggle({ className }: { className?: string }) {
  // null on the server and during hydration: the theme is only known in the
  // browser, so the icon appears once it is.
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} mode`;

  function toggle() {
    const stored = next === resolveTheme(null, systemPrefersDark()) ? null : next;
    try {
      if (stored) localStorage.setItem(THEME_STORAGE_KEY, stored);
      else localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      // Storage blocked: the switch still works for this page view.
    }
    apply(stored);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme ? label : "Switch theme"}
      title={theme ? label : undefined}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink print:hidden",
        className,
      )}
    >
      {theme && (
        <svg
          key={theme}
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-pop"
        >
          {theme === "dark" ? (
            // Sun: shown in dark mode, for switching to light.
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
            </>
          ) : (
            // Moon: shown in light mode, for switching to dark.
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          )}
        </svg>
      )}
    </button>
  );
}
