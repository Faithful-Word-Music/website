import { ViewTransition, type ReactNode } from "react";

/**
 * A month in a planner list (Plan, Inserts). "Start planning <month>" and
 * "Not yet" are navigations, so React animates the month arriving (fades up)
 * or leaving (fades out) - `.month-enter` / `.month-exit` in globals.css.
 * Give it the month as its `key`. Nothing animates on other transitions.
 */
export function MonthTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="month-enter" exit="month-exit" default="none">
      {/* A single element, which is what ViewTransition needs to name. */}
      <div>{children}</div>
    </ViewTransition>
  );
}

/**
 * Something below the months (the "Start planning" buttons): slides to its
 * new place as a month comes or goes, instead of jumping there. `name` must
 * be unique on the page.
 */
export function MovesWithMonths({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ViewTransition name={name} update="month-move" share="none" enter="none" exit="none" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
