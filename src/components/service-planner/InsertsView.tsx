"use client";

import Link from "next/link";
import { useState } from "react";

import { applyInsertToPublished, restoreWeekInserts, setInsertWeek } from "@/app/service-planner/actions";
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
import {
  carriesInsert,
  followsWeek,
  insertRestoreFor,
  MAX_WEEK_INSERTS,
  type InsertIndex,
  type InsertWeek,
  type PlannerService,
} from "@/lib/service-planner/model";
import { normalizeKey, songKey } from "@/lib/song-list";

import { MonthTransition } from "./MonthTransition";
import { Chevron } from "./Panel";
import { SongPicker } from "./SongPicker";

const copy = servicePlannerContent.inserts;
const words = feedbackContent;

export interface InsertWeekRow {
  weekStart: string;
  /** The week's inserts, in order: none, one, or two. */
  inserts: InsertWeek[];
  services: Array<Omit<PlannerService, "plan">>;
}

export type InsertMonthRow = Omit<InsertMonth, "weekStarts"> & { weeks: InsertWeekRow[] };

/**
 * The longer-range plan: one insert (a Psalm or other song) per week, a month
 * at a time - the month being planned, and the next one once it is near
 * (src/lib/service-planner/inserts.ts). Setting a week's insert puts it third
 * in that week's Sunday and Wednesday services that still follow the week;
 * a published one still to come is returned to draft with it (insertUpdateFor).
 *
 * Any week can be given a second insert, which goes fourth. A week reads as
 * it always has until "Add second insert" is used; with two, each has its own
 * line and is changed or cleared by itself.
 */
