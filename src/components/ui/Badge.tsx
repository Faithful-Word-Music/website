import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * A short label on a tinted pill: a state ("Ready", "Needs a leader") or a
 * tag. The words carry the meaning; the tone only reinforces it, so a badge
 * still reads correctly without colour.
 *
 *   neutral  a plain tag, no state
 *   success  positive: ready, done, confirmed
 *   warning  attention: needs a look before the service
 *   danger   critical: blocked, failed, missing
 *   info     informational: a note, nothing to act on
 *   gold     the brand accent (a highlight, never a status)
 *
 * For a number (unread, waiting) use CountBadge instead.
 */
export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "gold";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-line bg-paper text-ink-soft",
  success: "border-transparent bg-success-bg text-success",
  warning: "border-transparent bg-warning-bg text-warning",
  danger: "border-transparent bg-danger-bg text-danger",
  info: "border-transparent bg-info-bg text-info",
  // gold-dark is the gold that passes AA as small text.
  gold: "border-gold/50 bg-transparent text-gold-dark",
};

export function Badge({
  tone = "neutral",
  icon,
  className,
  children,
}: {
  tone?: BadgeTone;
  /** An optional leading icon (<Icon size={12} />): decorative, beside the words. */
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold leading-4",
        TONES[tone],
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}
