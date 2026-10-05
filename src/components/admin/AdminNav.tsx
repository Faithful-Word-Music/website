"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/components/ui/cn";
import { usePagePath } from "@/components/ui/use-page-path";

/**
 * Section tabs: the admin area's, the Service Planner's and the Archive's.
 * Only sections the person may use are passed in. The open tab is the one
 * whose address the page is in - the longest match, so /admin/users/x opens
 * People, not Overview, and a service in the planner keeps Plan open.
 *
 * Two ways to fit a phone:
 *
 *   "wrap" (default; Planner, Archive) - never scrolls sideways. The tabs
 *     share the full width, each with its own rule, and wrap onto a second
 *     row if there are too many; `trailing` (the planner's link to the song
 *     list) sits on its own line above them.
 *   "scroll" (Admin, whose seven tabs would wrap) - one row that scrolls
 *     sideways, and says so: the side with more tabs fades out, with a
 *     chevron to page along, and the open tab is brought into view.
 *
 * From `sm` up both are one bar, with `trailing` at the far end.
 */
export function AdminNav({
  items,
  label = "Admin",
  trailing,
  overflow = "wrap",
}: {
  items: Array<{ href: string; label: string; badge?: number }>;
  label?: string;
  trailing?: ReactNode;
  overflow?: "wrap" | "scroll";
}) {
  const pathname = usePagePath();
  const current = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const tabs = items.map((item) => {
    const active = item.href === current;
    return (
      <li
        key={item.href}
        className={cn(
          "flex",
          overflow === "wrap" ? "flex-auto border-b border-line sm:flex-none sm:border-0" : "shrink-0 snap-start",
        )}
      >
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-sm transition-colors sm:px-4",
            overflow === "wrap" && "w-full justify-center sm:w-auto sm:justify-start",
            active ? "text-ink" : "text-muted hover:text-ink",
          )}
        >
          {item.label}
          {item.badge ? (
            <span className="rounded-full bg-ink px-2 py-0.5 text-[0.7rem] font-semibold text-paper">{item.badge}</span>
          ) : null}
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-x-3 h-px bg-gold transition-opacity sm:inset-x-4",
              // Inside a scroller anything past the edge is clipped, so the
              // rule sits on the bar's own line rather than over its border.
              overflow === "scroll" ? "bottom-0" : "-bottom-px",
              active ? "opacity-100" : "opacity-0",
            )}
          />
        </Link>
      </li>
    );
  });

  return (
    <nav
      aria-label={label}
      className={cn("flex flex-col-reverse gap-1 sm:flex-row", overflow === "wrap" && "sm:border-b sm:border-line")}
    >
      {overflow === "scroll" ? (
        <ScrollingTabs current={current}>{tabs}</ScrollingTabs>
      ) : (
        <ul className="flex flex-wrap sm:gap-1">{tabs}</ul>
      )}
      {trailing ? <div className="flex justify-end sm:ml-auto sm:items-center sm:pl-6">{trailing}</div> : null}
    </nav>
  );
}

/** How far the edge fades reach, in px. */
const FADE = 40;

/**
 * One row of tabs that scrolls sideways. A side with more to see fades out
 * and carries a chevron that pages along; the open tab is scrolled into
 * view, so a phone never opens on a page whose tab is off-screen.
 */
function ScrollingTabs({ current, children }: { current: string | undefined; children: ReactNode }) {
  const list = useRef<HTMLUListElement>(null);
  const [more, setMore] = useState({ before: false, after: false });

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const measure = () => {
      const before = element.scrollLeft > 1;
      const after = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setMore((was) => (was.before === before && was.after === after ? was : { before, after }));
    };
    // The observer also reports once straight away, which takes the first measurement.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, []);

  useEffect(() => {
    const element = list.current;
    const tab = element?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!element || !tab) return;
    // Only the row scrolls - never the page.
    const left = tab.offsetLeft - (element.clientWidth - tab.offsetWidth) / 2;
    element.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [current]);

  const page = (direction: 1 | -1) => {
    const element = list.current;
    element?.scrollBy({ left: direction * element.clientWidth * 0.7, behavior: "smooth" });
  };

  const mask = `linear-gradient(to right, ${more.before ? "transparent" : "#000"} 0, #000 ${FADE}px, #000 calc(100% - ${FADE}px), ${more.after ? "transparent" : "#000"} 100%)`;

  return (
    <div className="relative min-w-0 flex-1">
      <ul
        ref={list}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className={cn(
          "flex snap-x snap-proximity scroll-px-10 overflow-x-auto overscroll-x-contain sm:gap-1",
          // The bar's own rule, painted inside it so it stays put as the tabs scroll.
          "shadow-[inset_0_-1px_0_var(--color-line)]",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {children}
      </ul>
      <EdgeChevron side="before" shown={more.before} onClick={() => page(-1)} />
      <EdgeChevron side="after" shown={more.after} onClick={() => page(1)} />
    </div>
  );
}

/**
 * The chevron on a faded edge. Pointer-only: keyboard and screen reader users
 * reach every tab directly, and focusing one scrolls it into view.
 */
function EdgeChevron({ side, shown, onClick }: { side: "before" | "after"; shown: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      onClick={onClick}
      className={cn(
        "absolute inset-y-0 flex w-8 items-center text-muted transition-[opacity,color] hover:text-ink",
        side === "before" ? "left-0 justify-start" : "right-0 justify-end",
        shown ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={side === "before" ? "rotate-180" : undefined}>
        <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
