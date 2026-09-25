"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/components/ui/cn";

/**
 * The suggestion menu shared by the song and key search boxes.
 *
 * Built rather than using the browser's <datalist>, whose popup cannot be
 * styled and looks out of place. Follows the ARIA combobox pattern: arrows
 * move through the suggestions, Enter picks one, Escape closes the menu.
 *
 * The menu fades and settles into place rather than snapping, and keeps
 * showing its last items while it fades out - so picking a suggestion never
 * flashes an empty box.
 */

export interface Suggestion {
  /** What the search box is set to when this is picked. */
  value: string;
  /** How it is shown in the menu. */
  label: ReactNode;
}

/**
 * Menu state plus the props to spread onto the <input>. Pass an empty list
 * when there is nothing worth suggesting (for example, once the box already
 * holds an exact match) and the menu closes.
 */
export function useSuggestions(
  listId: string,
  suggestions: readonly Suggestion[],
  onPick: (value: string) => void,
) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const visible = open && suggestions.length > 0;

  // Remember what was last on screen, so a closing menu fades out with its
  // items still in it. Updated during render, keyed on the values, which is
  // React's pattern for deriving state from changing props.
  const signature = suggestions.map((suggestion) => suggestion.value).join("\n");
  const [shown, setShown] = useState({ signature: "", items: [] as readonly Suggestion[] });
  if (suggestions.length > 0 && signature !== shown.signature) {
    setShown({ signature, items: suggestions });
  }

  function pick(value: string) {
    onPick(value);
    setOpen(false);
    setActive(-1);
  }

  const inputProps = {
    role: "combobox" as const,
    "aria-expanded": visible,
    "aria-controls": listId,
    "aria-autocomplete": "list" as const,
    "aria-activedescendant": visible && active >= 0 ? `${listId}-${active}` : undefined,
    onFocus: () => setOpen(true),
    onClick: () => setOpen(true),
    onBlur: () => {
      setOpen(false);
      setActive(-1);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      const count = suggestions.length;
      if (event.key === "ArrowDown" && count > 0) {
        event.preventDefault();
        setOpen(true);
        setActive((index) => (index + 1) % count);
      } else if (event.key === "ArrowUp" && count > 0) {
        event.preventDefault();
        setOpen(true);
        setActive((index) => (index <= 0 ? count - 1 : index - 1));
      } else if (event.key === "Enter" && visible && active >= 0) {
        event.preventDefault();
        pick(suggestions[active].value);
      } else if (event.key === "Escape") {
        // As in a browser's own search box: Escape closes the menu first,
        // and a second Escape clears what was typed.
        if (visible) {
          event.preventDefault();
          setOpen(false);
          setActive(-1);
        } else if (event.currentTarget.value !== "") {
          event.preventDefault();
          onPick("");
        }
      }
    },
  };

  /** Call from the input's onChange: typing reopens the menu. */
  function onType() {
    setOpen(true);
    setActive(-1);
  }

  return {
    visible,
    /** What the menu should render: live items while open, the last ones while closing. */
    items: visible ? suggestions : shown.items,
    active,
    setActive,
    pick,
    inputProps,
    onType,
  };
}

export function SuggestionList({
  listId,
  label,
  items,
  visible,
  active,
  onHover,
  onPick,
  className,
}: {
  listId: string;
  label: string;
  items: readonly Suggestion[];
  visible: boolean;
  active: number;
  onHover: (index: number) => void;
  onPick: (value: string) => void;
  className?: string;
}) {
  return (
    <ul
      id={listId}
      role="listbox"
      aria-label={label}
      aria-hidden={!visible}
      className={cn(
        "absolute z-30 mt-2 max-h-96 origin-top overflow-auto rounded-card border border-line bg-surface py-1.5 shadow-card",
        "[scrollbar-color:var(--color-staff)_transparent] [scrollbar-width:thin]",
        "transition-[opacity,transform,visibility] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        visible
          ? "visible translate-y-0 scale-100 opacity-100"
          : "pointer-events-none invisible -translate-y-1 scale-[0.98] opacity-0",
        className,
      )}
    >
      {items.map((suggestion, index) => (
        <li
          key={suggestion.value}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={visible && index === active}
          // mousedown, not click: it fires before the input's blur closes the menu.
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(suggestion.value);
          }}
          onMouseEnter={() => onHover(index)}
          className={cn(
            "mx-1.5 cursor-pointer rounded-md px-2.5 py-2 text-sm transition-colors duration-150",
            visible && index === active ? "bg-paper text-ink" : "text-ink-soft",
          )}
        >
          {suggestion.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * The × that clears a search box. Always present, so the box never changes
 * width as it appears; it simply fades in once there is something to clear.
 */
export function ClearButton({
  show,
  label,
  onClear,
}: {
  show: boolean;
  label: string;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
      className={cn(
        "mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted",
        "transition-[opacity,transform,color] duration-200 hover:text-ink",
        show ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0",
      )}
    >
      <span className="sr-only">{label}</span>
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10">
        <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/**
 * A suggestion's text with the part that matches what was typed in bold -
 * the usual autocomplete convention. Case-insensitive; the first match only.
 */
export function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  const at = needle === "" ? -1 : text.toLowerCase().indexOf(needle);
  if (at < 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, at)}
      <strong className="font-semibold text-ink">{text.slice(at, at + needle.length)}</strong>
      {text.slice(at + needle.length)}
    </>
  );
}

/** The pill every search box sits in: glass, with a soft gold ring on focus. */
export const searchPillClass =
  "glass relative flex items-center rounded-full transition-shadow duration-200 focus-within:ring-2 focus-within:ring-gold/40";
