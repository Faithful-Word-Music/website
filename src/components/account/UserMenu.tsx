"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { cn } from "@/components/ui/cn";
import { usePagePath } from "@/components/ui/use-page-path";
import { accountContent } from "@/content/account";
import { accountMenu, isActivePath } from "@/lib/navigation";

/**
 * The account section at the foot of the mobile menu: who is signed in, then
 * the same links as the header's account menu, and Log out. The Dashboard is
 * left out here - it already leads the menu's main links.
 */
export function MobileAccountMenu({ onNavigate }: { onNavigate: () => void }) {
  const { isSignedIn, me, nav } = useAccount();
  const { user } = useUser();
  const { signOut } = useClerk();
  const pathname = usePagePath();

  if (!isSignedIn || !user) return null;

  const name = user.fullName || user.primaryEmailAddress?.emailAddress || "Your account";
  const links = accountMenu(nav).filter((item) => item.href !== "/dashboard");

  return (
    <div className="border-t border-line pt-6">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- Clerk-hosted avatar, already sized by Clerk */}
        <img
          src={user.imageUrl}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 rounded-full border border-line object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{name}</p>
          <p className="truncate text-xs text-muted">{me?.title ?? user.primaryEmailAddress?.emailAddress}</p>
        </div>
      </div>
      <ul className="mt-4">
        {links.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center text-base transition-colors hover:text-ink",
                isActivePath(pathname, item.href) ? "text-ink" : "text-muted",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => signOut({ redirectUrl: "/" })}
            className="flex min-h-11 w-full items-center text-left text-base text-muted transition-colors hover:text-ink"
          >
            {accountContent.menu.logout}
          </button>
        </li>
      </ul>
    </div>
  );
}

/**
 * The signed-in person's menu in the header: their photo, and links to their
 * Dashboard, Profile, Account settings, the admin area (if they may use it)
 * and Log out. Editing lives on the pages themselves, not here.
 *
 * Renders nothing for visitors who are not signed in - the public header looks
 * exactly as it always has. Which links show comes from src/lib/navigation.ts
 * and the person's permissions (/api/account/me); it is only a convenience,
 * and every page checks permissions again itself.
 */
export function UserMenu() {
  const { isSignedIn, me, nav } = useAccount();
  const { user } = useUser();
  const { signOut } = useClerk();
  const pathname = usePagePath();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
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

  if (!isSignedIn || !user) return null;

  const name = user.fullName || user.primaryEmailAddress?.emailAddress || "Your account";
  const itemClass =
    "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-ink transition-colors hover:bg-paper";

  return (
    // From md up only: on phones the header has no room for it, and the same
    // links sit at the foot of the mobile menu instead (MobileAccountMenu).
    <div ref={rootRef} className="relative hidden lg:block print:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={accountContent.menu.button}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-paper"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Clerk-hosted avatar, already sized by Clerk */}
        <img
          src={user.imageUrl}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 rounded-full border border-line object-cover"
        />
      </button>

      {open ? (
        <div
          id={menuId}
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-card border border-line bg-surface p-2 shadow-lift animate-enter"
        >
          <div className="border-b border-line px-3 pb-3 pt-2">
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            {me?.title ? (
              <p className="truncate text-xs text-gold-dark">{me.title}</p>
            ) : (
              <p className="truncate text-xs text-muted">{user.primaryEmailAddress?.emailAddress}</p>
            )}
          </div>
          <ul className="pt-2">
            {accountMenu(nav).map((item) => {
              const current = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={cn(itemClass, current && "bg-paper")}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li className="mt-1 border-t border-line pt-1">
              <button
                type="button"
                onClick={() => signOut({ redirectUrl: "/" })}
                className={cn(itemClass, "text-muted hover:text-ink")}
              >
                {accountContent.menu.logout}
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
