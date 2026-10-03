"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";
import { usePagePath } from "@/components/ui/use-page-path";

/**
 * Section tabs: the admin area's, and the Service Planner's. Only sections
 * the person may use are passed in. The open tab is the one whose address
 * the page is in - the longest match, so /admin/users/x opens People, not
 * Overview, and a service in the planner keeps Plan open. `trailing` sits at
 * the far end of the same bar (the planner's link to the song list).
 */
export function AdminNav({
  items,
  label = "Admin",
  trailing,
}: {
  items: Array<{ href: string; label: string; badge?: number }>;
  label?: string;
  trailing?: ReactNode;
}) {
  const pathname = usePagePath();
  const current = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    // Swipes sideways on phones without a scrollbar, like the Library's letter bar.
    <nav aria-label={label} className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {items.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-11 items-center gap-2 px-4 text-sm transition-colors",
                  active ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                {item.label}
                {item.badge ? (
                  <span className="rounded-full bg-ink px-2 py-0.5 text-[0.7rem] font-semibold text-paper">
                    {item.badge}
                  </span>
                ) : null}
                <span
                  aria-hidden="true"
                  className={cn("absolute inset-x-4 -bottom-px h-px bg-gold transition-opacity", active ? "opacity-100" : "opacity-0")}
                />
              </Link>
            </li>
          );
        })}
        {trailing ? <li className="ml-auto flex items-center pl-6">{trailing}</li> : null}
      </ul>
    </nav>
  );
}
