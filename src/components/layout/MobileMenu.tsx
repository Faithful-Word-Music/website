"use client";

import Link from "next/link";
import { useId, useState, type CSSProperties, type ReactNode } from "react";

import { MobileSearchBar } from "@/components/search/CommandPalette";
import { Collapse } from "@/components/ui/Collapse";
import { cn } from "@/components/ui/cn";
import { usePagePath } from "@/components/ui/use-page-path";
import { useScrollLock } from "@/components/ui/use-scroll-lock";
import { siteConfig } from "@/config/site";
import type { NavItem } from "@/lib/navigation";

/** How a row arrives as the menu opens: its place in the stagger. */
type Enter = { style: CSSProperties; className: string };

// About 60px a row: well over a finger's 44px, without filling the screen.
const rowClasses = "flex w-full items-center gap-4 py-3.5 text-left font-display text-2xl";

/**
 * A menu among the links ("Tools"): a row like the others that opens in
 * place, its links sliding out beneath it and the rows below moving down to
 * make room. It starts open on one of its own pages.
 */
function MenuRow({
  item,
  isActive,
  onClose,
  enter,
}: {
  item: NavItem;
  isActive: (href: string) => boolean;
  onClose: () => void;
  enter: Enter;
}) {
  const children = item.children ?? [];
  const pathname = usePagePath();
  const active = children.some((child) => isActive(child.href));
  const [open, setOpen] = useState(active);
  const [lastPathname, setLastPathname] = useState(pathname);
  const listId = useId();

  // A new page: open on one of its own, closed anywhere else.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(active);
  }

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        style={enter.style}
        className={cn(rowClasses, enter.className, active || open ? "text-ink" : "text-muted")}
      >
        {/* The same barline the links wear, when one of its pages is open. */}
        <span aria-hidden="true" className={cn("h-7 w-0.5 shrink-0 rounded-full", active ? "bg-gold" : "bg-transparent")} />
        {item.label}
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 10 10"
          fill="none"
          className={cn("-ml-1.5 shrink-0 transition-transform duration-300", open && "rotate-180")}
        >
          <path d="M2 3.75L5 6.75l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Collapse open={open} id={listId}>
        {/* Set in from the label, down a hairline: these belong to the row above. */}
        <ul className="mb-2 ml-[1.125rem] border-l border-line pl-4">
          {children.map((child) => {
            const current = isActive(child.href);
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onClose}
                  aria-current={current ? "page" : undefined}
                  className={cn("flex min-h-11 items-center py-2 font-display text-xl", current ? "text-ink" : "text-muted")}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </Collapse>
    </li>
  );
}

/**
 * The mobile navigation: a full-screen overlay below the header bar.
 *
 * It stays mounted so it can animate both in and out, and uses `inert` when
 * closed - which takes it out of the accessibility tree AND out of the tab
 * order, so there are no invisible focusable links left behind.
 */
export function MobileMenu({
  open,
  onClose,
  panelId,
  items,
  isActive,
  onSearch,
  account,
}: {
  open: boolean;
  onClose: () => void;
  panelId: string;
  /** The links and menus, from primaryNav(): the same ones the header shows. */
  items: NavItem[];
  isActive: (href: string) => boolean;
  /** Opens the search palette (the menu closes as it opens). */
  onSearch: () => void;
  /** The signed-in person's account section, when accounts are on. */
  account?: ReactNode;
}) {
  // Lock the page while the menu is open. (The header closes it once its
  // links fit in the bar again - otherwise `nav-wide:hidden` would hide the
  // overlay while the page stayed pinned and unscrollable.)
  useScrollLock(open);

  return (
    <div
      id={panelId}
      inert={!open}
      className={cn(
        // Fixed to the viewport, starting below the 64px header bar - and
        // stopping short of Conductor's panel, when that is open beside the page.
        "fixed bottom-0 left-0 right-(--conductor-inset) top-16 z-30 nav-wide:hidden",
        // The menu scrolls itself if the list ever outgrows the screen;
        // overscroll-contain stops a flick chaining through to the page.
        "overflow-y-auto overscroll-contain bg-paper",
        "transition-[opacity,transform,translate,scale,rotate] duration-300 ease-out",
        open
          ? "translate-y-0 opacity-100"
          : "pointer-events-none -translate-y-1 opacity-0",
      )}
    >
      <div className="flex min-h-full flex-col justify-between">
        <div className="px-5 pt-6">
          {/* Arrives with the links, a step ahead of the first. */}
          <MobileSearchBar
            onOpen={onSearch}
            className={cn(
              "transition-[opacity,transform,translate,scale,rotate] duration-300 ease-out",
              open ? "translate-y-0 opacity-100 delay-[60ms]" : "translate-y-2 opacity-0",
            )}
          />
          <nav aria-label="Primary" className="mt-2">
            <ul className="flex flex-col">
              {items.map((item, index) => {
                // A short stagger on the way in; immediate on the way out, so
                // closing feels responsive rather than draggy.
                const enter: Enter = {
                  style: { transitionDelay: open ? `${90 + index * 60}ms` : "0ms" },
                  className: cn(
                    "transition-[opacity,transform,translate,scale,rotate] duration-300 ease-out",
                    open ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                  ),
                };
                if (item.children) {
                  // Several destinations behind one row ("Tools"), which opens in place.
                  return <MenuRow key={item.label} item={item} isActive={isActive} onClose={onClose} enter={enter} />;
                }
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      style={enter.style}
                      className={cn(rowClasses, enter.className, isActive(item.href) ? "text-ink" : "text-muted")}
                    >
                      {/* Barline marking the current page. */}
                      <span
                        aria-hidden="true"
                        className={cn("h-7 w-0.5 rounded-full", isActive(item.href) ? "bg-gold" : "bg-transparent")}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="space-y-6 px-5 pb-10 pt-8">
          {/* Signed in: who, and their account links (in place of the
              header's avatar menu, which phones have no room for). */}
          {account}
          <div className="border-t border-line pt-6">
            <a
              href={`mailto:${siteConfig.contactEmail}`}
              onClick={onClose}
              className="text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-gold"
            >
              {siteConfig.contactEmail}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
