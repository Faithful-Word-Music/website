"use client";

import { useState } from "react";

import { testAiConnectionAction, type AiTestOutcome } from "@/app/admin/actions";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { useAction } from "@/components/ui/use-action";
import { aiContent } from "@/content/ai";
import { formatDuration, formatTokens, formatUsd } from "@/lib/ai/format";

const content = aiContent.admin.test;

/**
 * Admin -> AI's "Run test request": one fixed, tiny request through the
 * shared AI layer, then the model's reply and what was logged for it. The
 * page's figures refresh by themselves once it has worked.
 */
export function AiConnectionTest({ disabled }: { disabled: boolean }) {
  const { pending, result, run, stateOf } = useAction();
  const [outcome, setOutcome] = useState<AiTestOutcome | null>(null);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          type="button"
          variant="secondary"
          state={stateOf()}
          pendingLabel={content.pending}
          doneLabel={content.done}
          disabled={pending || disabled}
          onClick={() => {
            setOutcome(null);
            void run(testAiConnectionAction, { onOk: (answer) => answer.ok && setOutcome(answer.value) });
          }}
        >
          {content.button}
        </Button>
        <ActionMessage result={result} />
      </div>

      {outcome ? (
        <div className="mt-5 animate-enter border-l-2 border-gold pl-4">
          <p className="font-sans text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">{content.reply}</p>
          <p className="mt-1 break-words text-ink">{outcome.reply}</p>
          <p className="tnum mt-2 text-xs text-muted">
            {[
              outcome.model,
              outcome.tokens.totalTokens === null ? null : `${formatTokens(outcome.tokens.totalTokens)} tokens`,
              outcome.costUsd === null ? content.costPending : formatUsd(outcome.costUsd),
              formatDuration(outcome.durationMs),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
