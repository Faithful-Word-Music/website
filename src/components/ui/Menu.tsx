"use client";

import { type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/components/ui/cn";
import { usePopover } from "@/components/ui/popover/usePopover";

/**
 * A small menu that opens against the button that owns it: the share menu on
 * a service card, and the sheet music types beside "Sheet music for this
 * service". Render it to open it, and stop rendering it to close.
 *
 * It is portalled to <body> and placed against the button, so no card that
 * follows - or the page's own stacking - can cover it. Inside an open dialog
 * it goes into that dialog instead: a dialog is in the top layer, and anything
 * under <body> would sit behind it. Works fully from the
 * keyboard: arrows, Home/End, Escape (back to the button), Tab (on past it).
 * It flips to the other side when there is no room, stays inside the window
 * and clear of Conductor's panel, and closes if its button is put away.
 *
 * The button itself is the caller's: give it aria-haspopup="menu",
 * aria-expanded and aria-controls={id}.
 */

export type MenuItem = {
  key: string;
  label: string;
  /** A 16px line icon, as an SVG path. */
  icon?: string;
  /** Draw the icon with a heavier stroke (three dots). */
  heavyIcon?: boolean;
  /** What choosing it does; a returned string is shown as confirmation. */
  run?: () => Promise<string | null> | string | null | void;
  /** A link instead of a button (a mailto:, a PDF). */
  href?: string;
  /** With `href`: open it in a new tab. */
  newTab?: boolean;
  disabled?: boolean;
  /** Still being made: show a spinner. */
  busy?: boolean;
  /** A short note under the label. */
  hint?: string;
};

export function Menu({
  id,
  menuRef,
  triggerRef,
  placement,
  items,
  onSelect,
  onClose,
}: {
  id: string;
  menuRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Which side of the button it opens on (it flips if there is no room there). */
  placement: "below" | "above";
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
  onClose: (options?: { refocus?: boolean }) => void;
}) {
  // Placement, the move into a dialog, following the button and dismissal
  // are the shared popover mechanics (popover/usePopover.ts); what makes it a
  // menu - the role, the arrow keys - is here.
  const { container, style, placed } = usePopover({
    triggerRef,
    popoverRef: menuRef,
    placement: placement === "below" ? "bottom-end" : "top-end",
    portal: true,
    initialFocus: "first",
    itemSelector: "[role=menuitem]",
    closeOnTab: true,
    fallbackFocus: () => null,
    // Escape (handled before this menu sees it) goes back to the button; anything else leaves focus be.
    onDismiss: (reason) => onClose(reason === "escape" ? { refocus: true } : undefined),
  });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const all = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const index = all.indexOf(document.activeElement as HTMLElement);

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      all[(index + step + all.length) % all.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      all[event.key === "Home" ? 0 : all.length - 1]?.focus();
    }
  }

  const itemClass =
    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-ink-soft transition-colors hover:bg-paper hover:text-ink focus:bg-paper focus:text-ink focus:outline-none aria-disabled:cursor-default aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-soft";

  if (!container) return null;
  return createPortal(
    <div
      id={id}
      ref={menuRef}
      role="menu"
      onKeyDown={onKeyDown}
      style={style}
      className={cn(
        "z-50 min-w-52 overflow-y-auto rounded-card border border-line bg-surface p-1.5 shadow-card",
        // Transparent (in the style), not hidden, until placed: a hidden menu could not take focus.
        placed && "animate-enter",
      )}
    >
      {items.map((item) => {
        const content = (
          <>
            {item.busy ? <Spinner /> : item.icon ? <MenuIcon d={item.icon} heavy={item.heavyIcon} /> : null}
            <span className="flex min-w-0 flex-col">
              <span>{item.label}</span>
              {item.hint ? <span className="text-xs text-muted">{item.hint}</span> : null}
            </span>
          </>
        );
        return item.href ? (
          <a
            key={item.key}
            href={item.href}
            {...(item.newTab ? { target: "_blank", rel: "noopener" } : {})}
            role="menuitem"
            onClick={() => onSelect(item)}
            className={itemClass}
          >
            {content}
          </a>
        ) : (
          // aria-disabled rather than disabled, so a choice that is still
          // loading can hold keyboard focus instead of vanishing from it.
          <button
            key={item.key}
            type="button"
            role="menuitem"
            aria-disabled={item.disabled || undefined}
            aria-busy={item.busy || undefined}
            onClick={item.disabled ? undefined : () => onSelect(item)}
            className={cn(itemClass, item.disabled && "text-muted")}
          >
            {content}
          </button>
        );
      })}
    </div>,
    container,
  );
}

function MenuIcon({ d, heavy }: { d: string; heavy?: boolean }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-muted">
      <path d={d} stroke="currentColor" strokeWidth={heavy ? 2.4 : 1.3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 animate-spin text-muted">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
