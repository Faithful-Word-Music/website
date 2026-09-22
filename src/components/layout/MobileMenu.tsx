"use client";

import Link from "next/link";
import { useEffect } from "react";

import { cn } from "@/components/ui/cn";
import { siteConfig } from "@/config/site";

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
  isActive,
}: {
  open: boolean;
  onClose: () => void;
  panelId: string;
  isActive: (href: string) => boolean;
}) {
  /**
   * Lock the page while the menu is open.
   *
   * `overflow: hidden` on <body> is the usual suggestion and it does not hold
   * on iOS Safari. Pinning the body with `position: fixed` and an offsetting
   * `top` does, and keeps the visual position identical.
   *
   * Restoring uses `behavior: "instant"` on purpose: globals.css sets
   * `html { scroll-behavior: smooth }`, so a plain scrollTo would visibly
   * animate the page back to where it already was.
   */
  useEffect(() => {
    if (!open) return;

    const scrollY = window.scrollY;
    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      window.scrollTo({ top: scrollY, behavior: "instant" });
    };
  }, [open]);

  /**
   * Close if the viewport grows past the breakpoint. Without this, `md:hidden`
   * would hide the overlay while the body stayed pinned - the page would
   * silently become unscrollable after a rotate or a resize.
   */
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia("(min-width: 768px)");
    function onChange() {
      if (wide.matches) onClose();
    }
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [open, onClose]);

  return (
    <div
      id={panelId}
      inert={!open}
      className={cn(
        // Fixed to the viewport, starting below the 64px header bar.
        "fixed inset-x-0 bottom-0 top-16 z-30 md:hidden",
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
        <nav aria-label="Primary" className="px-5 pt-6">
          <ul className="flex flex-col">
            {siteConfig.nav.map((item, index) => (
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

        <div className="px-5 pb-10 pt-8">
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
