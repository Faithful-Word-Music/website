"use client";

import { useEffect } from "react";

import type { ConductorScreenInput, ConductorScreenPart } from "@/lib/ai/conductor/context";

/**
 * What the screens open right now say they show, for Conductor to be told
 * with a question (conductor-store.ts). Each component reports its own part
 * (SCREEN_PARTS in src/lib/ai/conductor/context.ts) while it is mounted and
 * takes it back when it goes, so the parts are always the screen as it is.
 * Nothing is read off the page.
 *
 * It is only ever looked at when a question is asked, so nothing subscribes
 * to it.
 */

const parts = new Map<ConductorScreenPart, { value: unknown }>();

/** Reports a part of what is on screen while the calling component is mounted; null reports nothing. */
export function useConductorScreen<K extends ConductorScreenPart>(part: K, value: ConductorScreenInput[K] | null): void {
  // Compared by content, so a part rebuilt on every render does not re-run the effect.
  const key = value === null ? null : JSON.stringify(value);
  useEffect(() => {
    if (key === null) return;
    const entry = { value: JSON.parse(key) as unknown };
    parts.set(part, entry);
    return () => {
      // A component that replaced this one may already have said what it shows.
      if (parts.get(part) === entry) parts.delete(part);
    };
  }, [part, key]);
}

/** Everything the screen reports right now; undefined when nothing does. */
export function screenSnapshot(): ConductorScreenInput | undefined {
  if (parts.size === 0) return undefined;
  return Object.fromEntries([...parts].map(([part, entry]) => [part, entry.value])) as ConductorScreenInput;
}
