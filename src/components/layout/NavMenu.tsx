"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { cn } from "@/components/ui/cn";
import { usePagePath } from "@/components/ui/use-page-path";
import type { NavItem } from "@/lib/navigation";

/** The panel's width (w-56), for keeping it on screen. */
const PANEL_WIDTH = 224;
const EDGE = 16;

/**
 * A menu in the header's row of links ("Tools"): a button that opens a short
 * list of links beneath it. It looks like the links beside it - the same
 * type, the same gold barline when one of its pages is open - with a small
 * chevron to say there is more.
 *
 * The same panel as the account menu (UserMenu), and the same manners: Escape,
 * a press anywhere else or a change of page closes it. A button and a list of
 * links, not an ARIA menu, so a screen reader meets ordinary links; the Down
 * arrow opens it and moves into them.
 *
 * The panel is `fixed`, placed from the button: the links' row clips what
 * overflows it (use-nav-fit.ts measures that), so a panel positioned inside
 * the row would be cut off.
 */
export function NavMenu({ item, isActive }: { item: NavItem; isActive: (href: string) => boolean }) {
  const children = item.children ?? [];
  const pathname = usePagePath();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const rootRef = useRef<HTMLLIElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Set when the Down arrow opened it: focus then goes to the first link. */
  const focusFirst = useRef(false);
  const panelId = useId();
  const active = children.some((child) => isActive(child.href));

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        left: Math.max(EDGE, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - EDGE)),
        top: rect.bottom + 4,
      });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !position || !focusFirst.current) return;
    focusFirst.current = false;
    panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
  }, [open, position]);

  function onButtonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    focusFirst.current = true;
    setOpen(true);
  }

  /** Up and Down move through the links; Tab carries on as usual. */
  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = [...(panelRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (index < 0) return;
    event.preventDefault();
    links[(index + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length]?.focus();
  }

  return (
    <li ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onButtonKeyDown}
        className={cn(
          "relative inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm transition-colors",
          active || open ? "text-ink" : "text-muted hover:text-ink",
        )}
      >
        {item.label}
        <svg
          aria-hidden="true"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={cn("transition-transform", open && "rotate-180")}
        >
          <path d="M2 3.75L5 6.75l3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {/* The same barline the links wear, when one of its pages is open. */}
        <span
          aria-hidden="true"
          className={cn("absolute inset-x-4 bottom-2.5 h-px bg-gold transition-opacity", active ? "opacity-100" : "opacity-0")}
        />
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          onKeyDown={onPanelKeyDown}
          style={position ?? { visibility: "hidden" }}
          className="animate-enter fixed z-50 w-56 rounded-card border border-line bg-surface p-2 shadow-lift"
        >
          <ul>
            {children.map((child) => {
              const current = isActive(child.href);
              return (
                <li key={child.href}>
                  <Link
                    href={child.href}
                    aria-current={current ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-ink transition-colors hover:bg-paper",
                      current && "bg-paper",
                    )}
                  >
                    {child.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
