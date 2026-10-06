"use client";

import { useCallback, useEffect, useRef } from "react";

import { ActionMessage } from "@/components/account/fields";
import { Notice } from "@/components/account/Notices";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/components/ui/use-action";
import { servicePlannerContent } from "@/content/service-planner";
import { openPlaces } from "@/lib/ai/service-planner/locks";
import { AI_INSTRUCTION_MAX, type PlanAiSuccess } from "@/lib/ai/service-planner/protocol";
import { plural } from "@/lib/plural";
import { isInsert, type PlanSlots } from "@/lib/service-planner/model";

import { requestPlanAi } from "./ai-request";

const copy = servicePlannerContent.ai;

/** The mark on everything AI does in the planner. */
export function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className={className}>
      <path d="M7 2.5l1.3 3.2L11.5 7 8.3 8.3 7 11.5 5.7 8.3 2.5 7l3.2-1.3L7 2.5z" />
      <path d="M12.5 10.5v3M11 12h3" strokeLinecap="round" />
    </svg>
  );
}

export type GeneratedPlan = Extract<PlanAiSuccess, { mode: "generate" }>;

/**
 * Generate with AI: says what will be kept and what may change, takes an
 * optional instruction, and asks. The songs sent are the ones in the editor
 * now, saved or not. What comes back is handed to the workspace, which holds
 * it as unsaved changes; a failure is shown here and changes nothing.
 *
 * The instruction lives in the workspace, so it is still there the next time
 * this is opened. It is never stored anywhere else.
 */
export function AiGenerate({
  anchor,
  revision,
  slots,
  locked,
  instruction,
  onInstruction,
  onGenerated,
  onClose,
}: {
  anchor: string;
  revision: number | null;
  slots: PlanSlots;
  locked: boolean[];
  instruction: string;
  onInstruction: (value: string) => void;
  onGenerated: (plan: GeneratedPlan) => void;
  onClose: () => void;
}) {
  const { result, run, stateOf, clear } = useAction();
  const request = useRef<AbortController | null>(null);
  // Closing the dialog stops the request: nothing arrives after the person has walked away.
  const stop = useCallback(() => request.current?.abort(), []);
  useEffect(() => stop, [stop]);

  const asked = instruction.trim();
  const open = openPlaces(slots, locked, asked === "").length;
  const kept = slots.filter((song, index) => song !== null && locked[index]).length;
  const insertHeld = asked === "" && slots.some((song, index) => song !== null && isInsert(song) && !locked[index]);

  const generate = () => {
    const controller = new AbortController();
    request.current = controller;
    void run(() => requestPlanAi({ mode: "generate", anchor, revision, slots, locked, instruction: asked }, controller.signal), {
      refresh: false,
      onOk: (outcome) => {
        if (outcome.ok) onGenerated(outcome);
      },
    });
  };

  return (
    <Modal
      title={copy.title}
      closeLabel={copy.cancel}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="quiet" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="button" state={stateOf()} pendingLabel={copy.pending} doneLabel={copy.done} disabled={open === 0} onClick={generate}>
            <SparkleIcon />
            {copy.run}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{copy.lead}</p>

      {open === 0 ? (
        <Notice tone="warning">{copy.nothingOpen}</Notice>
      ) : (
        <ul className="space-y-1.5 text-sm text-ink">
          {kept > 0 ? <li>{plural(copy.kept, kept)}</li> : null}
          <li>{plural(copy.open, open)}</li>
          {insertHeld ? <li className="text-muted">{copy.insertHeld}</li> : null}
        </ul>
      )}

      <div>
        <label htmlFor="ai-instruction" className="mb-1.5 block text-sm font-medium text-ink">
          {copy.instructions}
        </label>
        <textarea
          id="ai-instruction"
          value={instruction}
          rows={3}
          maxLength={AI_INSTRUCTION_MAX}
          placeholder={copy.instructionsPlaceholder}
          aria-describedby="ai-instruction-hint"
          onChange={(event) => {
            clear();
            onInstruction(event.target.value);
          }}
          className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted"
        />
        <p id="ai-instruction-hint" className="mt-1.5 text-xs text-muted">
          {copy.instructionsHint}
        </p>
      </div>

      {result && !result.ok ? <ActionMessage result={result} /> : null}
    </Modal>
  );
}
