"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { usePagePath } from "@/components/ui/use-page-path";
import { PAGE_HISTORY_KEY, backTarget, findOrigin, recordVisit } from "@/lib/page-origin";

/**
 * The site's back links, and the per-tab page history they read
 * (src/lib/page-origin.ts). The history lives in sessionStorage, so it
 * belongs to this tab and survives a reload but not a new tab.
 */

const CHANGED = "fwm:page-history-changed";

function readHistory(): string {
  try {
    return sessionStorage.getItem(PAGE_HISTORY_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parse(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

/** In the root layout: records every page visited in this tab. Renders nothing. */
export function PageHistoryTracker() {
  const pathname = usePagePath();

  useEffect(() => {
    try {
      const next = recordVisit(parse(readHistory()), pathname + window.location.search);
      sessionStorage.setItem(PAGE_HISTORY_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(CHANGED));
    } catch {
      // Storage blocked: back links use their fallbacks.
    }
  }, [pathname]);

  return null;
}

/**
 * Where "back" leads from this page, and what to call it: the page the
 * visitor came from in this tab, or `fallback` when there is none (a link
 * opened from outside, a bookmark, a typed address). The server can't know
 * where someone came from, so it renders the fallback.
 */
export function useBackTarget(fallback: string, options: { skipSongPages?: boolean } = {}): { href: string; label: string } {
  const pathname = usePagePath();
  const raw = useSyncExternalStore(subscribe, readHistory, () => "[]");
  return backTarget(findOrigin(parse(raw), pathname, options), fallback);
}

/** The same, as a button-styled link - for pages whose main way on is back (no access, not found). */
export function BackButton({
  fallback,
  variant = "primary",
  size = "md",
}: {
  fallback: string;
  variant?: "primary" | "secondary";
  size?: "md" | "lg";
}) {
  const { href, label } = useBackTarget(fallback);
  return (
    <Link href={href} className={buttonClasses(variant, size)}>
      {label}
    </Link>
  );
}

/**
 * "← Back to …", leading to the page the visitor came from in this tab, or
 * to `fallback` (the page's natural parent) when there is none.
 */
export function BackLink({
  fallback,
  skipSongPages = false,
  className,
}: {
  /** Where to go with no history, e.g. "/song-list". Named automatically. */
  fallback: string;
  /** For song pages: pass over other song pages to where the visitor started. */
  skipSongPages?: boolean;
  className?: string;
}) {
  const { href, label } = useBackTarget(fallback, { skipSongPages });

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink",
        className,
      )}
    >
      <span aria-hidden="true">←</span>
      {label}
    </Link>
  );
}
