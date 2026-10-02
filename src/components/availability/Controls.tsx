"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { PillSelect } from "@/components/song-list/PillSelect";
import { cn } from "@/components/ui/cn";
import { availabilityContent } from "@/content/availability";
import type { BoardView } from "@/lib/availability/board";
import { availabilityHref, monthLabel } from "@/lib/availability/format";
import { shiftMonth } from "@/lib/availability/occurrences";

const copy = availabilityContent;

/**
 * The page's controls, all kept in the address (?month, ?view, ?person) so a
 * view can be reloaded or shared, and the server renders exactly that view.
 */
export function AvailabilityControls({
  month,
  thisMonth,
  view,
  person,
  meLabel,
  people,
  selfOnBoard,
}: {
  month: string;
  thisMonth: string;
  view: BoardView;
  /** The person a leader is managing, when not themself. */
  person: string | null;
  /** "Me", or the managed person's name. */
  meLabel: string;
  /** Everyone a leader may manage; empty for everyone else. */
  people: Array<{ id: string; name: string }>;
  selfOnBoard: boolean;
}) {
  const router = useRouter();
  const at = (change: { month?: string; view?: BoardView; person?: string | null }) =>
    availabilityHref({ month, view, person, ...change });

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <nav aria-label={copy.title} className="flex items-center gap-1">
        <MonthLink href={at({ month: shiftMonth(month, -1) })} label={copy.month.previous} direction="previous" />
        <h2 className="min-w-44 text-center font-display text-2xl text-ink" aria-live="polite">
          {monthLabel(month)}
        </h2>
        <MonthLink href={at({ month: shiftMonth(month, 1) })} label={copy.month.next} direction="next" />
        {month !== thisMonth ? (
          <Link
            href={at({ month: thisMonth })}
            className="ml-2 text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-gold"
          >
            {copy.month.today}
          </Link>
        ) : null}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        {people.length > 0 ? (
          <PillSelect
            id="availability-person"
            label={copy.managing.label}
            value={person ?? ""}
            onChange={(value) => router.push(at({ person: value || null }))}
            options={[
              ...(selfOnBoard ? [{ value: "", label: `${copy.managing.label}: ${copy.managing.yourself}` }] : []),
              ...people.map((option) => ({ value: option.id, label: `${copy.managing.label}: ${option.name}` })),
            ]}
            className="min-w-52"
          />
        ) : null}

        <div role="group" aria-label={copy.views.label} className="inline-flex rounded-full border border-line bg-surface p-1">
          {(["everyone", "me"] as const).map((option) => {
            const selected = view === option;
            return (
              <Link
                key={option}
                href={at({ view: option })}
                aria-current={selected ? "true" : undefined}
                scroll={false}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-full px-5 text-sm font-medium transition-colors",
                  selected ? "bg-ink text-paper" : "text-muted hover:text-ink",
                )}
              >
                {option === "everyone" ? copy.views.everyone : meLabel}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthLink({ href, label, direction }: { href: string; label: string; direction: "previous" | "next" }) {
  return (
    <Link
      href={href}
      aria-label={label}
      scroll={false}
      className="inline-grid size-11 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
    >
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d={direction === "previous" ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
