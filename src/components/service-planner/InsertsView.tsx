"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { applyInsertToPublished, setInsertWeek } from "@/app/service-planner/actions";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { servicePlannerContent } from "@/content/service-planner";
import type { ActionResult } from "@/lib/auth/session";
import { monthDay, serviceDate, serviceTitle } from "@/lib/service-planner/format";
import type { CandidateSong } from "@/lib/service-planner/intelligence";
import { followsWeek, type InsertWeek, type PlannerService } from "@/lib/service-planner/model";

import { SongPicker } from "./SongPicker";

const copy = servicePlannerContent.inserts;

export interface InsertWeekRow {
  weekStart: string;
  insert: InsertWeek | null;
  services: Array<Omit<PlannerService, "plan">>;
}

/**
 * The longer-range plan: one insert (a Psalm or other song) per week. Setting
 * a week's insert puts it third in that week's Sunday and Wednesday services
 * that still follow the week; published ones are only changed when asked.
 */
export function InsertsView({ weeks, candidates, now }: { weeks: InsertWeekRow[]; candidates: CandidateSong[]; now: number }) {
  const [choosing, setChoosing] = useState<string | null>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<Record<string, ActionResult<unknown>>>({});

  function run(weekStart: string, action: () => Promise<ActionResult<unknown>>) {
    startTransition(async () => {
      const outcome = await action();
      setResults((current) => ({ ...current, [weekStart]: outcome }));
      if (outcome.ok) router.refresh();
    });
  }

  return (
    <>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {weeks.map((week) => {
            const following = week.services.filter((service) => service.insertMode === "week");
            const custom = week.services.length - following.length;
            const outdated = following.filter(
              (service) => service.status === "published" && !followsWeek(service.slots, week.insert),
            ).length;
            const sunday = `${week.weekStart}T12:00:00-07:00`;

            return (
              <li key={week.weekStart} className="grid gap-3 px-5 py-4 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:px-6">
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
                    {custom > 0 ? ` - ${copy.custom.replace("{count}", String(custom))}` : ""}
                  </p>
                  {outdated > 0 ? (
                    <p className="mt-1 text-xs text-gold-dark">
                      {copy.outdated.replace("{count}", String(outdated))}{" "}
                      <button
                        type="button"
                        disabled={pending}
                        className="font-medium underline decoration-gold underline-offset-4 transition-colors hover:text-ink disabled:opacity-60"
                        onClick={() => run(week.weekStart, () => applyInsertToPublished({ weekStart: week.weekStart }))}
                      >
                        {copy.updatePublished}
                      </button>
                    </p>
                  ) : null}
                  <ActionMessage result={results[week.weekStart] ?? null} />
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => setChoosing(week.weekStart)} disabled={pending}>
                    {week.insert ? copy.change : copy.choose}
                  </Button>
                  {week.insert ? (
                    <Button
                      type="button"
                      variant="quiet"
                      disabled={pending}
                      onClick={() => run(week.weekStart, () => setInsertWeek({ weekStart: week.weekStart, song: null }))}
                    >
                      {copy.clear}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {choosing ? (
        <SongPicker
          candidates={candidates}
          serviceStartsAt={`${choosing}T10:30:00-07:00`}
          now={now}
          title={copy.weekOf.replace("{date}", serviceDate(`${choosing}T12:00:00-07:00`))}
          onChoose={(song) => {
            const weekStart = choosing;
            setChoosing(null);
            run(weekStart, () => setInsertWeek({ weekStart, song }));
          }}
          onClose={() => setChoosing(null)}
        />
      ) : null}
    </>
  );
}
