"use client";

import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { usePagePath } from "@/components/ui/use-page-path";

/** The admin area's section tabs. Only sections the person may use are passed in. */
export function AdminNav({ items }: { items: Array<{ href: string; label: string; badge?: number }> }) {
  const pathname = usePagePath();

  return (
    // Swipes sideways on phones without a scrollbar, like the Library's letter bar.
    <nav aria-label="Admin" className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {items.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
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
      </ul>
    </nav>
  );
}
