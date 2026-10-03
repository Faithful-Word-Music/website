import type { ReactNode } from "react";

import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";

/**
 * The planner's side panels, in the style of Availability's (a card with a
 * display-face title). `collapsible` folds the body away behind the title
 * with a chevron, for tools used now and then (exports).
 */
export function Panel({
  title,
  lead,
  aside,
  collapsible = false,
  className,
  children,
}: {
  title: string;
  lead?: string;
  aside?: ReactNode;
  collapsible?: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (collapsible) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <details className="group/panel">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-paper/60 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block font-display text-xl text-ink">{title}</span>
              {lead ? <span className="mt-1 block text-sm text-muted">{lead}</span> : null}
            </span>
            <Chevron className="mt-2 shrink-0 group-open/panel:rotate-90" />
          </summary>
          <div className="border-t border-line px-5 py-4">{children}</div>
        </details>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex items-baseline justify-between gap-3 px-5 pt-5">
        <h2 className="font-display text-xl text-ink">{title}</h2>
        {aside}
      </div>
      {lead ? <p className="mt-1 px-5 text-sm text-muted">{lead}</p> : null}
      <div className="px-5 pb-5 pt-3">{children}</div>
    </Card>
  );
}

/** The small "›" that turns to point down when its section opens. */
export function Chevron({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      className={cn("text-muted transition-transform", className)}
    >
      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A disclosure inside a panel ("3 expected", "Service details"), with the same chevron. */
export function Disclosure({ summary, children, className }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={cn("group/disclosure", className)}>
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-2 text-sm text-ink [&::-webkit-details-marker]:hidden">
        <Chevron className="group-open/disclosure:rotate-90" />
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
