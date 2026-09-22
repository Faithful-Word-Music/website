"use client";

import { useRef } from "react";

import { cn } from "@/components/ui/cn";
import { songListContent } from "@/content/song-list";

/**
 * Month switcher, rendered only when the spreadsheet has two visible tabs.
 *
 * Follows the ARIA tabs pattern with roving tabindex: one stop in the tab
 * order, arrows move between months, Home/End jump to the ends.
 */
export function MonthTabs({
  titles,
  activeIndex,
  onChange,
  idPrefix,
}: {
  titles: string[];
  activeIndex: number;
  onChange: (index: number) => void;
  idPrefix: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusTab(index: number) {
    onChange(index);
    refs.current[index]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = titles.length - 1;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusTab(index === last ? 0 : index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusTab(index === 0 ? last : index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(last);
        break;
      default:
        break;
    }
  }

  return (
    <div
      role="tablist"
      aria-label={songListContent.monthTabsLabel}
      className="inline-flex rounded-full border border-line bg-surface p-1"
    >
      {titles.map((title, index) => {
        const selected = index === activeIndex;
        return (
          <button
            key={title}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${index}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${index}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "min-h-10 rounded-full px-5 text-sm font-medium transition-colors",
              selected
                ? "bg-ink text-paper"
                : "text-muted hover:text-ink",
            )}
          >
            {title}
          </button>
        );
      })}
    </div>
  );
}
