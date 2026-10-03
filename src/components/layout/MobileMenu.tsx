"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { MobileSearchBar } from "@/components/search/CommandPalette";
import { cn } from "@/components/ui/cn";
import { useScrollLock } from "@/components/ui/use-scroll-lock";
import { siteConfig } from "@/config/site";
import type { NavItem } from "@/lib/navigation";

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
  /** The links, from primaryNav(): the same ones the header shows. */
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
        // Fixed to the viewport, starting below the 64px header bar.
        "fixed inset-x-0 bottom-0 top-16 z-30 nav-wide:hidden",
        // The menu scrolls itself if the list ever outgrows the screen;
        // overscroll-contain stops a flick chaining through to the page.
        "overflow-y-auto overscroll-contain bg-paper",
        "transition-[opacity,transform] duration-300 ease-out",
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
              "transition-[opacity,transform] duration-300 ease-out",
              open ? "translate-y-0 opacity-100 delay-[60ms]" : "translate-y-2 opacity-0",
            )}
          />
          <nav aria-label="Primary" className="mt-2">
            <ul className="flex flex-col">
              {items.map((item, index) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    // A short stagger on the way in; immediate on the way out, so
                    // closing feels responsive rather than draggy.
                    style={{
                      transitionDelay: open ? `${90 + index * 60}ms` : "0ms",
                    }}
                    className={cn(
                      "flex items-center gap-4 py-5 font-display text-3xl",
                      "transition-[opacity,transform] duration-300 ease-out",
                      open
                        ? "translate-y-0 opacity-100"
                        : "translate-y-2 opacity-0",
                      isActive(item.href) ? "text-ink" : "text-muted",
                    )}
                  >
                    {/* Barline marking the current page. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-8 w-0.5 rounded-full",
                        isActive(item.href) ? "bg-gold" : "bg-transparent",
                      )}
                    />
                    {item.label}
                  </Link>
                </li>
              ))}
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
