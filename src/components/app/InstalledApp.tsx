"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { haptic } from "@/components/app/haptic";
import { PdfViewer } from "@/components/app/PdfViewer";
import { useInstalledAppOnTouch } from "@/components/app/standalone";
import { cn } from "@/components/ui/cn";
import { finishNavigationProgress, startNavigationProgress } from "@/components/ui/NavigationProgress";
import { usePagePath } from "@/components/ui/use-page-path";
import { appContent } from "@/content/app";
import { isOpenInApp } from "@/lib/app-only";
import { isPdfPath, PULL_THRESHOLD, pullDistance } from "@/lib/installed-app";

/**
 * What the installed app needs on a phone or tablet that a browser would
 * otherwise give (src/lib/installed-app.ts): a PDF viewer with Close and
 * Save or share, and pull-to-refresh. Renders nothing - and listens to
 * nothing - in a browser, so the website itself is unchanged.
 */
export function InstalledApp() {
  const active = useInstalledAppOnTouch();
  const [pdf, setPdf] = useState<string | null>(null);

  // Any link to one of the site's PDFs opens the viewer instead.
  useEffect(() => {
    if (!active) return;
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (url.origin !== window.location.origin || !isPdfPath(url.pathname)) return;
      event.preventDefault();
      setPdf(url.pathname + url.search);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active]);

  // A refresh fetches the page's data again in place, with the gold loading
  // bar across the top, rather than reloading the whole app: the page stays
  // where it is and there is no blank flash.
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const refreshStarted = useRef(false);
  const refresh = useCallback(() => {
    haptic();
    refreshStarted.current = true;
    startNavigationProgress();
    startRefresh(() => router.refresh());
  }, [router]);

  useEffect(() => {
    if (refreshing || !refreshStarted.current) return;
    refreshStarted.current = false;
    finishNavigationProgress();
  }, [refreshing]);

  // Not on the login, invitation and request-an-account screens: as in a
  // native app's sign-in screen, there is nothing there to refresh, and a
  // pull would only get in the way of the form.
  const path = usePagePath();
  const distance = usePullToRefresh(active && pdf === null && !refreshing && !isOpenInApp(path), refresh);

  if (!active) return null;
  return (
    <>
      <PullIndicator distance={distance} />
      {pdf ? <PdfViewer key={pdf} href={pdf} onClose={() => setPdf(null)} /> : null}
    </>
  );
}

/**
 * Whether a pull starting on this element should refresh: only with the page
 * at the very top, no menu or dialog open, and nothing scrolled inside the
 * part of the page being touched (a list a person is scrolling back up).
 */
function canStartPull(target: EventTarget | null): boolean {
  if (window.scrollY > 1) return false;
  if (document.documentElement.style.overflow === "hidden") return false;
  if (document.querySelector("dialog[open]")) return false;
  for (let element = target instanceof Element ? target : null; element && element !== document.body; element = element.parentElement) {
    if (element.scrollTop > 0) return false;
  }
  return true;
}

/** Pull down at the top of a page and let go past the line to refresh it. */
function usePullToRefresh(enabled: boolean, onRefresh: () => void): number {
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;
    let current = 0;

    function reset() {
      start = null;
      if (current !== 0) {
        current = 0;
        setDistance(0);
      }
    }

    function onStart(event: TouchEvent) {
      const touch = event.touches[0];
      start = event.touches.length === 1 && touch && canStartPull(event.target) ? { x: touch.clientX, y: touch.clientY } : null;
    }

    function onMove(event: TouchEvent) {
      const touch = event.touches[0];
      if (!start || !touch) return;
      const down = touch.clientY - start.y;
      const across = Math.abs(touch.clientX - start.x);
      // Scrolling the page, or a sideways swipe (such as going back): not a pull.
      if (current === 0 && (down < -4 || across > Math.max(down, 10))) {
        reset();
        return;
      }
      current = pullDistance(down);
      setDistance(current);
    }

    function onEnd() {
      if (!start) return;
      const release = current >= PULL_THRESHOLD;
      reset();
      if (release) onRefresh();
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
      setDistance(0);
    };
  }, [enabled, onRefresh]);

  return distance;
}

/** The chip that comes down from the top while pulling; the gold bar takes over once let go. */
function PullIndicator({ distance }: { distance: number }) {
  if (distance === 0) return null;
  const copy = appContent.pullToRefresh;
  const ready = distance >= PULL_THRESHOLD;

  return (
    <div
      aria-hidden="true"
      style={{ transform: `translate(-50%, ${distance - 32}px)`, opacity: Math.min(1, distance / PULL_THRESHOLD) }}
      className="pointer-events-none fixed left-1/2 top-0 z-[70] flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-soft shadow-card"
    >
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        className={cn("transition-transform", ready && "rotate-180")}
      >
        <path d="M8 2.5v11M3.5 9 8 13.5 12.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {ready ? copy.release : copy.pull}
    </div>
  );
}
