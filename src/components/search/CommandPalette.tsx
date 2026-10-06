"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { ConductorMark } from "@/components/conductor/ConductorMark";
import { useConductor } from "@/components/conductor/conductor-store";
import { toggleTheme, useTheme } from "@/components/layout/ThemeToggle";
import { NoteMark } from "@/components/library/SongIndex";
import { songLinkProps } from "@/components/song-list/SongLink";
import { Highlight, searchPillClass } from "@/components/song-list/Suggestions";
import { cn } from "@/components/ui/cn";
import { usePagePath } from "@/components/ui/use-page-path";
import { useScrollLock } from "@/components/ui/use-scroll-lock";
import { searchContent } from "@/content/search";
import { requestConductorOpen } from "@/lib/ai/conductor/open";
import {
  type SearchEntry,
  type SearchIndex,
  SHOW_SERVICE_EVENT,
  searchSite,
} from "@/lib/site-search";

import { AvailabilityCommand } from "./AvailabilityCommand";

/**
 * Site search: a palette opened from the header's magnifier, Ctrl/⌘ K or "/".
 *
 * Pages and actions are there at once. Songs, coming services and year recaps
 * come from /api/search, fetched the first time the palette is about to open
 * (hovering or focusing the button starts it) and kept for the visit.
 *
 * WHAT A PERSON IS OFFERED is not decided here. searchSite()
 * (src/lib/site-search.ts) is given who is looking - useAccount().nav, the
 * same permissions the header's links go by - and returns only the pages and
 * commands they may use. This component shows what comes back and carries
 * out what is chosen; it holds no permission check of its own.
 *
 * Two entries are commands rather than places to go:
 *
 *   Ask Conductor: "…"       sends what was typed to Conductor - the one
 *                            shared conversation (conductor-store.ts), asked
 *                            from this page - then closes and opens
 *                            Conductor's own panel to show the answer.
 *   Update my availability…  turns the palette into AvailabilityCommand.
 *
 * Neither does anything Conductor or the Availability page could not, and
 * both end at routes that check permission themselves.
 *
 * Built on <dialog>: showModal() keeps focus inside and the rest of the page
 * inert, Escape closes it, and closing returns focus to where it was. The
 * input and list follow the ARIA combobox pattern, as the song search does.
 */

/** A fetched index is reused for this long before the next open refreshes it. */
const INDEX_FRESH_MS = 5 * 60_000;

let cached: { at: number; request: Promise<SearchIndex | null> } | null = null;

function loadIndex(): Promise<SearchIndex | null> {
  if (cached && Date.now() - cached.at < INDEX_FRESH_MS) return cached.request;
  const request = fetch("/api/search")
    .then((response) => (response.ok ? (response.json() as Promise<SearchIndex>) : null))
    .catch(() => null)
    .then((index) => {
      // A failed load is tried again on the next open, not kept.
      if (!index) cached = null;
      return index;
    });
  cached = { at: Date.now(), request };
  return request;
}

