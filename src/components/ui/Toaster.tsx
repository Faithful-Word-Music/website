"use client";

import { useEffect, useState } from "react";

import { cn } from "./cn";
import { CheckIcon } from "./StatusIcons";
import { onToast, type ToastMessage } from "./toast";

/** How long a message stays, and how long it takes to fade away at the end. */
const VISIBLE_MS = 3500;
const FADE_MS = 250;

/**
 * Shows `toast()` messages: one at a time, under the header, where neither
 * the planner's bottom bars nor a phone's home indicator are in the way. In
 * the root layout, so a message outlives the page change that prompted it.
 */
export function Toaster() {
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(
    () =>
      onToast((next) => {
        setLeaving(false);
        setCurrent(next);
      }),
    [],
  );

  useEffect(() => {
    if (!current) return;
    const fade = setTimeout(() => setLeaving(true), VISIBLE_MS - FADE_MS);
    const remove = setTimeout(() => setCurrent(null), VISIBLE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(remove);
    };
  }, [current]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+4.75rem)] print:hidden"
    >
      {current ? (
        <p
          key={current.id}
          className={cn(
            "animate-enter flex max-w-md items-start gap-2 rounded-card border border-l-2 border-line border-l-gold bg-surface px-4 py-3 text-sm text-ink shadow-lift transition-opacity",
            leaving && "opacity-0",
          )}
        >
          <CheckIcon className="mt-0.5 text-gold-dark" />
          {current.message}
        </p>
      ) : null}
    </div>
  );
}
