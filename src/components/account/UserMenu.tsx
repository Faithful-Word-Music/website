"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/components/ui/cn";
import { usePagePath } from "@/components/ui/use-page-path";
import { accountContent } from "@/content/account";

interface MeResponse {
  canAccessAdmin?: boolean;
  title?: string | null;
}

/**
 * The signed-in person's menu in the header: their photo, and links to their
 * account, the admin area (if they may use it) and Log out.
 *
 * Renders nothing for visitors who are not signed in - the public header looks
 * exactly as it always has. Whether to show "Admin" comes from the server
 * (/api/account/me); it is only a convenience, and the admin pages check
 * permissions again themselves.
 */
export function UserMenu() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const pathname = usePagePath();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const [me, setMe] = useState<{ userId: string; data: MeResponse } | null>(null);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    let cancelled = false;
    fetch("/api/account/me", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<MeResponse>) : {}))
      .then((data) => {
        if (!cancelled) setMe({ userId, data });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId]);

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

  if (!isLoaded || !isSignedIn || !user) return null;

  const details = me?.userId === userId ? me.data : {};
  const name = user.fullName || user.primaryEmailAddress?.emailAddress || "Your account";
  const itemClass =
    "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-ink transition-colors hover:bg-paper";

  return (
    <div ref={rootRef} className="relative print:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Account menu"
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
          className="glass absolute right-0 top-full z-50 mt-2 w-64 rounded-card border border-line p-2 shadow-lift animate-enter"
        >
          <div className="border-b border-line px-3 pb-3 pt-2">
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            {details.title ? (
              <p className="truncate text-xs text-gold-dark">{details.title}</p>
            ) : (
              <p className="truncate text-xs text-muted">{user.primaryEmailAddress?.emailAddress}</p>
            )}
          </div>
          <ul className="pt-2">
            <li>
              <Link href="/account" className={itemClass}>
                Your account
              </Link>
            </li>
            <li>
              <Link href="/account/edit" className={itemClass}>
                {accountContent.account.edit}
              </Link>
            </li>
            {details.canAccessAdmin ? (
              <li>
                <Link href="/admin" className={itemClass}>
                  {accountContent.account.admin}
                </Link>
              </li>
            ) : null}
            <li className="mt-1 border-t border-line pt-1">
              <button
                type="button"
                onClick={() => signOut({ redirectUrl: "/" })}
                className={cn(itemClass, "text-muted hover:text-ink")}
              >
                {accountContent.account.logout}
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
