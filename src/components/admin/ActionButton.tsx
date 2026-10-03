"use client";

import { useState } from "react";

import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useAction } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import type { ActionResult } from "@/lib/auth/session";

/**
 * A button that runs one server action and reports the outcome beside it.
 * With `confirm`, the first press asks "Are you sure?" inline instead of
 * acting - no browser pop-up. An action that ends on another page (deleting
 * the thing this page is about) says so there, with `doneToast`.
 */
export function ActionButton({
  action,
  label,
  pendingLabel = feedbackContent.working,
  doneLabel = feedbackContent.done,
  doneToast,
  confirm,
  variant = "secondary",
  className,
}: {
  action: () => Promise<ActionResult<unknown>>;
  label: string;
  pendingLabel?: string;
  doneLabel?: string;
  doneToast?: string;
  confirm?: string;
  variant?: "primary" | "secondary" | "quiet";
  className?: string;
}) {
  const { result, run, stateOf } = useAction();
  const [asking, setAsking] = useState(false);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {asking ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink">{confirm}</span>
          <Button
            type="button"
            onClick={() => {
              setAsking(false);
              void run(action, { toast: doneToast });
            }}
          >
            Yes, {label.toLowerCase()}
          </Button>
          <Button type="button" variant="quiet" onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant={variant}
          state={stateOf()}
          pendingLabel={pendingLabel}
          doneLabel={doneLabel}
          onClick={() => (confirm ? setAsking(true) : void run(action, { toast: doneToast }))}
        >
          {label}
        </Button>
      )}
      <ActionMessage result={result} />
    </div>
  );
}
