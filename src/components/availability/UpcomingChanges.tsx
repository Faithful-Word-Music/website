"use client";

import { setServiceAvailability } from "@/app/availability/actions";
import { ActionMessage } from "@/components/account/fields";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/StatusIcons";
import { useAction } from "@/components/ui/use-action";
import { availabilityContent } from "@/content/availability";
import { feedbackContent } from "@/content/feedback";
import type { UpcomingChange } from "@/lib/availability/board";
import { serviceName, serviceShort } from "@/lib/availability/format";

import { StatePill } from "./parts";

const copy = availabilityContent.upcoming;

/**
 * "What changes are coming up?" - the subject's own (each removable, back to
 * normal), or the whole ministry's next few under Everyone.
 */
export function UpcomingChanges({
  title,
  empty,
  changes,
  removableFor,
  showNames,
  managedId,
}: {
  title: string;
  empty: string;
  changes: UpcomingChange[];
  /** Whose changes may be removed from here: the subject, when they may be edited. */
  removableFor: string | null;
  showNames: boolean;
  /** Sent as the person being managed, when it is not the viewer. */
  managedId: string | null;
}) {
  const { pending, result, run, stateOf } = useAction();

  function remove(change: UpcomingChange) {
    // The row itself goes once it has worked, so a toast says it did.
    void run(
      () =>
        setServiceAvailability({
          date: change.date,
          slot: change.slot,
          status: "normal",
          userId: managedId ?? undefined,
        }),
      { key: `${change.id}|${change.date}|${change.slot}`, toast: copy.removed },
    );
  }

  return (
    <Card className="overflow-hidden">
      <h2 className="px-5 pb-3 pt-5 font-display text-xl text-ink sm:px-6">{title}</h2>
      {changes.length === 0 ? (
        <p className="border-t border-line px-5 py-4 text-sm text-muted sm:px-6">{empty}</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {changes.map((change) => {
            const key = `${change.id}|${change.date}|${change.slot}`;
            const canRemove = removableFor === change.id;
            return (
              <li key={key} className="px-5 py-3 sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">
                      {showNames ? change.name : serviceShort(change)}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {showNames ? `${serviceShort(change)} · ` : ""}
                      {serviceName(change)}
                      {change.note ? ` · “${change.note}”` : ""}
                    </span>
                  </span>
                  <StatePill state={change.state} className="shrink-0" />
                </div>
                {canRemove ? (
                  <button
                    type="button"
                    onClick={() => remove(change)}
                    disabled={pending}
                    aria-busy={stateOf(key) === "pending" || undefined}
                    aria-label={copy.removeLabel.replace("{name}", change.name).replace("{date}", serviceShort(change))}
                    className={cn(
                      "mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted underline decoration-line underline-offset-4 transition-colors not-disabled:hover:text-ink not-disabled:hover:decoration-gold",
                      // The one at work is not dimmed; its neighbours are.
                      stateOf(key) !== "pending" && "disabled:opacity-60",
                    )}
                  >
                    {stateOf(key) === "pending" ? <Spinner className="size-3" /> : null}
                    {stateOf(key) === "pending" ? feedbackContent.saving : copy.remove}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {result ? (
        <div className="border-t border-line px-5 py-3 sm:px-6">
          <ActionMessage result={result} />
        </div>
      ) : null}
    </Card>
  );
}
