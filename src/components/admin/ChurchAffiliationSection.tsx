"use client";

import { useId, useState } from "react";

import { setChurchAffiliationAction } from "@/app/admin/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { useAction } from "@/components/ui/use-action";
import { adminContent } from "@/content/admin";
import { feedbackContent } from "@/content/feedback";

const copy = adminContent.sheetAccess.affiliation;

/**
 * Verify or revoke someone's church affiliation. It never changes their roles.
 * The status it was showing goes with the change, so a change someone else
 * made in the meantime is not overwritten.
 */
export function ChurchAffiliationControls({
  userId,
  status,
  canChange,
  refusal,
}: {
  userId: string;
  status: "verified" | "revoked" | null;
  canChange: boolean;
  /** Why this viewer cannot change it, when they cannot. */
  refusal: string | null;
}) {
  const ids = useId();
  const [reason, setReason] = useState("");
  const { result, run, stateOf } = useAction();
  const next = status === "verified" ? "revoked" : "verified";

  if (!canChange) return refusal ? <p className="text-sm text-muted">{refusal}</p> : null;

  return (
    <div className="space-y-3">
      <TextField
        id={`${ids}-reason`}
        label={copy.reasonLabel}
        hint={copy.reasonHint}
        value={reason}
        maxLength={500}
        onChange={setReason}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant={next === "verified" ? "primary" : "secondary"}
          state={stateOf()}
          pendingLabel={feedbackContent.saving}
          doneLabel={feedbackContent.saved}
          onClick={() => void run(() => setChurchAffiliationAction(userId, status, next, reason), { onOk: () => setReason("") })}
        >
          {next === "verified" ? copy.verify : copy.revoke}
        </Button>
        <ActionMessage result={result} />
      </div>
    </div>
  );
}
