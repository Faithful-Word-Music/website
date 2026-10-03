"use client";

import { useId, useState } from "react";

import { approveRequestAction, rejectRequestAction } from "@/app/admin/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { InvitationRolePicker, type AssignableRole } from "@/components/admin/InviteForm";
import { Button } from "@/components/ui/Button";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { PROFILE_LIMITS } from "@/lib/auth/profile-options";
import type { ActionResult } from "@/lib/auth/session";

/**
 * Approve or decline a pending request. Leaving the page does neither: a
 * request can stay pending for as long as needed.
 */
export function RequestReview({
  requestId,
  email,
  roles,
}: {
  requestId: number;
  email: string;
  /** Roles the viewer may give out; empty hides the picker. */
  roles: AssignableRole[];
}) {
  const ids = useId();
  const { pending, result, run: runAction, stateOf } = useAction();
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [note, setNote] = useState("");
  const [chosenRoles, setChosenRoles] = useState<string[]>([]);

  const run = (action: () => Promise<ActionResult>) => void runAction(action, { onOk: () => setMode("idle") });

  return (
    <div className="space-y-4">
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => setMode("approve")}>
            Approve and invite
          </Button>
          <Button type="button" variant="secondary" onClick={() => setMode("reject")}>
            Decline
          </Button>
        </div>
      ) : null}

      {mode === "approve" ? (
        <div className="space-y-3 rounded-card border border-line p-4">
          <p className="text-sm text-ink">
            Clerk will email an invitation to <strong className="font-medium">{email}</strong>. They choose a password
            and their account is created.
          </p>
          <InvitationRolePicker name={`${ids}-roles`} roles={roles} selected={chosenRoles} onChange={setChosenRoles} />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              state={stateOf()}
              pendingLabel={feedbackContent.sending}
              doneLabel={feedbackContent.sent}
              onClick={() => run(() => approveRequestAction(requestId, chosenRoles))}
            >
              Send invitation
            </Button>
            <Button type="button" variant="quiet" disabled={pending} onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "reject" ? (
        <div className="space-y-3 rounded-card border border-line p-4">
          <TextField
            id={`${ids}-note`}
            label="Note"
            hint="Optional - for administrators only, never sent"
            value={note}
            maxLength={PROFILE_LIMITS.reviewNote}
            multiline
            rows={3}
            onChange={setNote}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              state={stateOf()}
              pendingLabel={feedbackContent.saving}
              doneLabel={feedbackContent.saved}
              onClick={() => run(() => rejectRequestAction(requestId, note))}
            >
              Decline request
            </Button>
            <Button type="button" variant="quiet" disabled={pending} onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <ActionMessage result={result} />
    </div>
  );
}
