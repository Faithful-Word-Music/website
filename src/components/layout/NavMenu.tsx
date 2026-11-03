"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/Icon";
import { Popover } from "@/components/ui/popover/Popover";
import { usePagePath } from "@/components/ui/use-page-path";
import type { NavItem } from "@/lib/navigation";

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
 * The panel is a Popover (ui/popover), placed from the button: the links'
 * row clips what overflows it (use-nav-fit.ts measures that), so a panel
 * positioned inside the row would be cut off. It stays beside the button in
 * the page, so Tab runs from the button into the links and on along the bar.
 * If the bar gives way to the menu button at a narrower width, the panel
 * closes and focus goes to that menu button (`fallbackFocus`).
 */
export function NavMenu({
  item,
  isActive,
  fallbackFocus,
}: {
  item: NavItem;
  isActive: (href: string) => boolean;
  /** Where focus goes if the bar is put away while the panel is open: the menu button that replaces it. */
  fallbackFocus?: () => HTMLElement | null;
}) {
  const children = item.children ?? [];
  const pathname = usePagePath();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
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

  // Opened with the Down arrow: into the first link.
  useEffect(() => {
    if (!open || !focusFirst.current) return;
    focusFirst.current = false;
    panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
  }, [open]);

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
    <li>
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
        <Icon name="chevron-down" size={10} strokeWidth={2.2} className={cn("transition-transform", open && "rotate-180")} />
        {/* The same barline the links wear, when one of its pages is open. */}
        <span
          aria-hidden="true"
          className={cn("absolute inset-x-4 bottom-2.5 h-px bg-gold transition-opacity", active ? "opacity-100" : "opacity-0")}
        />
      </button>

      {open ? (
        <Popover
          id={panelId}
          triggerRef={buttonRef}
          placement="bottom-start"
          onClose={() => setOpen(false)}
          fallbackFocus={fallbackFocus}
          onKeyDown={onPanelKeyDown}
          className="w-56 p-2"
        >
          <div ref={panelRef}>
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
        </Popover>
      ) : null}
    </li>
  );
}
