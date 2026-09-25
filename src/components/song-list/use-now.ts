"use client";

import { useSyncExternalStore } from "react";

/**
 * The current time, kept live in the browser.
 *
 * The page is rendered on the server and cached for a minute, so the server's
 * idea of "now" goes stale. This clock re-reads the time every 15 seconds and
 * whenever the tab regains focus - so "Next" flips to the following service
 * within seconds of a service starting, with no reload.
 *
 * During hydration it returns the server's render time, so the first browser
 * render matches the HTML exactly; the live time takes over straight after.
 *
 * Development only: add ?now=2026-09-27T10:29:00-07:00 to the URL to pretend
 * it is that moment (the clock then runs on from there).
 */

const TICK_MS = 15_000;
const loadedAt = typeof performance !== "undefined" ? performance.now() : 0;

function readNow(): number {
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    const override = new URLSearchParams(window.location.search).get("now");
    const start = override ? Date.parse(override) : NaN;
    if (!Number.isNaN(start)) return start + (performance.now() - loadedAt);
  }
  return Date.now();
}

let current = typeof window !== "undefined" ? readNow() : 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
  current = readNow();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    tick();
    timer = setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    }
  };
}

export function useNow(serverNow: number): number {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => serverNow,
  );
}

const noopSubscribe = () => () => {};

/** False on the server and during hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
