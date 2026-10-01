"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { UserMenu } from "@/components/account/UserMenu";
import { Brand } from "@/components/layout/Brand";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { CommandPalette } from "@/components/search/CommandPalette";
import { Container } from "@/components/ui/Container";
import { cn } from "@/components/ui/cn";
import { usePagePath } from "@/components/ui/use-page-path";
import { homeHref, isActivePath, primaryNav } from "@/lib/navigation";

export function Header({ authEnabled = false }: { authEnabled?: boolean }) {
  const pathname = usePagePath();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const panelId = useId();
  // Visitors get the public navigation; a signed-in person the Dashboard and
  // whatever their permissions open (src/lib/navigation.ts).
  const { nav } = useAccount();
  const items = primaryNav(nav);

  // Close the mobile menu whenever the route changes. Adjusting state during
  // render is React's recommended way to reset state when an input changes -
  // it avoids the extra commit (and the cascading render) an effect would cost,
  // and it covers back/forward navigation as well as taps on the links.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  // Escape closes the menu, as expected of a disclosure.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  // The mobile menu's search bar: the menu gives way to the palette.
  const openSearch = useCallback(() => {
    setOpen(false);
    setSearchOpen(true);
  }, []);

  function isActive(href: string) {
    return isActivePath(pathname, href);
  }

  return (
    <>
      {/* The header is the visitor's fixed reference point during a page
          transition: the content should look like it changed, not the viewport. */}
      <header
        style={{ viewTransitionName: "site-header" }}
        className="sticky top-0 z-40 border-b border-line/80 glass"
      >
        <Container size="wide">
          <div className="flex h-16 items-center justify-between">
            <Brand href={homeHref(nav)} />

            <div className="flex items-center gap-1">
              {/* Desktop navigation */}
              <nav aria-label="Primary" className="hidden md:block">
                <ul className="flex items-center gap-1">
                  {items.map((item) => (
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

              {/* Search: a button here on wider screens, a search bar atop the
                  mobile menu on phones. The theme sits beside the menu button
                  on phones, so it never needs the menu opened. */}
              <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
              <ThemeToggle />
              {/* The signed-in person's menu. Nothing shows for visitors, and
                  nothing at all while accounts are switched off. */}
              {authEnabled ? <UserMenu /> : null}

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
          </div>
        </Container>
      </header>

      {/* A sibling of <header>, not a child: the header carries a
          view-transition-name, and a named element can establish a containing
          block - which would position this fixed overlay against the 64px bar
          instead of the viewport. */}
      <MobileMenu
        open={open}
        onClose={close}
        panelId={panelId}
        items={items}
        isActive={isActive}
        onSearch={openSearch}
      />
    </>
  );
}
