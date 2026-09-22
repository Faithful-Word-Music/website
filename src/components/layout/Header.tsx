"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { Brand } from "@/components/layout/Brand";
import { Container } from "@/components/ui/Container";
import { cn } from "@/components/ui/cn";
import { siteConfig } from "@/config/site";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const panelId = useId();

  // Close the mobile panel whenever the route changes. Adjusting state during
  // render is React's recommended way to reset state when an input changes -
  // it avoids the extra commit (and the cascading render) an effect would cost,
  // and it covers back/forward navigation as well as taps on the links.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  // Escape closes the panel, as expected of a disclosure.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    // The header is the visitor.s fixed reference point during a page
    // transition: the content should look like it changed, not the viewport.
    <header
      style={{ viewTransitionName: "site-header" }}
      className="sticky top-0 z-40 border-b border-line/80 glass"
    >
      <Container size="wide">
        <div className="flex h-16 items-center justify-between">
          <Brand />

          {/* Desktop navigation */}
          <nav aria-label="Primary" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {siteConfig.nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn(
                      "relative inline-flex min-h-11 items-center rounded-full px-4 text-sm transition-colors",
                      isActive(item.href)
                        ? "text-ink"
                        : "text-muted hover:text-ink",
                    )}
                  >
                    {item.label}
                    {/* Active marker: a short barline beneath the label. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-x-4 bottom-2.5 h-px transition-opacity",
                        isActive(item.href)
                          ? "bg-gold opacity-100"
                          : "bg-gold opacity-0",
                      )}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Mobile toggle */}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-paper md:hidden"
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            {/* Three rules that fold into a cross: keys closing on a stave. */}
            <span aria-hidden="true" className="relative block h-4 w-5">
              <span
                className={cn(
                  "absolute left-0 block h-px w-5 bg-ink transition-transform duration-200",
                  open ? "top-2 rotate-45" : "top-0",
                )}
              />
              <span
                className={cn(
                  "absolute left-0 top-2 block h-px w-5 bg-ink transition-opacity duration-200",
                  open && "opacity-0",
                )}
              />
              <span
                className={cn(
                  "absolute left-0 block h-px w-5 bg-ink transition-transform duration-200",
                  open ? "top-2 -rotate-45" : "top-4",
                )}
              />
            </span>
          </button>
        </div>
      </Container>

      {/* Mobile panel */}
      <div
        id={panelId}
        hidden={!open}
        className="border-t border-line bg-surface md:hidden"
      >
        <nav aria-label="Primary" className="py-2">
          <Container size="wide">
            <ul className="flex flex-col">
              {siteConfig.nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center border-l-2 px-3 text-base transition-colors",
                      isActive(item.href)
                        ? "border-gold font-medium text-ink"
                        : "border-transparent text-muted hover:text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </nav>
      </div>
    </header>
  );
}