export function InsertsView({ months, candidates, now }: { months: InsertMonthRow[]; candidates: CandidateSong[]; now: number }) {
  const [choosing, setChoosing] = useState<{ weekStart: string; index: InsertIndex; second: boolean } | null>(null);
  const { pending, result, clear, run: runAction, stateOf } = useAction();
  /** The week the last action was for: its row shows the outcome. */
  const [acted, setActed] = useState<string | null>(null);

  /** Only the week's button that was pressed shows working and done. */
  function run(weekStart: string, index: InsertIndex, button: WeekButton, action: () => Promise<ActionResult<unknown>>) {
    setActed(weekStart);
    void runAction(action, { key: buttonKey(weekStart, index, button) });
  }

  /**
   * The song's own key (the candidates carry it), when the week's insert was
   * saved in another: offered, never applied - the saved key is the plan.
   */
  const currentKeyOf = (insert: InsertWeek): string | null => {
    const current = candidates.find((candidate) => candidate.id === songKey(insert.title))?.defaultKey ?? null;
    return current && (!insert.key || normalizeKey(insert.key) !== normalizeKey(current)) ? current : null;
  };

  const weekList = (month: InsertMonthRow) => (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {month.weeks.map((week) => (
          <WeekRow
            key={week.weekStart}
            week={week}
            now={now}
            pending={pending}
            result={acted === week.weekStart ? result : null}
            stateOf={(index, button) => stateOf(buttonKey(week.weekStart, index, button))}
            onChoose={(index) => {
              // A week's last message goes as soon as something new is done to it.
              if (acted === week.weekStart) clear();
              setChoosing({ weekStart: week.weekStart, index, second: index === 2 || week.inserts.length === 2 });
            }}
            currentKeyOf={currentKeyOf}
            onUseCurrentKey={(insert, key) =>
              run(week.weekStart, insert.index, "key", () =>
                setInsertWeek({
                  weekStart: week.weekStart,
                  index: insert.index,
                  song: { title: insert.title, number: insert.number, key },
                }),
              )
            }
            onClear={(index) => run(week.weekStart, index, "clear", () => setInsertWeek({ weekStart: week.weekStart, index, song: null }))}
            onUpdatePublished={() => run(week.weekStart, 1, "update", () => applyInsertToPublished({ weekStart: week.weekStart }))}
            onRestore={() => run(week.weekStart, 1, "restore", () => restoreWeekInserts({ weekStart: week.weekStart }))}
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
          // This page chooses inserts: only songs that can be one are listed.
          only="inserts"
          serviceStartsAt={`${choosing.weekStart}T10:30:00-07:00`}
          now={now}
          title={(choosing.second ? copy.pickerTitle.replace("{number}", String(choosing.index)) : copy.weekOf).replace(
            "{date}",
            serviceDate(`${choosing.weekStart}T12:00:00-07:00`),
          )}
          onChoose={(song) => {
            const { weekStart, index } = choosing;
            setChoosing(null);
            run(weekStart, index, "set", () => setInsertWeek({ weekStart, index, song }));
          }}
          onClose={() => setChoosing(null)}
        />
      ) : null}
    </>
  );
}

/** A week's actions: setting an insert, clearing it, taking its song's own key, and updating the week's published services. */
type WeekButton = "set" | "clear" | "update" | "key" | "restore";

const buttonKey = (weekStart: string, index: InsertIndex, button: WeekButton) => `${weekStart}:${index}:${button}`;

/** A button that reads as a link, under a week's insert. */
const TEXT_BUTTON =
  "inline-flex items-center gap-1.5 font-medium underline decoration-gold underline-offset-4 transition-colors not-disabled:hover:text-ink";

function WeekRow({
  week,
  now,
  pending,
  result,
  stateOf,
  currentKeyOf,
  onUseCurrentKey,
  onChoose,
  onClear,
  onUpdatePublished,
  onRestore,
}: {
  week: InsertWeekRow;
  now: number;
  /** The song's own key, when an insert was saved in another (or none). */
  currentKeyOf: (insert: InsertWeek) => string | null;
  onUseCurrentKey: (insert: InsertWeek, key: string) => void;
  pending: boolean;
  result: ActionOutcome | null;
  stateOf: (index: InsertIndex, button: WeekButton) => ActionState;
  onChoose: (index: InsertIndex) => void;
  onClear: (index: InsertIndex) => void;
  onUpdatePublished: () => void;
  /** Put the week's inserts back into the services that changed theirs. */
  onRestore: () => void;
}) {
  const following = week.services.filter((service) => service.insertMode === "week");
  const custom = week.services.length - following.length;
  // A service already held keeps what was sung: only those still to come can be brought up to date.
  const outdated = following.filter(
    (service) => service.status === "published" && Date.parse(service.startsAt) > now && !followsWeek(service.slots, week.inserts),
  ).length;
  /** An insert of the week's that none of its services sings: each took it out, or put another song there. */
  const unused = (insert: InsertWeek) =>
    week.services.length > 0 && !week.services.some((service) => carriesInsert(service.slots, [insert]));
  /** Whether any service that changed its inserts can still be given the week's again. */
  const restorable = week.services.some((service) => insertRestoreFor(service, week.inserts, now) !== "leave");
  const sunday = `${week.weekStart}T12:00:00-07:00`;
  const two = week.inserts.length === 2;
  /** The place a new insert would take: the week's insert, or - once it has one - the second. */
  const next: InsertIndex | null = week.inserts.length === 0 ? 1 : week.inserts.length < MAX_WEEK_INSERTS ? 2 : null;

  return (
    <li className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-dark sm:pt-2.5">
        {copy.weekOf.replace("{date}", monthDay(sunday))}
      </p>

      <div className="min-w-0">
        {week.inserts.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="italic text-muted">{copy.none}</p>
            <Button
              type="button"
              variant="secondary"
              state={stateOf(1, "set")}
              pendingLabel={words.saving}
              doneLabel={words.saved}
              onClick={() => onChoose(1)}
              disabled={pending}
            >
              {copy.choose}
            </Button>
          </div>
        ) : (
          <ul className={cn(two && "space-y-3")}>
            {week.inserts.map((insert) => {
              const currentKey = currentKeyOf(insert);
              return (
                <li key={insert.index} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    {two ? (
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
                        {copy.numbered.replace("{number}", String(insert.index))}
                      </p>
                    ) : null}
                    <p className="font-medium text-ink">
                      {insert.number ? <span className="tnum mr-2 font-display text-gold-dark">{insert.number}</span> : null}
                      {insert.title}
                      {insert.key ? <span className="ml-2 text-sm text-muted">· {insert.key}</span> : null}
                    </p>
                    {unused(insert) ? <p className="mt-1 text-xs text-gold-dark">{copy.unused}</p> : null}
                    {currentKey ? (
                      <p className="mt-1 text-xs text-gold-dark">
                        {copy.currentKey.replace("{key}", currentKey)}{" "}
                        <button
                          type="button"
                          disabled={pending}
                          aria-busy={stateOf(insert.index, "key") === "pending" || undefined}
                          // The one at work is not dimmed; its neighbours are.
                          className={cn(TEXT_BUTTON, stateOf(insert.index, "key") !== "pending" && "disabled:opacity-60")}
                          onClick={() => onUseCurrentKey(insert, currentKey)}
                        >
                          {stateOf(insert.index, "key") === "pending" ? <Spinner className="size-3" /> : null}
                          {stateOf(insert.index, "key") === "pending" ? words.updating : copy.useCurrentKey}
                        </button>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      state={stateOf(insert.index, "set")}
                      pendingLabel={words.saving}
                      doneLabel={words.saved}
                      onClick={() => onChoose(insert.index)}
                      disabled={pending}
                    >
                      {copy.change}
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      state={stateOf(insert.index, "clear")}
                      pendingLabel={words.removing}
                      doneLabel={words.removed}
                      disabled={pending}
                      onClick={() => onClear(insert.index)}
                    >
                      {copy.clear}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Only once the week has its insert, and only until it has a second: a week reads as one insert until this is used. */}
        {next === 2 ? (
          <p className="mt-2 text-xs text-muted">
            <button
              type="button"
              disabled={pending}
              aria-busy={stateOf(2, "set") === "pending" || undefined}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 font-medium text-muted transition-colors not-disabled:hover:text-ink",
                stateOf(2, "set") !== "pending" && "disabled:opacity-60",
              )}
              onClick={() => onChoose(2)}
            >
              {stateOf(2, "set") === "pending" ? <Spinner className="size-3" /> : <span aria-hidden="true">+</span>}
              {stateOf(2, "set") === "pending" ? words.saving : copy.addSecond}
            </button>
          </p>
        ) : null}

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
        {restorable ? (
          <p className="mt-1 text-xs text-gold-dark">
            <button
              type="button"
              disabled={pending}
              aria-busy={stateOf(1, "restore") === "pending" || undefined}
              className={cn(TEXT_BUTTON, "min-h-9", stateOf(1, "restore") !== "pending" && "disabled:opacity-60")}
              onClick={onRestore}
            >
              {stateOf(1, "restore") === "pending" ? <Spinner className="size-3" /> : null}
              {stateOf(1, "restore") === "pending" ? words.updating : plural(copy.putBack, week.inserts.length)}
            </button>
          </p>
        ) : null}
        {outdated > 0 ? (
          <p className="mt-1 text-xs text-gold-dark">
            {plural(copy.outdated, outdated)}{" "}
            <button
              type="button"
              disabled={pending}
              aria-busy={stateOf(1, "update") === "pending" || undefined}
              className={cn(TEXT_BUTTON, stateOf(1, "update") !== "pending" && "disabled:opacity-60")}
              onClick={onUpdatePublished}
            >
              {stateOf(1, "update") === "pending" ? <Spinner className="size-3" /> : null}
              {stateOf(1, "update") === "pending" ? words.updating : copy.updatePublished}
            </button>
          </p>
        ) : null}
        {result ? (
          <div className="mt-1">
            <ActionMessage result={result} />
          </div>
        ) : null}
      </div>
    </li>
  );
}
