/**
 * Which weeks the Inserts page shows - only what needs planning, a month at a
 * time:
 *
 *   - A week that has begun is never shown: its Sunday has come, so its
 *     insert is already being sung.
 *   - The planning month is the month of the first week still to come. It is
 *     always shown, planned or not, so a finished month can still be checked.
 *   - The months after it come into view as planning-window.ts says: the
 *     next from `leadDays` before its first day, or sooner with "Start
 *     planning <month>" (`ahead`), and "Not yet" sends it away again.
 *   - Once a later month is showing, a fully planned month before it folds
 *     away to one line; once the month after that is fully planned too, the
 *     folded month goes. A month with weeks still to choose stays open: it
 *     still needs work. The last month shown is always open.
 *
 * A week belongs to the month its Sunday is in. Pure - no clock, no
 * server-only import - so it is unit tested.
 */

import { addDays } from "@/lib/availability/occurrences";
import { dayOfWeek } from "@/lib/service-time";

import { weekStartOf } from "./model";
import { monthAfter, monthEnd, planningMonths } from "./planning-window";

export interface InsertMonth {
  /** "2026-10" */
  month: string;
  /** Its weeks still to come, by their Sundays. */
  weekStarts: string[];
  /** Every one of those weeks has an insert. */
  planned: boolean;
  /** Folded to one line: planned, and a later month is up. */
  collapsed: boolean;
}

/** The first Sunday still to come: the week after today's. */
function firstWeekAfter(today: string): string {
  return addDays(weekStartOf(today), 7);
}

/** The Sundays of `month` from `from` (a Sunday in it) on. */
function sundaysFrom(month: string, from: string): string[] {
  const weeks: string[] = [];
  for (let week = from; week.startsWith(month); week = addDays(week, 7)) weeks.push(week);
  return weeks;
}

/** The months in view before any is folded or dropped (planning-window.ts), from the first week to come. */
function monthsInView(today: string, leadDays: number, ahead: number): string[] {
  return planningMonths(firstWeekAfter(today).slice(0, 7), today, leadDays, ahead);
}

/**
 * Every day the page may need: the first week to come through the last week
 * in view - whose Wednesday may fall in the month after (Nov 29's week ends
 * on Dec 5).
 */
export function insertRange(today: string, leadDays: number, ahead = 0): { from: string; to: string } {
  const lastDay = monthEnd(monthsInView(today, leadDays, ahead).at(-1)!);
  return { from: firstWeekAfter(today), to: addDays(weekStartOf(lastDay), 6) };
}

/** The months to show, in order (see above). `planned` holds the Sundays of weeks that have an insert. */
export function insertMonths(today: string, planned: ReadonlySet<string>, leadDays: number, ahead = 0): InsertMonth[] {
  const firstWeek = firstWeekAfter(today);
  const months = monthsInView(today, leadDays, ahead).map((key, index): InsertMonth => {
    const start = index === 0 ? firstWeek : addDays(`${key}-01`, (7 - dayOfWeek(`${key}-01`)) % 7);
    const weekStarts = sundaysFrom(key, start);
    return { month: key, weekStarts, planned: weekStarts.every((week) => planned.has(week)), collapsed: false };
  });

  const last = months.length - 1;
  return months.flatMap((month, index) => {
    if (index === last || !month.planned) return [month];
    // Planned, with a later month up: folded, or gone once the month after it is planned too.
    return months[index + 1].planned ? [] : [{ ...month, collapsed: true }];
  });
}

/** The month "Start planning" would bring in next: the one after the last in view. */
export function nextInsertMonth(today: string, leadDays: number, ahead = 0): string {
  return monthAfter(monthsInView(today, leadDays, ahead).at(-1)!);
}
