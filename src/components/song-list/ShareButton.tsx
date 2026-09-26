"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import {
  canShareNatively,
  copyText,
  emailHref,
  prefersShareSheet,
  shareNatively,
  type SharePayload,
} from "@/components/song-list/share-actions";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { songListContent } from "@/content/song-list";
import { formatServicesText, shareTitle } from "@/lib/share-services";
import type { Service } from "@/types/song-list";

/**
 * Shares services as text (see share-services.ts).
 *
 * On a phone it opens the share sheet straight away - Messages, Mail and the
 * rest, as people expect. On a computer it opens a small menu instead: copy
 * the text, start an email, or (where the browser has one) the system share
 * panel.
 *
 * The menu is portalled to <body> and placed against the button, so no card
 * that follows - or the page's own stacking - can cover it.
 */
export function ShareButton({
  services,
  note,
  variant,
  label,
  placement = "below",
  disabled = false,
}: {
  services: Service[];
  /** The month's footnote, sent above the link. */
  note: string | null;
  /** "icon": the round button on a card. "primary": the gold button in the share bar. */
  variant: "icon" | "primary";
  /** The button's accessible name (icon) or its text (primary). */
  label: string;
  /** Which side of the button the menu opens on. */
  placement?: "below" | "above";
  disabled?: boolean;
}) {
  const { share } = songListContent;
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ payload: SharePayload; native: boolean } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function payload(): SharePayload {
    return { title: shareTitle(services), text: formatServicesText(services, { note }) };
  }

  async function open() {
    if (menu) {
      setMenu(null);
      return;
    }
    const current = payload();
    if (prefersShareSheet() && (await shareNatively(current))) return;
    setMenu({ payload: current, native: canShareNatively() });
  }

  function close({ refocus = false } = {}) {
    setMenu(null);
    if (refocus) triggerRef.current?.focus();
  }

  function flash(message: string) {
    setStatus(message);
  }

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 1800);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function copy() {
    if (!menu) return;
    const ok = await copyText(menu.payload.text);
    close({ refocus: true });
    flash(ok ? share.copied : share.copyFailed);
  }

  async function systemShare() {
    if (!menu) return;
    const current = menu.payload;
    close({ refocus: true });
    await shareNatively(current);
  }

  const iconClass =
    "inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink aria-expanded:bg-paper aria-expanded:text-ink";
  const primaryClass = buttonClasses("primary", "md", "disabled:pointer-events-none disabled:opacity-40");

  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={menu ? true : undefined}
        aria-controls={menu ? menuId : undefined}
        aria-label={variant === "icon" ? label : undefined}
        title={variant === "icon" ? label : undefined}
        className={variant === "icon" ? iconClass : primaryClass}
      >
        <ShareIcon />
        {variant === "primary" ? label : null}
      </button>

      {/* Confirms a copy. Always present, so screen readers announce the change. */}
      <span
        role="status"
        className={cn(
          "pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper transition-opacity duration-200",
          placement === "below" ? "top-full mt-1" : "bottom-full mb-2",
          status ? "opacity-100" : "opacity-0",
        )}
      >
        {status}
      </span>

      {menu ? (
        <ShareMenu
          id={menuId}
          menuRef={menuRef}
          triggerRef={triggerRef}
          placement={placement}
          native={menu.native}
          email={emailHref(menu.payload)}
          onCopy={copy}
          onSystemShare={systemShare}
          onClose={close}
        />
      ) : null}
    </span>
  );
}

function ShareMenu({
  id,
  menuRef,
  triggerRef,
  placement,
  native,
  email,
  onCopy,
  onSystemShare,
  onClose,
}: {
  id: string;
  menuRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  placement: "below" | "above";
  native: boolean;
  email: string;
  onCopy: () => void;
  onSystemShare: () => void;
  onClose: (options?: { refocus?: boolean }) => void;
}) {
  const { share } = songListContent;
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
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === "Escape") {
      // Handled here, so it does not also leave select mode.
      event.preventDefault();
      event.stopPropagation();
      onClose({ refocus: true });
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      onClose();
    }
  }

  const itemClass =
    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-ink-soft transition-colors hover:bg-paper hover:text-ink focus:bg-paper focus:text-ink focus:outline-none";

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
        "animate-enter z-50 min-w-48 rounded-card border border-line bg-surface p-1.5 shadow-card",
        // Transparent, not hidden, until placed: a hidden menu could not take focus.
        !position && "opacity-0",
      )}
    >
      <button type="button" role="menuitem" onClick={onCopy} className={itemClass}>
        <MenuIcon d="M5.5 5.5V3a1 1 0 0 1 1-1H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-2.5M3 5.5h6.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />
        {share.copy}
      </button>
      <a href={email} role="menuitem" onClick={() => onClose()} className={itemClass}>
        <MenuIcon d="M2 4h12v8.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V4Zm0 0 6 5 6-5" />
        {share.email}
      </a>
      {native ? (
        <button type="button" role="menuitem" onClick={onSystemShare} className={itemClass}>
          <MenuIcon d="M4 8h.01M8 8h.01M12 8h.01" strokeWidth={2.4} />
          {share.systemShare}
        </button>
      ) : null}
    </div>,
    document.body,
  );
}

function MenuIcon({ d, strokeWidth = 1.3 }: { d: string; strokeWidth?: number }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-muted">
      <path d={d} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The familiar box with an arrow leaving it. */
function ShareIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 10V1.75M5 4.5l3-3 3 3M5.5 7H4a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
