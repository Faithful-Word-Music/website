"use client";

import Link from "next/link";
import { useState } from "react";

import { applyInsertToPublished, setInsertWeek } from "@/app/service-planner/actions";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/StatusIcons";
import { useAction, type ActionOutcome, type ActionState } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { servicePlannerContent } from "@/content/service-planner";
import type { ActionResult } from "@/lib/auth/session";
import { monthLabel } from "@/lib/availability/format";
import { plural } from "@/lib/plural";
import { monthDay, serviceDate, serviceTitle } from "@/lib/service-planner/format";
import type { InsertMonth } from "@/lib/service-planner/inserts";
import type { CandidateSong } from "@/lib/service-planner/intelligence";
import { followsWeek, type InsertWeek, type PlannerService } from "@/lib/service-planner/model";

import { MonthTransition } from "./MonthTransition";
import { Chevron } from "./Panel";
import { SongPicker } from "./SongPicker";

const copy = servicePlannerContent.inserts;
const words = feedbackContent;

export interface InsertWeekRow {
  weekStart: string;
  insert: InsertWeek | null;
  services: Array<Omit<PlannerService, "plan">>;
}

export type InsertMonthRow = Omit<InsertMonth, "weekStarts"> & { weeks: InsertWeekRow[] };

/**
 * The longer-range plan: one insert (a Psalm or other song) per week, a month
 * at a time - the month being planned, and the next one once it is near
 * (src/lib/service-planner/inserts.ts). Setting a week's insert puts it third
 * in that week's Sunday and Wednesday services that still follow the week;
 * published ones are only changed when asked.
 */
export function InsertsView({ months, candidates, now }: { months: InsertMonthRow[]; candidates: CandidateSong[]; now: number }) {
  const [choosing, setChoosing] = useState<string | null>(null);
  const { pending, result, clear, run: runAction, stateOf } = useAction();
  /** The week the last action was for: its row shows the outcome. */
  const [acted, setActed] = useState<string | null>(null);

  /** Only the week's button that was pressed shows working and done. */
  function run(weekStart: string, button: WeekButton, action: () => Promise<ActionResult<unknown>>) {
    setActed(weekStart);
    void runAction(action, { key: `${weekStart}:${button}` });
  }

  const weekList = (month: InsertMonthRow) => (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {month.weeks.map((week) => (
          <WeekRow
            key={week.weekStart}
            week={week}
            pending={pending}
            result={acted === week.weekStart ? result : null}
            stateOf={(button) => stateOf(`${week.weekStart}:${button}`)}
            onChoose={() => {
              // A week's last message goes as soon as something new is done to it.
              if (acted === week.weekStart) clear();
              setChoosing(week.weekStart);
            }}
            onClear={() => run(week.weekStart, "clear", () => setInsertWeek({ weekStart: week.weekStart, song: null }))}
            onUpdatePublished={() => run(week.weekStart, "update", () => applyInsertToPublished({ weekStart: week.weekStart }))}
          />
        ))}
      </ul>
    </Card>
  );

  return (
    <>
      <div className="space-y-8">
        {months.map((month) => (
          <MonthTransition key={month.month}>
            {month.collapsed ? (
              // Planned, and the next month is up: one line, still there to check.
              <details className="group/fold">
                <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2.5 [&::-webkit-details-marker]:hidden">
                  <Chevron className="group-open/fold:rotate-90" />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-dark">{monthLabel(month.month)}</span>
                  <span className="text-sm text-muted">{plural(copy.monthPlanned, month.weeks.length)}</span>
                </summary>
                <div className="mt-2">{weekList(month)}</div>
              </details>
            ) : (
              <section aria-label={monthLabel(month.month)}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-dark">{monthLabel(month.month)}</h3>
                {weekList(month)}
              </section>
            )}
          </MonthTransition>
        ))}
      </div>

      {choosing ? (
        <SongPicker
          candidates={candidates}
          serviceStartsAt={`${choosing}T10:30:00-07:00`}
          now={now}
          title={copy.weekOf.replace("{date}", serviceDate(`${choosing}T12:00:00-07:00`))}
          onChoose={(song) => {
            const weekStart = choosing;
            setChoosing(null);
            run(weekStart, "set", () => setInsertWeek({ weekStart, song }));
          }}
          onClose={() => setChoosing(null)}
        />
      ) : null}
    </>
  );
}

/** A week's actions: setting its insert, clearing it, and updating its published services. */
type WeekButton = "set" | "clear" | "update";

function WeekRow({
  week,
  pending,
  result,
  stateOf,
  onChoose,
  onClear,
  onUpdatePublished,
}: {
  week: InsertWeekRow;
  pending: boolean;
  result: ActionOutcome | null;
  stateOf: (button: WeekButton) => ActionState;
  onChoose: () => void;
  onClear: () => void;
  onUpdatePublished: () => void;
}) {
  const following = week.services.filter((service) => service.insertMode === "week");
  const custom = week.services.length - following.length;
  const outdated = following.filter((service) => service.status === "published" && !followsWeek(service.slots, week.insert)).length;
  const sunday = `${week.weekStart}T12:00:00-07:00`;

  return (
    <li className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-dark">
        {copy.weekOf.replace("{date}", monthDay(sunday))}
      </p>

      <div className="min-w-0">
        {week.insert ? (
          <p className="font-medium text-ink">
            {week.insert.number ? <span className="tnum mr-2 font-display text-gold-dark">{week.insert.number}</span> : null}
            {week.insert.title}
            {week.insert.key ? <span className="ml-2 text-sm text-muted">· {week.insert.key}</span> : null}
          </p>
        ) : (
          <p className="italic text-muted">{copy.none}</p>
        )}
        <p className="mt-1 text-xs text-muted">
          {week.services.map((service, index) => (
            <span key={service.anchor}>
              {index > 0 ? " · " : ""}
              <Link
                href={`/service-planner/${service.anchor}`}
                className="underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-gold"
              >
                {serviceTitle(service)}
              </Link>
            </span>
          ))}
          {custom > 0 ? ` - ${plural(copy.custom, custom)}` : ""}
        </p>
        {outdated > 0 ? (
          <p className="mt-1 text-xs text-gold-dark">
            {plural(copy.outdated, outdated)}{" "}
            <button
              type="button"
              disabled={pending}
              aria-busy={stateOf("update") === "pending" || undefined}
              className={cn(
                "inline-flex items-center gap-1.5 font-medium underline decoration-gold underline-offset-4 transition-colors not-disabled:hover:text-ink",
                // The one at work is not dimmed; its neighbours are.
                stateOf("update") !== "pending" && "disabled:opacity-60",
              )}
              onClick={onUpdatePublished}
            >
              {stateOf("update") === "pending" ? <Spinner className="size-3" /> : null}
              {stateOf("update") === "pending" ? words.updating : copy.updatePublished}
            </button>
          </p>
        ) : null}
        {result ? (
          <div className="mt-1">
            <ActionMessage result={result} />
          </div>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          state={stateOf("set")}
          pendingLabel={words.saving}
          doneLabel={words.saved}
          onClick={onChoose}
          disabled={pending}
        >
          {week.insert ? copy.change : copy.choose}
        </Button>
        {week.insert ? (
          <Button
            type="button"
            variant="quiet"
            state={stateOf("clear")}
            pendingLabel={words.removing}
            doneLabel={words.removed}
            disabled={pending}
            onClick={onClear}
          >
            {copy.clear}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
