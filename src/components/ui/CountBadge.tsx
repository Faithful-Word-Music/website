import { countLabel } from "@/lib/count-label";

import { cn } from "./cn";

/**
 * A count on a dark pill: unread notifications, requests waiting. Nothing at
 * zero, and "99+" (or `max`+) past what fits.
 *
 * Two ways to sit:
 *
 *   inline   beside a label in a row (SectionNav, the admin sidebar). The
 *            number is read out together with `label` ("3 waiting"), so a
 *            screen reader hears what the number counts.
 *   overlay  on the corner of an icon button (the bell). Hidden from screen
 *            readers: the button's own name must already say the count
 *            ("Notifications, 3 unread"), so it is not read twice.
 */
export function CountBadge({
  count,
  label,
  max = 99,
  variant = "inline",
  className,
}: {
  count: number;
  /**
   * With `inline`: what the count is, read in place of the bare number -
   * "3 waiting" (make it with plural()). Not used by `overlay`.
   */
  label?: string;
  max?: number;
  variant?: "inline" | "overlay";
  className?: string;
}) {
  const text = countLabel(count, max);
  if (!text) return null;

  if (variant === "overlay") {
    return (
      <span
        aria-hidden="true"
        data-count-badge=""
        className={cn(
          "absolute right-0.5 top-1 inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-ink px-1 text-[0.65rem] font-semibold leading-none text-paper tabular-nums ring-2 ring-surface",
          className,
        )}
      >
        {text}
      </span>
    );
  }

  return (
    <span
      data-count-badge=""
      className={cn("shrink-0 rounded-full bg-ink px-2 py-0.5 text-[0.7rem] font-semibold text-paper tabular-nums", className)}
    >
      <span aria-hidden={label ? true : undefined}>{text}</span>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
