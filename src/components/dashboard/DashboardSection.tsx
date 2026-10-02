import type { ReactNode } from "react";

import { ExpandableList } from "@/components/dashboard/ExpandableList";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";

/**
 * The Dashboard's building blocks, so every list looks and sizes the same.
 *
 *   DashboardGrid  the grid Coming up uses (1, 2, then 3 columns). Cards in
 *                  a row stretch to the same height.
 *   ListCard       a titled card holding one list. It shows the first
 *                  `limit` rows; "Show all" opens every row in a dialog, so
 *                  a long list never stretches its card (or its row).
 *   ListRow        one row: the main line, an optional right-hand note, and
 *                  a second line - every row two lines, so rows line up.
 */

export function DashboardGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", className)}>{children}</div>;
}

/** Rows shown before "Show all". */
export const LIST_LIMIT = 5;

export function ListCard({
  id,
  title,
  lead,
  aside,
  rows,
  limit = LIST_LIMIT,
  className,
}: {
  /** Also the anchor ("#id") attention items can link to. */
  id: string;
  title: string;
  lead?: string;
  /** At the right of the title, e.g. a count. */
  aside?: ReactNode;
  rows: ReactNode[];
  limit?: number;
  className?: string;
}) {
  const headingId = `${id}-heading`;

  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-24", className)}>
      <Card className="flex h-full flex-col overflow-hidden">
        <header className="px-5 pb-3 pt-5">
          <div className="flex items-baseline justify-between gap-3">
            {/* h3: every card sits under a section heading (Getting ready, People). */}
            <h3 id={headingId} className="font-display text-xl text-ink">
              {title}
            </h3>
            {aside}
          </div>
          {lead ? <p className="mt-1 text-sm text-muted">{lead}</p> : null}
        </header>

        {rows.length > limit ? (
          <ExpandableList rows={rows} limit={limit} title={title} lead={lead} />
        ) : (
          <ul className="divide-y divide-line border-t border-line">{rows}</ul>
        )}
      </Card>
    </section>
  );
}

export function ListRow({
  main,
  aside,
  detail,
}: {
  main: ReactNode;
  aside?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <li className="px-5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate">{main}</span>
        {aside ? <span className="shrink-0 text-xs text-muted">{aside}</span> : null}
      </div>
      {detail ? <div className="mt-1 min-w-0 truncate text-xs text-muted">{detail}</div> : null}
    </li>
  );
}
