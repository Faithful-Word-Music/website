"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { publishServices } from "@/app/service-planner/actions";
import { ActionMessage } from "@/components/account/fields";
import { Pill } from "@/components/admin/StatusPill";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { servicePlannerContent } from "@/content/service-planner";
import type { ActionResult } from "@/lib/auth/session";
import { monthLabel } from "@/lib/availability/format";
import { serviceDate, serviceTitle, statusLine } from "@/lib/service-planner/format";
import type { PlannerStatus } from "@/lib/service-planner/model";

import { Chevron } from "./Panel";

const copy = servicePlannerContent;

/** One service in the queue - only what the list shows. */
export interface QueueRow {
  anchor: string;
  date: string;
  slot: "AM" | "PM";
  kind: "regular" | "special";
  label: string | null;
  startsAt: string;
  status: PlannerStatus;
  filled: number;
  target: number;
  /** The songs chosen so far, in order. */
  songs: string[];
}

/**
 * The work queue: what needs planning next, soonest first, month by month.
 * Published services fold away underneath, still a click from editing. Tick
 * several services to publish them together, as one publication.
 */
export function QueueView({
  needsPlanning,
  published,
  cancelled,
  through,
}: {
  needsPlanning: QueueRow[];
  published: QueueRow[];
  cancelled: QueueRow[];
  /** The last day listed, as an instant to format. */
  through: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);

  const toggle = (anchor: string) =>
    setSelected((current) => (current.includes(anchor) ? current.filter((item) => item !== anchor) : [...current, anchor]));

  function publishSelected() {
    setResult(null);
    startTransition(async () => {
      const outcome = await publishServices({ anchors: selected });
      setResult(outcome);
      if (outcome.ok) {
        setSelected([]);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="needs-planning">
        <h2 id="needs-planning" className="font-display text-2xl text-ink sm:text-3xl">
          {copy.queue.needsPlanning}
        </h2>
        {needsPlanning.length === 0 ? (
          <Card className="mt-5 px-5 py-6 text-center text-muted">
            {copy.queue.allPlanned.replace("{date}", serviceDate(through))}
          </Card>
        ) : (
          <div className="mt-5 space-y-6">
            {byMonth(needsPlanning).map(([month, rows]) => (
              <QueueGroup
                key={month}
                title={monthLabel(month)}
                rows={rows}
                next={needsPlanning[0].anchor}
                selected={selected}
                onToggle={toggle}
              />
            ))}
          </div>
        )}
      </section>

      {published.length > 0 ? (
        <Fold title={copy.queue.published.replace("{count}", String(published.length))}>
          <QueueGroup rows={published} selected={selected} onToggle={toggle} />
        </Fold>
      ) : null}

      {cancelled.length > 0 ? (
        <Fold title={copy.queue.cancelled.replace("{count}", String(cancelled.length))}>
          <QueueGroup rows={cancelled} />
        </Fold>
      ) : null}

      {selected.length > 0 || result ? (
        <div className="sticky bottom-4 z-10">
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-lift">
            {selected.length > 0 ? (
              <>
                <span className="text-sm text-ink">{copy.queue.selected.replace("{count}", String(selected.length))}</span>
                <Button type="button" variant="quiet" onClick={() => setSelected([])}>
                  {copy.queue.clearSelection}
                </Button>
                <Button type="button" onClick={publishSelected} disabled={pending} className="ml-auto">
                  {(selected.length === 1 ? copy.queue.publishOne : copy.queue.publishMany).replace(
                    "{count}",
                    String(selected.length),
                  )}
                </Button>
              </>
            ) : null}
            <ActionMessage result={result} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Rows grouped by calendar month, in order: [["2026-10", rows], ...]. */
function byMonth(rows: QueueRow[]): Array<[string, QueueRow[]]> {
  const groups = new Map<string, QueueRow[]>();
  for (const row of rows) groups.set(row.date.slice(0, 7), [...(groups.get(row.date.slice(0, 7)) ?? []), row]);
  return [...groups.entries()];
}

function QueueGroup({
  title,
  rows,
  next,
  selected,
  onToggle,
}: {
  title?: string;
  rows: QueueRow[];
  next?: string;
  selected?: string[];
  onToggle?: (anchor: string) => void;
}) {
  return (
    <div>
      {title ? (
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-dark">{title}</h3>
      ) : null}
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <QueueItem
              key={row.anchor}
              row={row}
              next={row.anchor === next}
              selected={selected?.includes(row.anchor)}
              onToggle={onToggle ? () => onToggle(row.anchor) : undefined}
            />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function QueueItem({
  row,
  next = false,
  selected,
  onToggle,
}: {
  row: QueueRow;
  next?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const title = serviceTitle(row);
  return (
    <li className={cn("group/row relative flex items-stretch transition-colors hover:bg-paper", next && "bg-paper/50")}>
      {next ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-gold" /> : null}
      {onToggle ? (
        <label className="flex shrink-0 cursor-pointer items-center pl-4 pr-1 sm:pl-5">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={copy.queue.select.replace("{service}", `${title}, ${serviceDate(row.startsAt)}`)}
            className="h-4 w-4 accent-[var(--color-ink)]"
          />
        </label>
      ) : (
        <span className="w-4 sm:w-5" aria-hidden="true" />
      )}
      <Link
        href={`/service-planner/${row.anchor}`}
        className="flex min-w-0 flex-1 items-center gap-4 px-3 py-3.5 sm:px-4"
      >
        <span className="w-24 shrink-0 text-sm tabular-nums text-muted">{serviceDate(row.startsAt)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink underline decoration-transparent underline-offset-4 transition-[text-decoration-color] group-hover/row:decoration-gold">
              {title}
            </span>
            {next ? (
              <span className="rounded-full bg-ink px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-paper">
                {copy.queue.next}
              </span>
            ) : null}
            {row.kind === "special" ? <Pill tone="muted">{copy.queue.special}</Pill> : null}
          </span>
          {row.songs.length > 0 ? (
            <span className="mt-0.5 block truncate text-sm text-muted">{row.songs.join(" · ")}</span>
          ) : null}
        </span>
        <span className="hidden shrink-0 sm:block">
          <Pill tone={row.status === "published" ? "strong" : row.status === "draft" ? "warning" : "muted"}>
            {statusLine(row)}
          </Pill>
        </span>
        <Chevron className="shrink-0 transition-[transform,color] group-hover/row:translate-x-0.5 group-hover/row:text-ink" />
      </Link>
    </li>
  );
}

/** A section folded away until opened. */
function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group/fold">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 font-display text-xl text-ink [&::-webkit-details-marker]:hidden">
        <Chevron className="group-open/fold:rotate-90" />
        {title}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
