"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { startNavigationProgress } from "./NavigationProgress";
import { pageLinkOf, setLeaveGuard } from "./page-link";

/** Where someone was going when the guard stopped them. */
type Destination = { kind: "page"; href: string } | { kind: "history"; key: string };

/** The parts of the Navigation API used here (not yet in every TypeScript DOM library). */
interface NavigateEventLike extends Event {
  navigationType: "push" | "replace" | "reload" | "traverse";
  destination: { url: string; key: string };
}
interface NavigationLike extends EventTarget {
  traverseTo(key: string): unknown;
}

function navigationApi(): NavigationLike | null {
  return (window as unknown as { navigation?: NavigationLike }).navigation ?? null;
}

/**
 * Keeps unsaved work from being lost by leaving the page. While `active`,
 * every way out asks first:
 *
 *   - a link to another page of the site (header, footer, back link, search),
 *     and anything that changes page through leaveBlocked(): stopped, and
 *     `pending` turns true so the page can ask in the site's own dialog -
 *     then `leave()` goes where they were going, or `stay()` forgets it;
 *   - the browser's Back and Forward: the same, through the Navigation API
 *     where the browser has it (it is the one way to cancel them; without it
 *     they are not stopped, rather than faking it with history entries the
 *     router does not know about);
 *   - reloading, closing the tab or window (or the installed app), or leaving
 *     the site: the browser's own "Leave site?" prompt, which is all a page is
 *     allowed there.
 *
 * A link that opens a new tab is left alone - this page stays as it is.
 * Not `active`, it listens to nothing: saving simply switches it off.
 */
export function useUnsavedGuard(active: boolean): { pending: boolean; stay: () => void; leave: () => void } {
  const router = useRouter();
  const [destination, setDestination] = useState<Destination | null>(null);
  /** Leaving was confirmed: let that one move through. */
  const confirmed = useRef(false);

  useEffect(() => {
    if (!active) return;
    confirmed.current = false;

    const ask = (href: string) => {
      if (confirmed.current) return false;
      setDestination({ kind: "page", href });
      return true;
    };
    const release = setLeaveGuard(ask);

    // On window, in the capture phase: ahead of the link's own handler (and
    // of the page-loading bar), so a stopped click starts nothing.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const url = pageLinkOf(event);
      if (!url || !ask(url.pathname + url.search + url.hash)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!confirmed.current) event.preventDefault();
    };

    const navigation = navigationApi();
    const onNavigate = (event: Event) => {
      const navigate = event as NavigateEventLike;
      if (confirmed.current || navigate.navigationType !== "traverse" || !navigate.cancelable) return;
      // Back to a #section of this same page loses nothing.
      if (new URL(navigate.destination.url).pathname === window.location.pathname) return;
      navigate.preventDefault();
      setDestination({ kind: "history", key: navigate.destination.key });
    };

    window.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    navigation?.addEventListener("navigate", onNavigate);
    return () => {
      release();
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      navigation?.removeEventListener("navigate", onNavigate);
    };
  }, [active]);

  const stay = useCallback(() => setDestination(null), []);

  const leave = useCallback(() => {
    if (!destination) return;
    confirmed.current = true;
    setDestination(null);
    if (destination.kind === "history") {
      navigationApi()?.traverseTo(destination.key);
    } else {
      startNavigationProgress();
      router.push(destination.href);
    }
  }, [destination, router]);

  return { pending: active && destination !== null, stay, leave };
}
