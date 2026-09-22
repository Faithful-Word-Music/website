import { ViewTransition, type ReactNode } from "react";

/**
 * Animates the move from one route to the next: the old page fades out and
 * lifts slightly, the new one fades in and settles. The timing lives in
 * src/app/globals.css under `.page-exit` / `.page-enter`.
 *
 * Wrap the content of every page in this. It belongs in each page.tsx and NOT
 * in the layout - layouts persist across navigation, so enter and exit would
 * never fire there.
 *
 * `default="none"` keeps this wrapper from animating during unrelated
 * transitions. Browsers without the View Transitions API just swap pages
 * instantly, exactly as before.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {/* A single element, which is what ViewTransition needs to name. */}
      <div>{children}</div>
    </ViewTransition>
  );
}
