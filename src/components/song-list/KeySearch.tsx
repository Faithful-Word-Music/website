"use client";

import { useId, useRef } from "react";

import {
  ClearButton,
  Highlight,
  searchPillClass,
  SuggestionList,
  useSuggestions,
} from "@/components/song-list/Suggestions";
import { songListContent } from "@/content/song-list";
import { keyMatches, normalizeKey } from "@/lib/song-list";

/**
 * A small search box for the musical key, beside the main search.
 *
 * Typed rather than picked from a list, so it stays short however many keys
 * the schedule ever uses. While focused it suggests the keys actually present,
 * narrowed as you type. Matching is forgiving: "Ab", "A♭" and "A flat" are the
 * same; see keyMatches().
 */
export function KeySearch({
  value,
  onChange,
  inputId,
  keys,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  inputId: string;
  /** The keys present in the list, already in musical order. */
  keys: readonly string[];
  describedBy?: string;
}) {
  const { search } = songListContent;
  const listId = `${useId()}-keys`;
  const inputRef = useRef<HTMLInputElement>(null);

  const typed = normalizeKey(value);
  const matches = keys.filter(
    (key) => typed === "" || normalizeKey(key).startsWith(typed) || keyMatches(key, value),
  );
  // Nothing to suggest once the box already holds exactly one of the keys.
  const exact = matches.length === 1 && normalizeKey(matches[0]) === typed;
  const suggestions = exact
    ? []
    : matches.map((key) => ({ value: key, label: <Highlight text={key} query={value} /> }));
  const menu = useSuggestions(listId, suggestions, onChange);

  return (
    <div className="relative w-28 shrink-0 sm:w-36">
      <label htmlFor={inputId} className="sr-only">
        {search.keyLabel}
      </label>
      <div className={searchPillClass}>
        <SharpIcon />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          {...menu.inputProps}
          aria-describedby={describedBy}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            menu.onType();
          }}
          placeholder={search.keyPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="min-h-11 w-full min-w-0 bg-transparent pl-2 text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        <ClearButton
          show={value !== ""}
          label={search.keyClear}
          onClear={() => {
            onChange("");
            inputRef.current?.focus();
          }}
        />
      </div>

      <SuggestionList
        listId={listId}
        label={search.keyLabel}
        items={menu.items}
        visible={menu.visible}
        active={menu.active}
        onHover={menu.setActive}
        onPick={menu.pick}
        className="tnum right-0 w-full min-w-36"
      />
    </div>
  );
}

/** A sharp sign, drawn rather than typed so it renders the same everywhere. */
function SharpIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="16"
      viewBox="0 0 14 16"
      fill="none"
      className="ml-4 shrink-0 text-muted"
    >
      <path d="M5 1.5v13M9.5 1v13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2 6.2l10-2M2 11.2l10-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
