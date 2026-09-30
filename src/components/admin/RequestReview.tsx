"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { approveRequestAction, rejectRequestAction } from "@/app/admin/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { PROFILE_LIMITS } from "@/lib/auth/profile-options";
import type { ActionResult } from "@/lib/auth/session";

/**
 * Approve or decline a pending request. Leaving the page does neither: a
 * request can stay pending for as long as needed.
 */
export function RequestReview({ requestId, email }: { requestId: number; email: string }) {
  const ids = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);

  function run(action: () => Promise<ActionResult>) {
    setResult(null);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) {
        setMode("idle");
        router.refresh();
      }
    });
  }

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
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={pending} onClick={() => run(() => approveRequestAction(requestId))}>
              {pending ? "Sending…" : "Send invitation"}
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
            <Button type="button" disabled={pending} onClick={() => run(() => rejectRequestAction(requestId, note))}>
              {pending ? "Saving…" : "Decline request"}
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
