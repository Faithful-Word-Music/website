"use client";

import { useId, useMemo, useRef } from "react";

import {
  ClearButton,
  Highlight,
  searchPillClass,
  SuggestionList,
  useSuggestions,
} from "@/components/song-list/Suggestions";
import { cn } from "@/components/ui/cn";
import { songListContent } from "@/content/song-list";
import { matchesSong, songKey } from "@/lib/song-list";

/** A song the search box can suggest. */
export interface SongOption {
  number: string | null;
  title: string;
}

/** How many suggestions to show at most; typing more narrows them. */
const MAX_SUGGESTIONS = 8;

/**
 * Search control, with suggestions from the songs in the list.
 *
 * Focusing the empty box already suggests songs - the first few of `songs`,
 * so callers pass them in the order most worth offering (the upcoming
 * services, or the most sung). Typing narrows to matching titles and numbers.
 */
export function SongSearch({
  value,
  onChange,
  inputId,
  songs = [],
  describedBy,
  label,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  inputId: string;
  /** Songs to suggest from, most relevant first. Each distinct title appears once. */
  songs?: readonly SongOption[];
  describedBy?: string;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  const { search } = songListContent;
  const listId = `${useId()}-songs`;
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const needle = value.trim();
    const typedKey = songKey(needle);
    // Bold a hymnal number only when a number was typed ("233", "#233").
    const numberNeedle = /^(#|no\.?)?\s*\d+[a-z]?$/i.test(needle)
      ? needle.replace(/^(#|no\.?)\s*/i, "")
      : "";
    const seen = new Set<string>();
    const found: Array<SongOption & { rank: number; order: number }> = [];

    for (const song of songs) {
      const id = songKey(song.title);
      if (seen.has(id)) continue;
      if (needle !== "" && !matchesSong({ ...song, keys: [] }, { query: needle, key: "" })) continue;
      seen.add(id);
      // Titles that start with what was typed come first, then the rest.
      found.push({ ...song, rank: needle !== "" && !id.startsWith(typedKey) ? 1 : 0, order: found.length });
    }

    // Once the box holds a title exactly, there is nothing left to suggest.
    if (needle !== "" && found.length === 1 && songKey(found[0].title) === typedKey) return [];

    return found
      .sort((a, b) => a.rank - b.rank || a.order - b.order)
      .slice(0, MAX_SUGGESTIONS)
      .map((song) => ({
        value: song.title,
        label: (
          <span className="flex items-baseline gap-3">
            <span className="tnum w-8 shrink-0 text-right text-xs font-medium text-muted">
              <Highlight text={song.number ?? ""} query={numberNeedle} />
            </span>
            <span className="min-w-0 truncate">
              <Highlight text={song.title} query={needle} />
            </span>
          </span>
        ),
      }));
  }, [songs, value]);

  const menu = useSuggestions(listId, suggestions, onChange);

  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <label htmlFor={inputId} className="sr-only">
        {label ?? search.label}
      </label>
      <div className={searchPillClass}>
        <span aria-hidden="true" className="pl-4 text-muted">
          {/* A magnifier drawn as a simple glyph keeps the bundle free of an icon set. */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          {...menu.inputProps}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            menu.onType();
          }}
          placeholder={placeholder ?? search.placeholder}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck={false}
          className="min-h-11 w-full min-w-0 bg-transparent px-3 text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        <ClearButton
          show={value !== ""}
          label={search.clear}
          onClear={() => {
            onChange("");
            inputRef.current?.focus();
          }}
        />
      </div>

      <SuggestionList
        listId={listId}
        label={label ?? search.label}
        items={menu.items}
        visible={menu.visible}
        active={menu.active}
        onHover={menu.setActive}
        onPick={menu.pick}
        className="left-0 w-full min-w-64"
      />
    </div>
  );
}
