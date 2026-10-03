"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";

import { publishServices } from "@/app/service-planner/actions";
import { ActionMessage } from "@/components/account/fields";
import { Pill } from "@/components/admin/StatusPill";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { Collapse } from "@/components/ui/Collapse";
import { servicePlannerContent } from "@/content/service-planner";
import type { ActionResult } from "@/lib/auth/session";
import { monthLabel } from "@/lib/availability/format";
import { serviceDate, serviceTitle, statusLine } from "@/lib/service-planner/format";
import type { PlannerStatus } from "@/lib/service-planner/model";

import { MonthTransition, MovesWithMonths } from "./MonthTransition";
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
 * Published services fold away above it (they come first), still a click
 * from editing. Tick
 * several services to publish them together, as one publication.
 */
export function QueueView({
  needsPlanning,
  published,
  cancelled,
  through,
  planAhead,
}: {
  needsPlanning: QueueRow[];
  published: QueueRow[];
  cancelled: QueueRow[];
  /** The last day listed, as an instant to format. */
  through: string;
  /** "Start planning <month>" and "Not yet", at the end of the list (PlanAhead). */
  planAhead?: ReactNode;
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
      {/* Earlier than the services still to plan, so above them - as past services sit on the song list. */}
      {published.length > 0 || cancelled.length > 0 ? (
        <div className="space-y-2">
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
        </div>
      ) : null}

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
              <MonthTransition key={month}>
                <QueueGroup
                  title={monthLabel(month)}
                  rows={rows}
                  next={needsPlanning[0].anchor}
                  selected={selected}
                  onToggle={toggle}
                />
              </MonthTransition>
            ))}
          </div>
        )}
        {planAhead ? (
          <MovesWithMonths name="queue-plan-ahead">
            <div className="mt-6">{planAhead}</div>
          </MovesWithMonths>
        ) : null}
      </section>

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
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3.5 sm:gap-4 sm:px-4"
      >
        {/* A column of its own from `sm`; on a phone a small line above the title, so the title keeps the width. */}
        <span className="hidden w-24 shrink-0 text-sm tabular-nums text-muted sm:block">{serviceDate(row.startsAt)}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs tabular-nums text-muted sm:hidden">{serviceDate(row.startsAt)}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-ink underline decoration-transparent underline-offset-4 transition-[text-decoration-color] group-hover/row:decoration-gold">
              {title}
            </span>
            {row.kind === "special" ? (
              <span className="shrink-0">
                <Pill tone="muted">{copy.queue.special}</Pill>
              </span>
            ) : null}
          </span>
          {row.songs.length > 0 ? (
            <span className="mt-0.5 block truncate text-sm text-muted">{row.songs.join(" · ")}</span>
          ) : null}
        </span>
        {/* Next to plan - not the song list's Next, which means the next service to happen. */}
        {next ? (
          <span className="shrink-0">
            <Pill tone="neutral">{copy.queue.planNext}</Pill>
          </span>
        ) : null}
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
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={id}
        className="flex min-h-11 cursor-pointer items-center gap-2.5 text-left font-display text-xl text-ink"
      >
        <Chevron className={cn("duration-200", open && "rotate-90")} />
        {title}
      </button>
      <Collapse open={open} id={id}>
        <div className="pt-3">{children}</div>
      </Collapse>
    </div>
  );
}
