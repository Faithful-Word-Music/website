import { cn } from "@/components/ui/cn";
import type { AvailabilityState } from "@/lib/availability/effective";
import { stateLabel, stateShort } from "@/lib/availability/format";

/**
 * The one visual language for availability states, used on the calendar,
 * in the dialogs and on the Dashboard. Design tokens only, so dark mode
 * follows on its own:
 *
 *   normally available     quiet: a solid ink dot
 *   not normally           quieter still: a hollow dot, muted
 *   available by exception gold: a gold "+"
 *   unavailable by exception  struck through, with a "×"
 */

export function stateTone(state: AvailabilityState | null): string {
  switch (state) {
    case "normally-available":
      return "border-line bg-paper text-ink";
    case "normally-unavailable":
      return "border-dashed border-line bg-transparent text-muted";
    case "available-by-exception":
      return "border-gold bg-[color-mix(in_srgb,var(--color-gold)_12%,transparent)] text-ink";
    case "unavailable-by-exception":
      return "border-[color-mix(in_srgb,var(--color-gold-dark)_45%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-ink)_5%,transparent)] text-muted";
    default:
      return "border-line bg-paper text-ink-soft";
  }
}

export function StateMark({ state, className }: { state: AvailabilityState | null; className?: string }) {
  const base = cn("inline-grid size-3.5 shrink-0 place-items-center", className);
  switch (state) {
    case "normally-available":
      return (
        <span aria-hidden="true" className={base}>
          <span className="size-2 rounded-full bg-ink" />
        </span>
      );
    case "normally-unavailable":
      return (
        <span aria-hidden="true" className={base}>
          <span className="size-2 rounded-full border border-muted" />
        </span>
      );
    case "available-by-exception":
      return (
        <svg aria-hidden="true" viewBox="0 0 14 14" className={cn(base, "text-gold-dark")}>
          <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "unavailable-by-exception":
      return (
        <svg aria-hidden="true" viewBox="0 0 14 14" className={cn(base, "text-gold-dark")}>
          <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <span aria-hidden="true" className={base}>
          <span className="size-1.5 rounded-full bg-muted" />
        </span>
      );
  }
}

/** A state as a small labelled pill: "× Away". */
export function StatePill({ state, long = false, className }: { state: AvailabilityState; long?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        stateTone(state),
        className,
      )}
    >
      <StateMark state={state} />
      <span className={cn(state === "unavailable-by-exception" && "line-through decoration-1")}>
        {long ? stateLabel(state) : stateShort(state)}
      </span>
    </span>
  );
}

/** The small count of people with changes, on a calendar service. */
export function ChangeBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "tnum inline-grid min-w-5 place-items-center rounded-full bg-ink px-1.5 text-[0.7rem] font-semibold leading-5 text-paper",
        className,
      )}
    >
      {count}
    </span>
  );
}
