"use client";

import { useState, type ReactNode } from "react";

import { listContent } from "@/content/feedback";

import { Button } from "./Button";
import { Card } from "./Card";

/**
 * How much of a long list is on the page: its first `initial` rows, and
 * `step` more each time `more` is called. `reset` goes back to the first
 * page, for when what is listed changes (a search, a filter, a sort).
 */
export function useShown(total: number, { initial, step }: { initial: number; step: number }) {
  const [limit, setLimit] = useState(initial);
  const shown = Math.min(limit, total);

  return {
    shown,
    remaining: total - shown,
    // From what is showing, not from the last limit: the list may have grown since.
    more: () => setLimit(shown + step),
    reset: () => setLimit(initial),
  };
}

/**
 * The end of a long list: "Show 20 more", and how much of it is showing.
 * Every list that can grow ends in this - the archives, a log, a history -
 * so none of them puts everything it has on the page at once.
 *
 * Nothing is drawn once the whole list is showing. Without `total` (a list
 * whose length is not known until it is fetched) the count is left out, and
 * `remaining` is whatever the caller says there is still to show.
 */
export function ShowMore({
  shown,
  total,
  remaining = total === undefined ? 0 : total - shown,
  step,
  onMore,
  pending = false,
  label,
  countLabel = listContent.showing,
}: {
  shown: number;
  total?: number;
  remaining?: number;
  step: number;
  onMore: () => void;
  /** While more is being fetched. */
  pending?: boolean;
  /** In place of "Show {count} more". */
  label?: string;
  /** In place of "Showing {shown} of {total}", to name what is listed. */
  countLabel?: string;
}) {
  if (remaining <= 0) return null;

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        state={pending ? "pending" : "idle"}
        pendingLabel={listContent.loading}
        onClick={onMore}
        className="px-6 shadow-card"
      >
        {label ?? listContent.showMore.replace("{count}", String(Math.min(step, remaining)))}
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
          <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </Button>
      {total !== undefined ? (
        <p className="text-xs text-muted">{countLabel.replace("{shown}", String(shown)).replace("{total}", String(total))}</p>
      ) : null}
    </div>
  );
}

/**
 * A card's list that shows its first rows and ends in ShowMore. Takes the
 * rows already drawn, so a server page can hand them over as they are.
 */
export function MoreList({
  rows,
  initial = LOG_PAGE.initial,
  step = LOG_PAGE.step,
  className,
  cardClassName,
}: {
  rows: ReactNode[];
  initial?: number;
  step?: number;
  /** The list's own classes. */
  className?: string;
  cardClassName?: string;
}) {
  const { shown, more } = useShown(rows.length, { initial, step });

  return (
    <>
      <Card className={cardClassName}>
        <ul className={className}>{rows.slice(0, shown)}</ul>
      </Card>
      <ShowMore shown={shown} total={rows.length} step={step} onMore={more} />
    </>
  );
}

/** A log or a history: the newest few, then a good many at a time. */
export const LOG_PAGE = { initial: 8, step: 20 } as const;
