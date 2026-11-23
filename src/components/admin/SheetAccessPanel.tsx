"use client";

import { useState } from "react";

import { activateSheetAccessAction, rollbackSheetAccessAction } from "@/app/admin/actions";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { useAction } from "@/components/ui/use-action";
import { adminContent } from "@/content/admin";
import { feedbackContent } from "@/content/feedback";

const copy = adminContent.sheetAccess.activation;

/** Activate, with one confirmation that says what it does and where. */
export function ActivateSheetAccess({
  reportHash,
  environment,
  blocked,
}: {
  reportHash: string;
  environment: string;
  /** Why it cannot be activated yet, when it cannot. */
  blocked: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const { pending, result, run, stateOf } = useAction();

  if (blocked) return <p className="text-sm text-gold-dark">{blocked}</p>;

  return (
    <div className="space-y-4">
      {confirming ? (
        <p className="rounded-card border border-gold-dark bg-surface px-4 py-3 text-sm text-ink">
          {copy.confirm.replace("{environment}", environment)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <Button
              type="button"
              state={stateOf()}
              pendingLabel={feedbackContent.saving}
              doneLabel={feedbackContent.saved}
              onClick={() => void run(() => activateSheetAccessAction(reportHash), { onOk: () => setConfirming(false) })}
            >
              {copy.confirmButton}
            </Button>
            <Button type="button" variant="quiet" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" onClick={() => setConfirming(true)}>
            {copy.activate}
          </Button>
        )}
      </div>
      <ActionMessage result={result} />
    </div>
  );
}

/** Undoes the Song Leader grant activation added. */
export function RollbackSheetAccess() {
  const [confirming, setConfirming] = useState(false);
  const { pending, result, run, stateOf } = useAction();

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{copy.rollbackHint}</p>
      <div className="flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <Button
              type="button"
              variant="secondary"
              state={stateOf()}
              pendingLabel={feedbackContent.saving}
              doneLabel={feedbackContent.saved}
              onClick={() => void run(rollbackSheetAccessAction, { onOk: () => setConfirming(false) })}
            >
              {copy.rollbackConfirm}
            </Button>
            <Button type="button" variant="quiet" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" variant="quiet" onClick={() => setConfirming(true)}>
            {copy.rollback}
          </Button>
        )}
      </div>
      <ActionMessage result={result} />
    </div>
  );
}
