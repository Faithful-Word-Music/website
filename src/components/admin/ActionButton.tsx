"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import type { ActionResult } from "@/lib/auth/session";

/**
 * A button that runs one server action and reports the outcome beside it.
 * With `confirm`, the first press asks "Are you sure?" inline instead of
 * acting - no browser pop-up.
 */
export function ActionButton({
  action,
  label,
  pendingLabel = "Working…",
  confirm,
  variant = "secondary",
  className,
}: {
  action: () => Promise<ActionResult<unknown>>;
  label: string;
  pendingLabel?: string;
  confirm?: string;
  variant?: "primary" | "secondary" | "quiet";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);

  function run() {
    setAsking(false);
    setResult(null);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {asking ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink">{confirm}</span>
          <Button type="button" onClick={run}>
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
          disabled={pending}
          onClick={() => (confirm ? setAsking(true) : run())}
        >
          {pending ? pendingLabel : label}
        </Button>
      )}
      <ActionMessage result={result} />
    </div>
  );
}
