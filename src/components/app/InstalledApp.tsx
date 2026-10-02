"use client";

import { useEffect, useState } from "react";

import { PdfViewer } from "@/components/app/PdfViewer";
import { useInstalledAppOnTouch } from "@/components/app/standalone";
import { cn } from "@/components/ui/cn";
import { appContent } from "@/content/app";
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

  const pull = usePullToRefresh(active && pdf === null);

  if (!active) return null;
  return (
    <>
      <PullIndicator {...pull} />
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

/** Pull down at the top of a page, let go past the line, and the app reloads. */
function usePullToRefresh(enabled: boolean) {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

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
      if (current >= PULL_THRESHOLD) {
        start = null;
        setRefreshing(true);
        window.location.reload();
        return;
      }
      reset();
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
  }, [enabled]);

  return { distance, refreshing };
}

/** The chip that comes down from the top while pulling. */
function PullIndicator({ distance, refreshing }: { distance: number; refreshing: boolean }) {
  if (distance === 0 && !refreshing) return null;
  const copy = appContent.pullToRefresh;
  const shown = refreshing ? PULL_THRESHOLD : distance;
  const ready = refreshing || distance >= PULL_THRESHOLD;

  return (
    <div
      aria-hidden={!refreshing}
      role={refreshing ? "status" : undefined}
      style={{ transform: `translate(-50%, ${shown - 32}px)`, opacity: Math.min(1, shown / PULL_THRESHOLD) }}
      className="pointer-events-none fixed left-1/2 top-0 z-[70] flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-soft shadow-card"
    >
      {refreshing ? (
        <span className="size-3.5 animate-spin rounded-full border-2 border-line border-t-ink motion-reduce:animate-none" />
      ) : (
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
      )}
      {refreshing ? copy.refreshing : ready ? copy.release : copy.pull}
    </div>
  );
}
