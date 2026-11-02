"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { ActionState } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { servicePlannerContent } from "@/content/service-planner";
import { diffSlots, type PlanSlots, type SongChange } from "@/lib/service-planner/model";

const ws = servicePlannerContent.workspace;
const review = ws.review;

function describe(change: SongChange): string {
  switch (change.type) {
    case "added":
      return `+ ${change.title}`;
    case "removed":
      return `− ${change.title}`;
    case "moved":
      return `${change.title}: ${change.from} → ${change.to}`;
    case "key":
      return `${change.title}: ${change.from ?? "–"} → ${change.to ?? "–"}`;
  }
}

/**
 * The last look before a service goes public: which service, its songs in
 * order, what changes since it was saved, and the checks worth a second
 * look. It changes nothing itself - Publish goes through the same server
 * action (and its checks) as before.
 */
export function ReviewPublish({
  title,
  saved,
  slots,
  warnings,
  dirty,
  state,
  onPublish,
  onClose,
}: {
  title: string;
  /** The songs as stored, to show what changes. */
  saved: PlanSlots;
  slots: PlanSlots;
  warnings: string[];
  dirty: boolean;
  state: ActionState;
  onPublish: () => void;
  onClose: () => void;
}) {
  const changes = diffSlots(saved, slots);
  const empty = slots.filter((song) => song === null).length;

  return (
    <Modal
      title={review.title.replace("{service}", title)}
      subtitle={review.lead}
      closeLabel={review.cancel}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="quiet" onClick={onClose} disabled={state !== "idle"}>
            {review.cancel}
          </Button>
          <Button
            type="button"
            state={state}
            pendingLabel={feedbackContent.publishing}
            doneLabel={feedbackContent.published}
            onClick={onPublish}
          >
            {dirty ? review.confirmSave : review.confirm}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 text-sm">
        <section>
          <h3 className="font-semibold text-ink">{review.songs}</h3>
          <ol className="mt-2 space-y-1">
            {slots.map((song, index) => (
              <li key={index} className="flex gap-3">
                <span className="tnum w-5 shrink-0 text-right text-muted">{index + 1}</span>
                {song ? (
                  <span className="min-w-0 text-ink">
                    {song.number ? <span className="tnum mr-2 text-gold-dark">{song.number}</span> : null}
                    {song.title}
                    {song.key ? <span className="tnum ml-2 text-muted">{song.key}</span> : null}
                  </span>
                ) : (
                  <span className="italic text-muted">{ws.empty}</span>
                )}
              </li>
            ))}
          </ol>
          {empty > 0 ? <p className="mt-2 text-muted">{review.empty.replace("{count}", String(empty))}</p> : null}
        </section>

        {dirty ? (
          <section>
            <h3 className="font-semibold text-ink">{review.changes}</h3>
            {changes.length === 0 ? (
              <p className="mt-1 text-muted">{review.noChanges}</p>
            ) : (
              <ul className="mt-1 space-y-0.5 text-ink-soft">
                {changes.map((change, index) => (
                  <li key={index}>{describe(change)}</li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section>
          <h3 className="font-semibold text-ink">{review.warnings}</h3>
          {warnings.length === 0 ? (
            <p className="mt-1 text-muted">{review.noWarnings}</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {warnings.map((warning, index) => (
                <li key={index} className="flex gap-2.5 text-ink">
                  <span aria-hidden="true" className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-gold" />
                  {warning}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
