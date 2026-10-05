"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/components/ui/cn";

/**
 * A small menu that opens against the button that owns it: the share menu on
 * a service card, and the sheet music types beside "Sheet music for this
 * service". Render it to open it, and stop rendering it to close.
 *
 * It is portalled to <body> and placed against the button, so no card that
 * follows - or the page's own stacking - can cover it. Works fully from the
 * keyboard: arrows, Home/End, Escape (back to the button), Tab (on past it).
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
  /** Which side of the button it opens on. */
  placement: "below" | "above";
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
  onClose: (options?: { refocus?: boolean }) => void;
}) {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  // Sit against the button, right edges aligned, and follow it on scroll.
  useLayoutEffect(() => {
    function place() {
      const rect = triggerRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!rect || !menu) return;
      const gap = 8;
      const top =
        placement === "below" ? rect.bottom + gap : rect.top - gap - menu.offsetHeight;
      setPosition({ top, right: Math.max(8, window.innerWidth - rect.right) });
    }
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [menuRef, triggerRef, placement]);

  // The latest onClose, read by the listener below without re-subscribing it
  // on every render (the page re-renders each time its clock ticks).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Focus the first choice on opening; close on a press anywhere else.
  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onCloseRef.current();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuRef, triggerRef]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const all = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const index = all.indexOf(document.activeElement as HTMLElement);

    if (event.key === "Escape") {
      // Handled here, so it does not also leave select mode.
      event.preventDefault();
      event.stopPropagation();
      onClose({ refocus: true });
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      all[(index + step + all.length) % all.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      all[event.key === "Home" ? 0 : all.length - 1]?.focus();
    } else if (event.key === "Tab") {
      onClose();
    }
  }

  const itemClass =
    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-ink-soft transition-colors hover:bg-paper hover:text-ink focus:bg-paper focus:text-ink focus:outline-none aria-disabled:cursor-default aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-soft";

  return createPortal(
    <div
      id={id}
      ref={menuRef}
      role="menu"
      onKeyDown={onKeyDown}
      style={{
        position: "fixed",
        top: position?.top ?? -9999,
        right: position?.right ?? 0,
      }}
      className={cn(
        "animate-enter z-50 min-w-52 rounded-card border border-line bg-surface p-1.5 shadow-card",
        // Transparent, not hidden, until placed: a hidden menu could not take focus.
        !position && "opacity-0",
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
    document.body,
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
