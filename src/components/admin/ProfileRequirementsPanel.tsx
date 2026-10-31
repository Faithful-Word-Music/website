"use client";

import { useState } from "react";

import { activateProfileRequirementsAction, setProfileRequirementsPausedAction } from "@/app/admin/actions";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { profileSetupContent } from "@/content/profile-setup";

const copy = profileSetupContent.admin;

/**
 * Activating profile requirements for this environment, and pausing them.
 * Activation asks once more in words (no browser dialog); pressing it again
 * after a failure finishes the same activation rather than starting another.
 */
export function ProfileRequirementsPanel({
  state,
  summary,
}: {
  state: "inactive" | "pending" | "active" | "paused";
  /** The status line, already worded on the server (dates in church time). */
  summary: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const { pending, result, run, stateOf } = useAction();

  return (
    <div>
      <p className="text-sm text-ink" role="status">
        {summary}
      </p>
      {confirming ? <p className="mt-4 rounded-card border border-gold-dark bg-surface px-4 py-3 text-sm text-ink">{copy.activateConfirm}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {state === "inactive" || state === "pending" ? (
          confirming || state === "pending" ? (
            <>
              <Button
                type="button"
                state={stateOf("activate")}
                pendingLabel={feedbackContent.saving}
                doneLabel={feedbackContent.saved}
                disabled={pending}
                onClick={() => void run(activateProfileRequirementsAction, { key: "activate", onOk: () => setConfirming(false) })}
              >
                {state === "pending" ? copy.resumeActivation : copy.activate}
              </Button>
              {confirming ? (
                <Button type="button" variant="quiet" disabled={pending} onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              ) : null}
            </>
          ) : (
            <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
              {copy.activate}
            </Button>
          )
        ) : (
          <Button
            type="button"
            variant="secondary"
            state={stateOf("pause")}
            pendingLabel={feedbackContent.saving}
            doneLabel={feedbackContent.saved}
            disabled={pending}
            onClick={() => void run(() => setProfileRequirementsPausedAction(state === "active"), { key: "pause" })}
          >
            {state === "active" ? copy.pause : copy.resume}
          </Button>
        )}
        <ActionMessage result={result} />
      </div>
    </div>
  );
}
