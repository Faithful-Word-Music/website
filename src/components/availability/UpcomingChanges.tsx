"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setServiceAvailability } from "@/app/availability/actions";
import { ActionMessage } from "@/components/account/fields";
import { Card } from "@/components/ui/Card";
import { availabilityContent } from "@/content/availability";
import type { UpcomingChange } from "@/lib/availability/board";
import { serviceName, serviceShort } from "@/lib/availability/format";

import { StatePill } from "./parts";

const copy = availabilityContent.upcoming;

type Result = { ok: boolean; message?: string; error?: string } | null;

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
  const router = useRouter();
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function remove(change: UpcomingChange) {
    const key = `${change.id}|${change.date}|${change.slot}`;
    setBusyKey(key);
    setResult(null);
    startTransition(async () => {
      const outcome = await setServiceAvailability({
        date: change.date,
        slot: change.slot,
        status: "normal",
        userId: managedId ?? undefined,
      });
      setResult(outcome.ok ? null : outcome);
      setBusyKey(null);
      if (outcome.ok) router.refresh();
    });
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
                    aria-label={copy.removeLabel.replace("{name}", change.name).replace("{date}", serviceShort(change))}
                    className="mt-1.5 text-xs text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-gold disabled:opacity-60"
                  >
                    {busyKey === key ? availabilityContent.service.saving : copy.remove}
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