/** "⌘" on Apple devices, "Ctrl" elsewhere (and during server render). */
function useModifierKey() {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/**
 * The palette, and the header button that opens it on wider screens. On
 * phones it is opened from the search bar at the top of the mobile menu
 * (MobileSearchBar). The header owns `open`, so both can open it.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const modifier = useModifierKey();
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Ctrl/⌘ K anywhere; "/" when not already typing somewhere.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault();
        onOpenChange(!openRef.current);
      } else if (event.key === "/" && !event.metaKey && !event.ctrlKey && !isTyping(event.target)) {
        event.preventDefault();
        onOpenChange(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        onPointerEnter={() => void loadIndex()}
        onFocus={() => void loadIndex()}
        aria-haspopup="dialog"
        aria-label={searchContent.openLabel}
        title={`${searchContent.openLabel} (${modifier} K)`}
        className="hidden h-11 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-muted transition-colors hover:bg-paper hover:text-ink nav-wide:inline-flex print:hidden"
      >
        <Magnifier />
        <kbd className="hidden whitespace-nowrap rounded-md border border-line px-1.5 py-0.5 font-sans text-[0.7rem] leading-none text-muted nav-wide:inline-block">
          {modifier} K
        </kbd>
      </button>
      {open ? <Palette onClose={close} /> : null}
    </>
  );
}

/**
 * The search bar at the top of the mobile menu. It looks like the song
 * search's box, but opens the palette, where the typing happens.
 */
export function MobileSearchBar({ onOpen, className }: { onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={() => void loadIndex()}
      onFocus={() => void loadIndex()}
      aria-haspopup="dialog"
      className={cn(searchPillClass, "min-h-12 w-full gap-3 px-4 text-left text-base text-muted", className)}
    >
      <Magnifier />
      {searchContent.placeholder}
    </button>
  );
}

/** The open palette. Mounted only while open, so each opening starts fresh. */
function Palette({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const idPrefix = useId();
  const listId = `${idPrefix}-results`;
  const pathname = usePagePath();
  const [openedOn] = useState(pathname);
  // Where focus was, to return it on close: unmounting skips the dialog's own
  // focus return. Only ever rendered in the browser (it mounts on opening).
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  /** The palette's own steps for a command, in place of the search: only "Update my availability…" has any. */
  const [command, setCommand] = useState<"availability" | null>(null);
  /** What Escape does while a command is showing (one step back); null while searching, when it closes. */
  const commandEscape = useRef<(() => void) | null>(null);
  /** Said above the results when something chosen could not be done. */
  const [notice, setNotice] = useState<string | null>(null);
  const dark = useTheme() === "dark";

  useScrollLock(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Not closed again on cleanup: unmounting removes it, and a "close" event
    // (which fires later) would reach the listener a remount has added.
    if (!dialog.open) dialog.showModal();
    // Escape, or the browser closing it any other way.
    const onNativeClose = () => onClose();
    dialog.addEventListener("close", onNativeClose);
    return () => {
      dialog.removeEventListener("close", onNativeClose);
      // Not into a mobile menu that has since closed (it is inert then).
      if (opener?.isConnected && !opener.closest("[inert]")) opener.focus({ preventScroll: true });
    };
  }, [onClose, opener]);

  useEffect(() => {
    let current = true;
    loadIndex().then((loaded) => {
      if (!current) return;
      setIndex(loaded);
      setFailed(loaded === null);
    });
    return () => {
      current = false;
    };
  }, []);

  // A page change (Back, or a link picked here) closes the palette.
  useEffect(() => {
    if (pathname !== openedOn) onClose();
  }, [pathname, openedOn, onClose]);

  const { nav, userId } = useAccount();
  const results = useMemo(() => searchSite(index, query, dark, nav), [index, query, dark, nav]);
  // The shared conversation, joined only by someone who may use it: the same store the panel and the page show.
  const conductor = useConductor(nav.permissions.has("use_ai") ? userId : null);
  const moreSongsEntry: SearchEntry | null =
    results.moreSongs > 0
      ? {
          id: "more-songs",
          group: "songs",
          label: searchContent.moreSongs.replace(
            "{count}",
            String(results.moreSongs + (results.groups[0]?.entries.length ?? 0)),
          ),
          href: "/library",
        }
      : null;

  // The groups as shown, with the "see all" row closing the Songs group.
  const groups = results.groups.map((group) =>
    group.group === "songs" && moreSongsEntry ? { ...group, entries: [...group.entries, moreSongsEntry] } : group,
  );
  const flat = groups.flatMap((group) => group.entries);
  const activeIndex = Math.min(active, flat.length - 1);
  const optionId = (i: number) => `${idPrefix}-option-${i}`;

  // Keep the highlighted option in view as the arrows move it.
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // optionId only depends on idPrefix, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  function choose(entry: SearchEntry) {
    if (entry.action === "toggle-theme") {
      toggleTheme();
      onClose();
      return;
    }
    if (entry.action === "update-availability") {
      setNotice(null);
      setCommand("availability");
      return;
    }
    if (entry.action === "ask-conductor") {
      // Asked from this page, so "this service" and "this song" mean what they would in the panel.
      if (!conductor.ask(query.trim(), pathname)) {
        setNotice(searchContent.conductor.busy);
        return;
      }
      onClose();
      // The answer is read in Conductor's own panel. (On the Conductor page it is already in view.)
      requestConductorOpen();
      return;
    }
    // Already on the song list: tell it which service to show, as the
    // address change alone does not.
    if (entry.href?.startsWith("/song-list#") && pathname === "/song-list") {
      window.dispatchEvent(new CustomEvent(SHOW_SERVICE_EVENT, { detail: entry.href.split("#")[1] }));
    }
    // Links close the palette themselves once the page changes; a link to the
    // page already open, an external one, or a service here does not change it.
    const leavesPage = entry.href && !entry.external && entry.href.split("#")[0] !== pathname;
    if (!leavesPage) onClose();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const count = flat.length;
    if (count === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((activeIndex + 1) % count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(activeIndex <= 0 ? count - 1 : activeIndex - 1);
    } else if (event.key === "Home" && event.ctrlKey) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && event.ctrlKey) {
      event.preventDefault();
      setActive(count - 1);
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      // Clicking the option itself means Enter behaves exactly as a click:
      // the same link, the same new tab for an external one.
      document.getElementById(optionId(activeIndex))?.click();
    }
  }

  const typed = query.trim();
  const countLabel = searchContent.resultCount[flat.length === 1 ? 0 : 1].replace("{count}", String(flat.length));
  const positionOf = new Map(flat.map((entry, i) => [entry.id, i]));

  return (
    <dialog
      ref={dialogRef}
      aria-label={searchContent.dialogLabel}
      // The dialog fills the viewport; a click on it outside the panel closes.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      // Escape is handled here rather than left to the dialog: Chrome can
      // skip a dialog's own Escape (its "cancel") when there was no click or
      // key press since it opened, which left the palette stuck open.
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          // Inside a command, Escape goes back a step; from the search it closes.
          (commandEscape.current ?? onClose)();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        (commandEscape.current ?? onClose)();
      }}
      className={cn(
        "fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-4 sm:px-6 sm:pt-[12vh]",
        "backdrop:bg-black/45 backdrop:backdrop-blur-[2px]",
      )}
    >
      <div className="animate-enter mx-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-card border border-line bg-surface shadow-lift sm:max-h-[70vh]">
        {command === "availability" ? (
          <AvailabilityCommand onExit={() => setCommand(null)} onClose={onClose} escapeRef={commandEscape} />
        ) : (
          <>
            {/* Search row */}
            <div className="flex items-center gap-3 border-b border-line px-4">
              <span className="text-muted">
                <Magnifier />
              </span>
              <input
                autoFocus
                type="text"
                role="combobox"
                aria-expanded={flat.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
                aria-label={searchContent.dialogLabel}
                placeholder={searchContent.placeholder}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                  setNotice(null);
                }}
                onKeyDown={onKeyDown}
                autoComplete="off"
                spellCheck={false}
                // 16px on phones, so iOS does not zoom in on focus.
                className="min-h-14 w-full min-w-0 bg-transparent text-base text-ink placeholder:text-muted focus:outline-none sm:text-[0.9375rem]"
              />
              <button
                type="button"
                onClick={onClose}
                className="-mr-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink"
              >
                <span className="sr-only">{searchContent.closeLabel}</span>
                {/* The header's closed-menu cross: two fine rules. */}
                <span aria-hidden="true" className="relative block h-4 w-4">
                  <span className="absolute left-0 top-2 block h-px w-4 rotate-45 bg-current" />
                  <span className="absolute left-0 top-2 block h-px w-4 -rotate-45 bg-current" />
                </span>
              </button>
            </div>

            {/* Results */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
              <p role="status" className="sr-only">
                {typed ? countLabel : ""}
              </p>
              {notice ? (
                <p role="alert" className="px-3 py-2 text-sm text-gold-dark">
                  {notice}
                </p>
              ) : null}

              {typed && flat.length === 0 && index ? (
                <div className="px-4 py-12 text-center">
                  <p className="font-display text-xl text-ink">{searchContent.noMatchTitle.replace("{query}", typed)}</p>
                  <p className="mt-2 text-sm text-muted">{searchContent.noMatchBody}</p>
                </div>
              ) : null}

              <div id={listId} role="listbox" aria-label={searchContent.dialogLabel}>
                {groups.map((group) => (
                  <div key={group.group} role="group" aria-labelledby={`${idPrefix}-${group.group}`} className="pb-2">
                    <p
                      id={`${idPrefix}-${group.group}`}
                      className="px-3 pb-1 pt-2 font-display text-sm italic text-muted"
                    >
                      {searchContent.groups[group.group]}
                    </p>
                    {group.entries.map((entry) => {
                      const i = positionOf.get(entry.id) ?? 0;
                      return (
                        <Option
                          key={entry.id}
                          id={optionId(i)}
                          entry={entry}
                          query={typed}
                          selected={i === activeIndex}
                          onHover={() => setActive(i)}
                          onChoose={() => choose(entry)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>

              {!index && !failed && typed ? (
                <p className="px-3 py-3 text-sm text-muted">{searchContent.loading}</p>
              ) : null}
              {failed ? <p className="px-3 py-3 text-sm text-muted">{searchContent.loadError}</p> : null}
            </div>

            {/* Keyboard hints: for keyboards, so not on phones. */}
            <div
              aria-hidden="true"
              className="hidden items-center gap-4 border-t border-line px-4 py-2.5 text-xs text-muted sm:flex"
            >
              <Hint keys={["↑", "↓"]} label={searchContent.hints.move} />
              <Hint keys={["↵"]} label={searchContent.hints.open} />
              <Hint keys={["Esc"]} label={searchContent.hints.close} />
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

/** One result. A link, so it can also be opened in a new tab; a command (the theme, availability, Conductor) is a button-like option. */
function Option({
  id,
  entry,
  query,
  selected,
  onHover,
  onChoose,
}: {
  id: string;
  entry: SearchEntry;
  query: string;
  selected: boolean;
  onHover: () => void;
  onChoose: () => void;
}) {
  const className = cn(
    "relative flex min-h-11 w-full items-center gap-3 rounded-lg py-2 pl-4 pr-3 text-left transition-colors",
    selected ? "bg-gold/10" : "hover:bg-gold/5",
  );
  const content = (
    <>
      {/* The site's barline marker, on the highlighted row. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-1.5 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition-colors",
          selected ? "bg-gold" : "bg-transparent",
        )}
      />
      <OptionBody entry={entry} query={query} />
    </>
  );
  const common = {
    id,
    role: "option" as const,
    "aria-selected": selected,
    tabIndex: -1,
    onMouseMove: onHover,
    className,
  };

  if (!entry.href) {
    return (
      <div {...common} onClick={onChoose}>
        {content}
      </div>
    );
  }

  if (entry.external) {
    const mail = entry.href.startsWith("mailto:");
    return (
      <a {...common} href={entry.href} {...(mail ? {} : { target: "_blank", rel: "noopener" })} onClick={onChoose}>
        {content}
      </a>
    );
  }

  return (
    <Link {...common} href={entry.href} {...(entry.songPage ? songLinkProps : {})} onClick={onChoose}>
      {content}
    </Link>
  );
}

function OptionBody({ entry, query }: { entry: SearchEntry; query: string }): ReactNode {
  if (entry.group === "songs" && entry.id !== "more-songs") {
    // A line of the hymnal's index: title, dotted leader, number.
    return (
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="min-w-0 truncate font-display text-[1.0625rem] text-ink">
          <Highlight text={entry.label} query={query} />
        </span>
        {entry.sheetMusic ? (
          <>
            <NoteMark className="self-center" />
            <span className="sr-only">, {searchContent.sheetMusic}</span>
          </>
        ) : null}
        {entry.number ? (
          <>
            <span aria-hidden="true" className="relative -top-[0.3em] min-w-6 flex-1 border-b-2 border-dotted border-staff" />
            <span className="tnum shrink-0 font-display text-[1.0625rem] text-muted">
              {/* Bolded only when a number was typed ("233", "#233"). */}
              <Highlight
                text={entry.number}
                query={/^(#|no\.?)?\s*\d+[a-z]?$/i.test(query) ? query.replace(/^(#|no\.?)\s*/i, "") : ""}
              />
            </span>
          </>
        ) : null}
      </span>
    );
  }

  if (entry.group === "services") {
    return (
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-ink">{entry.label}</span>
        {entry.detail ? <span className="mt-0.5 block truncate text-xs text-muted">{entry.detail}</span> : null}
      </span>
    );
  }

  if (entry.action === "ask-conductor") {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <ConductorMark size={16} className="shrink-0 text-gold" />
        <span className="truncate text-sm text-ink">{entry.label}</span>
      </span>
    );
  }

  return (
    <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <span className={cn("truncate text-sm", entry.id === "more-songs" ? "text-gold-dark" : "text-ink")}>
        {entry.label}
      </span>
      {entry.external ? (
        <>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-muted">
            <path d="M4.5 2.5h5v5M9.5 2.5 3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {entry.href?.startsWith("mailto:") ? null : <span className="sr-only"> (opens in a new tab)</span>}
        </>
      ) : null}
    </span>
  );
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {keys.map((key) => (
        <kbd key={key} className="rounded border border-line px-1 py-px font-sans text-[0.7rem] leading-none">
          {key}
        </kbd>
      ))}
      {label}
    </span>
  );
}

function Magnifier() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
