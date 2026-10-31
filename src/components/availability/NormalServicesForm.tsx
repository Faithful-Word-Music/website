"use client";

import { useEffect, useId, useState } from "react";

import { setNormalPattern } from "@/app/availability/actions";
import { ActionMessage, ChoiceChips } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { UnsavedChangesPrompt } from "@/components/account/profile/UnsavedChangesPrompt";
import { useAction } from "@/components/ui/use-action";
import { availabilityContent } from "@/content/availability";
import { feedbackContent } from "@/content/feedback";
import { SERVICE_AVAILABILITY, type ServiceAvailability } from "@/lib/auth/profile-options";

import type { Subject } from "./ServiceDialog";

const copy = availabilityContent.normal;

/**
 * The services someone usually serves at - the baseline every week starts
 * from. This is the one place it is edited (the profile shows it, and
 * onboarding embeds this same form).
 *
 * Choosing none is an answer only once it is confirmed: an empty pattern
 * nobody has saved is "not reviewed yet", never "no services".
 */
export function NormalServicesForm({
  subject,
  initial,
  reviewed,
  bare = false,
  onSaved,
  onDirtyChange,
  submitLabel,
}: {
  subject: Subject;
  initial: ServiceAvailability[];
  /** Whether the pattern has been saved on purpose before. */
  reviewed: boolean;
  /** Without the card and heading, for onboarding's own step. */
  bare?: boolean;
  onSaved?: () => void;
  /** In onboarding, the page's own guard is told; on its own, this form guards itself. */
  onDirtyChange?: (dirty: boolean) => void;
  submitLabel?: string;
}) {
  const ids = useId();
  const [selected, setSelected] = useState(initial);
  const [confirmNone, setConfirmNone] = useState(false);
  const { result, clear, run, stateOf } = useAction();
  const changed = [...selected].sort().join() !== [...initial].sort().join();
  useEffect(() => onDirtyChange?.(changed), [onDirtyChange, changed]);
  // An unreviewed pattern can be saved as it stands - that is the review.
  const canSave = (changed || !reviewed) && (selected.length > 0 || confirmNone);

  function save() {
    void run(
      () =>
        setNormalPattern({
          services: selected,
          confirmNone: selected.length === 0 ? confirmNone : undefined,
          userId: subject.isSelf ? undefined : subject.id,
        }),
      // In onboarding the next step loads instead: no refresh racing it.
      { onOk: onSaved, refresh: !onSaved },
    );
  }

  const body = (
    <>
      <div className="mt-4">
        <ChoiceChips
          name={`${ids}-services`}
          legend={copy.legend}
          options={SERVICE_AVAILABILITY}
          selected={selected}
          multiple
          onChange={(next) => {
            setSelected(next);
            if (next.length > 0) setConfirmNone(false);
            clear();
          }}
        />
      </div>
      {selected.length === 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted">{copy.none}</p>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-ink"
              checked={confirmNone}
              onChange={(event) => {
                setConfirmNone(event.target.checked);
                clear();
              }}
            />
            <span>{subject.isSelf ? copy.confirmNone : copy.confirmNoneOther.replace("{name}", subject.name)}</span>
          </label>
        </div>
      ) : null}
      {!reviewed ? <p className="mt-3 text-xs text-muted">{copy.unreviewed}</p> : null}
      <div className={bare ? "mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-5" : "mt-4 flex flex-wrap items-center gap-3"}>
        <Button
          type="button"
          size={bare ? "lg" : "md"}
          state={stateOf()}
          pendingLabel={feedbackContent.saving}
          doneLabel={feedbackContent.saved}
          onClick={save}
          disabled={!canSave}
        >
          {submitLabel ?? copy.save}
        </Button>
        <ActionMessage result={result} />
      </div>
    </>
  );

  if (bare) return <div>{body}</div>;

  return (
    <Card className="p-5 sm:p-6">
      {/* On the Availability page this form is the page's only unsaved work: it guards itself. */}
      <UnsavedChangesPrompt dirty={changed} />
      <section id="normal" aria-labelledby={`${ids}-title`} className="scroll-mt-24">
        <h2 id={`${ids}-title`} className="font-display text-xl text-ink">
          {subject.isSelf ? copy.title : copy.titleOther.replace("{name}", subject.name)}
        </h2>
        <p className="mt-1 text-sm text-muted">{subject.isSelf ? copy.lead : copy.leadOther}</p>
        {body}
      </section>
    </Card>
  );
}
