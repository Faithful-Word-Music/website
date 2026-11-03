"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "./cn";
import { CountBadge } from "./CountBadge";

/**
 * Tabs: a row of labels over one panel at a time, set like SectionNav - text
 * on a hairline, the selected one darker with a short gold bar on the line.
 * For switching views WITHIN a page (a dashboard section's "This week ·
 * Next week"). Navigation between pages is SectionNav, with real links.
 *
 * The ARIA tabs pattern, with automatic activation:
 *   - Tab moves into the row once (to the selected tab) and on to the panel;
 *   - Left/Right move along the row and select as they go, wrapping;
 *   - Home/End jump to the first and last.
 *
 * Narrow screens: the row scrolls sideways rather than wrapping, without a
 * scrollbar, and the selected tab is brought into view whenever it changes
 * (only the row scrolls - never the page).
 *
 * The set of tabs may change while it is shown (a tab added or taken away as
 * data arrives). If the selected tab goes, the first one is selected; if a
 * focused tab goes, focus moves to the selected one rather than being lost.
 *
 * With one tab there is nothing to switch between: only its panel is shown,
 * with no row. With none, nothing.
 *
 * Uncontrolled with `defaultValue`, or controlled with `value` and
 * `onValueChange`.
 */

export type TabItem = {
  id: string;
  label: ReactNode;
  /** A count beside the label (CountBadge); `badgeLabel` says what it counts. */
  badge?: number;
  badgeLabel?: string;
  content: ReactNode;
};

/**
 * Where a key press on a tab moves to, or null for a key that is not the
 * row's. Left/Right wrap around; Home/End go to the ends.
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** The tab to show: the asked-for one while it exists, else the first. */
export function resolveTab(tabs: readonly { id: string }[], wanted: string | undefined): string | undefined {
  return tabs.some((tab) => tab.id === wanted) ? wanted : tabs[0]?.id;
}

export function Tabs({
  label,
  tabs,
  value,
  defaultValue,
  onValueChange,
  className,
  panelClassName,
}: {
  /** What the row of tabs is for, read out with it. */
  label: string;
  tabs: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  className?: string;
  panelClassName?: string;
}) {
  const baseId = useId();
  const [own, setOwn] = useState(defaultValue);
  const selected = resolveTab(tabs, value ?? own);
  const listRef = useRef<HTMLDivElement>(null);
  /** Whether focus was last inside the row: if its tab is removed, focus is put back. */
  const focusInside = useRef(false);

  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = (id: string) => `${baseId}-panel-${id}`;

  function select(id: string) {
    if (value === undefined) setOwn(id);
    if (id !== selected) onValueChange?.(id);
  }

  // Bring the selected tab into view in the row - the row only, never the page.
  useLayoutEffect(() => {
    const list = listRef.current;
    const tab = selected ? list?.querySelector<HTMLElement>(`#${CSS.escape(tabId(selected))}`) : null;
    if (!list || !tab) return;
    // The row is positioned, so a tab's offsetLeft is measured from it.
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
    // tabId only depends on baseId, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, tabs.length]);

  // A focused tab that was taken away leaves focus nowhere: put it on the selected tab.
  const idsKey = tabs.map((tab) => tab.id).join("\u0000");
  useEffect(() => {
    if (!focusInside.current || !selected) return;
    const active = document.activeElement;
    if (active && active !== document.body && listRef.current?.contains(active)) return;
    if (active && active !== document.body) {
      focusInside.current = false;
      return;
    }
    document.getElementById(tabId(selected))?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, selected]);

  if (tabs.length === 0 || !selected) return null;

  const current = tabs.find((tab) => tab.id === selected)!;

  if (tabs.length === 1) {
    return (
      <div className={className}>
        <div className={panelClassName}>{current.content}</div>
      </div>
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextTabIndex(event.key, index, tabs.length);
    if (next === null) return;
    event.preventDefault();
    const tab = tabs[next];
    select(tab.id);
    document.getElementById(tabId(tab.id))?.focus();
  }

  return (
    <div className={className}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        aria-orientation="horizontal"
        onFocus={() => {
          focusInside.current = true;
        }}
        onBlur={(event) => {
          // Moving to something else: forget. A removed tab blurs with nowhere to go (null): remember.
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) focusInside.current = false;
        }}
        className="relative flex gap-x-7 overflow-x-auto overscroll-x-contain border-b border-line [scrollbar-width:none] sm:gap-x-8 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, index) => {
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={isSelected ? panelId(tab.id) : undefined}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "group relative inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap text-[0.95rem] transition-colors",
                isSelected ? "font-medium text-ink" : "text-muted hover:text-ink",
              )}
            >
              {tab.label}
              {tab.badge ? <CountBadge count={tab.badge} label={tab.badgeLabel} /> : null}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-0 bottom-0 h-0.5 rounded-full transition-colors",
                  isSelected ? "bg-gold" : "bg-transparent group-hover:bg-staff",
                )}
              />
            </button>
          );
        })}
      </div>
      {/* Only the selected panel is in the page; tabindex lets a panel with nothing focusable be reached. */}
      <div
        key={current.id}
        id={panelId(current.id)}
        role="tabpanel"
        aria-labelledby={tabId(current.id)}
        tabIndex={0}
        className={cn("pt-5 focus-visible:outline-offset-4", panelClassName)}
      >
        {current.content}
      </div>
    </div>
  );
}
