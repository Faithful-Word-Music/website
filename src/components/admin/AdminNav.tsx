"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { currentHref } from "@/components/admin/current-href";
import { cn } from "@/components/ui/cn";
import { usePagePath } from "@/components/ui/use-page-path";

/**
 * Section tabs: the Service Planner's and the Archive's. (The admin area has
 * more sections than a row holds, so it uses AdminSidebar.) The open tab is
 * the one whose address the page is in (currentHref).
 *
 * The tabs are one rounded bar with the open one lifted out of it, the same
 * look as the open row in the admin sidebar. It never scrolls sideways: on a
 * phone the tabs share the full width and wrap onto a second row if there are
 * too many, and `trailing` (the planner's link to the song list) sits on its
 * own line above them. From `sm` up the bar hugs its tabs, with `trailing` at
 * the far end.
 */
export function AdminNav({
  items,
  label,
  trailing,
}: {
  items: Array<{ href: string; label: string; badge?: number }>;
  label: string;
  trailing?: ReactNode;
}) {
  const pathname = usePagePath();
  const current = currentHref(items, pathname);

  return (
    <nav aria-label={label} className="flex flex-col-reverse gap-1 sm:flex-row sm:items-center">
      <ul className="flex flex-wrap gap-1 rounded-xl border border-line p-1">
        {items.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href} className="flex flex-auto sm:flex-none">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm transition-colors sm:min-h-10 sm:w-auto",
                  active
                    ? "bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]"
                    : "text-muted hover:bg-surface/60 hover:text-ink",
                )}
              >
                {item.label}
                {item.badge ? (
                  <span className="rounded-full bg-ink px-2 py-0.5 text-[0.7rem] font-semibold text-paper">{item.badge}</span>
                ) : null}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-gold transition-opacity",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
      {trailing ? <div className="flex justify-end sm:ml-auto sm:pl-6">{trailing}</div> : null}
    </nav>
  );
}
