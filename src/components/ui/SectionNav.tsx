"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";
import { usePagePath } from "@/components/ui/use-page-path";
import { currentHref } from "@/lib/current-href";

/**
 * The navigation WITHIN a feature: the Service Planner's Plan · Inserts ·
 * Archive, the Archive's Songs · Service plans. (Not the admin area's
 * navigation, which is AdminSidebar.) The open link is the one whose address
 * the page is in (currentHref).
 *
 * Plain text links on a hairline, set from the left: the open one is darker
 * and carries a short gold bar that sits on the line. No box around the row
 * and nothing raised. It never scrolls sideways - with too many links for a
 * phone they wrap onto a second row - and each link is a full-height target.
 * `trailing` (the planner's way to the published song list) is kept apart at
 * the far end from `sm` up, and on its own line above the links on a phone.
 */
export function SectionNav({
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
    // From `sm` the hairline is the whole row's, so it runs unbroken under the links and `trailing` alike.
    <nav aria-label={label} className="flex flex-col-reverse gap-x-6 sm:flex-row sm:items-end sm:border-b sm:border-line">
      <ul className="flex min-w-0 flex-1 flex-wrap gap-x-7 border-b border-line sm:gap-x-8 sm:border-b-0">
        {items.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // -mb-px: the gold bar lies over the hairline, not above it.
                  "group relative -mb-px inline-flex min-h-11 items-center gap-2 whitespace-nowrap text-[0.95rem] transition-colors",
                  active ? "font-medium text-ink" : "text-muted hover:text-ink",
                )}
              >
                {item.label}
                {item.badge ? (
                  <span className="rounded-full bg-ink px-2 py-0.5 text-[0.7rem] font-semibold text-paper">{item.badge}</span>
                ) : null}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-0.5 rounded-full transition-colors",
                    active ? "bg-gold" : "bg-transparent group-hover:bg-staff",
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
      {trailing ? <div className="flex shrink-0 justify-end">{trailing}</div> : null}
    </nav>
  );
}
