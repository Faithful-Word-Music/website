"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { feedbackContent } from "@/content/feedback";
import { atLeast } from "@/lib/at-least";

import { toast } from "./toast";

/** What a button shows: resting, working, or (briefly) done. See `Button`'s `state`. */
export type ActionState = "idle" | "pending" | "done";

/** The outcome of a server action, as `ActionMessage` reads it. */
export interface ActionOutcome {
  ok: boolean;
  message?: string;
  error?: string;
}

/** "Working" stays up at least this long, so it can always be read. */
const MIN_PENDING_MS = 400;
/** How long a button says "Saved" before going back to its own label. */
const DONE_MS = 2000;

const DEFAULT_KEY = "default";

interface RunOptions<T> {
  /** Which button was pressed, when several share the hook: only it shows working and done. */
  key?: string;
  onOk?: (outcome: T) => void;
  /** Reload the page's data once it has worked. On unless the action navigates away itself. */
  refresh?: boolean;
  /**
   * Say "done" in a toast rather than beside the button - for a control that
   * is gone by then (a dialog that closes, a page that is left). `true` uses
   * the action's own message; a string is used as it is, and also covers an
   * action that redirects on the server and so returns nothing.
   */
  toast?: boolean | string;
}

/** A server action that redirected: Next rejects its promise and navigates by itself. */
function isRedirect(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Runs server actions for a component and tracks what its buttons should
 * show: every button that runs an action goes working -> done where it was
 * pressed (README, "Design conventions").
 *
 *   const { pending, result, run, stateOf } = useAction();
 *   <Button state={stateOf("save")} pendingLabel="Saving…" doneLabel="Saved"
 *     disabled={pending} onClick={() => run(save, { key: "save" })}>
 *   <ActionMessage result={result} />
 */
export function useAction() {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [result, setResult] = useState<ActionOutcome | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(doneTimer.current);
    };
  }, []);

  const run = useCallback(
    async <T extends ActionOutcome>(action: () => Promise<T>, options: RunOptions<T> = {}) => {
      if (busy.current) return;
      const { key = DEFAULT_KEY, onOk, refresh = true, toast: announce = false } = options;
      busy.current = true;
      clearTimeout(doneTimer.current);
      setResult(null);
      setDone(null);
      setActive(key);

      let outcome: ActionOutcome;
      try {
        outcome = await atLeast(action(), MIN_PENDING_MS);
        if (outcome.ok) {
          onOk?.(outcome as T);
          const words = typeof announce === "string" ? announce : announce ? outcome.message : undefined;
          if (words) toast(words);
          if (refresh) router.refresh();
        }
      } catch (error) {
        if (isRedirect(error)) {
          // Already on its way to another page; nothing here is left to update.
          if (typeof announce === "string") toast(announce);
          return;
        }
        outcome = { ok: false, error: feedbackContent.failed };
      } finally {
        busy.current = false;
      }

      // Its dialog closed, or the page was left: the toast has said it.
      if (!mounted.current) return;
      setActive(null);
      setResult(outcome.ok && announce ? null : outcome);
      if (outcome.ok) {
        setDone(key);
        doneTimer.current = setTimeout(() => setDone(null), DONE_MS);
      }
    },
    [router],
  );

  const stateOf = (key: string = DEFAULT_KEY): ActionState =>
    active === key ? "pending" : done === key ? "done" : "idle";

  return {
    /** Something is running: disable the buttons beside it. */
    pending: active !== null,
    /** The last outcome, for `ActionMessage`. */
    result,
    /** Drops the last message, as when the form is edited again. */
    clear: useCallback(() => setResult(null), []),
    run,
    stateOf,
  };
}
