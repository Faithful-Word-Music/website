import Link from "next/link";
import type { ReactNode } from "react";

import { InPageLink } from "@/components/dashboard/InPageLink";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { dashboardContent } from "@/content/dashboard";
import type { AttentionItem } from "@/lib/dashboard/attention";

const rowClass =
  "group flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-paper sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6";

/**
 * "Needs your attention": what the person should do something about, most
 * pressing first. The page leaves it out entirely when there is nothing.
 * An item pointing further down this page ("#...") scrolls there every time
 * it is clicked; any other opens its page.
 */
export function AttentionList({ items, className }: { items: AttentionItem[]; className?: string }) {
  const headingId = "dashboard-attention";
  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="font-display text-2xl text-ink">
        {dashboardContent.attention.title}
      </h2>
      <Card barline className="mt-4 overflow-hidden">
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.id}>
              <ItemLink href={item.href}>
                <span className="min-w-0">
                  <span className={cn("block text-ink", item.priority === "urgent" && "font-medium")}>{item.title}</span>
                  {item.detail ? <span className="mt-0.5 block text-sm text-muted">{item.detail}</span> : null}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm text-muted transition-colors group-hover:text-ink">
                  {item.action}
                  <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
              </ItemLink>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function ItemLink({ href, children }: { href: string; children: ReactNode }) {
  if (href.startsWith("#")) {
    return (
      <InPageLink href={href as `#${string}`} className={rowClass}>
        {children}
      </InPageLink>
    );
  }
  return (
    <Link href={href} className={rowClass}>
      {children}
    </Link>
  );
}
