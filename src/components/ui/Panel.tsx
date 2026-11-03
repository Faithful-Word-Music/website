import { useId, type ReactNode } from "react";

import { cn } from "./cn";

/**
 * A titled section on a card: a heading with an optional action at its right
 * ("See all", a menu), the content, and an optional footer. The building
 * block for the signed-in app's sections (the Dashboard's, from Stage 3).
 *
 * A <section> named by its heading, so it shows in a screen reader's list of
 * regions. Pick `titleAs` to fit the page's outline (h2 under the page's h1).
 *
 * Not the Service Planner's Panel (service-planner/Panel.tsx), which is a
 * collapsible group inside the planner's own layout.
 */
export function Panel({
  title,
  titleAs: Heading = "h2",
  description,
  action,
  footer,
  bare = false,
  className,
  bodyClassName,
  children,
}: {
  title: ReactNode;
  titleAs?: "h2" | "h3";
  /** A line under the title. */
  description?: ReactNode;
  /** At the heading's right: a link or a small button. */
  action?: ReactNode;
  footer?: ReactNode;
  /** No padding around the body, for content that brings its own rows (a divided list). */
  bare?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn("flex min-w-0 flex-col rounded-card border border-line bg-surface shadow-card", className)}
    >
      <header className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <Heading id={headingId} className="font-display text-xl text-ink">
            {title}
          </Heading>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </header>
      <div className={cn("min-w-0 flex-1", !bare && "px-5 pb-5", bodyClassName)}>{children}</div>
      {footer ? <footer className="border-t border-line px-5 py-3">{footer}</footer> : null}
    </section>
  );
}
