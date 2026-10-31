"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { replySupportRequestAction } from "@/app/contact/actions";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useAction } from "@/components/ui/use-action";
import { supportContent } from "@/content/support";
import { AFTER_REPLY, SUPPORT_LIMITS, type AfterReply, type Status } from "@/lib/support/model";

const copy = supportContent.reply;
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "");

/**
 * Writing in a request's conversation. Managers have two separate tabs - a
 * public reply and an internal note - so a note can never be sent to the
 * submitter by mistake: the tab IS the choice, and the note's tab looks
 * different. The server decides again whether a note is allowed at all.
 */
export function ReplyBox({ publicId, status, manager }: { publicId: string; status: Status; manager: boolean }) {
  const id = useId();
  const [mode, setMode] = useState<"public" | "internal">("public");
  const [body, setBody] = useState("");
  const [after, setAfter] = useState<AfterReply>("keep");
  const [reopen, setReopen] = useState(false);
  const { pending, result, run, stateOf, clear } = useAction();
  const key = useRef("");

  useEffect(() => {
    key.current = newKey();
  }, []);

  const closed = status === "closed";
  if (closed && !manager) {
    return (
      <div className="rounded-card border border-line bg-paper p-5 text-sm text-muted">
        <p>{copy.closedNote}</p>
        <Link href="/contact" className="mt-2 inline-block text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark">
          {copy.newRequest}
        </Link>
      </div>
    );
  }

  const internal = mode === "internal";
  // A closed request takes only notes until a manager reopens it.
  const effectiveMode = closed ? "internal" : mode;

  const send = () => {
    const text = body.trim();
    if (!text) return;
    if (!key.current) key.current = newKey();
    void run(
      () =>
        replySupportRequestAction({
          publicId,
          body: text,
          visibility: effectiveMode,
          clientKey: key.current,
          ...(effectiveMode === "public" && manager ? { after } : {}),
          ...(!manager ? { reopen } : {}),
        }),
      {
        key: "send",
        onOk: () => {
          setBody("");
          setReopen(false);
          setAfter("keep");
          key.current = newKey();
        },
      },
    );
  };

  return (
    <div className={cn("rounded-card border p-5 shadow-card sm:p-6", effectiveMode === "internal" ? "border-gold bg-gold/10" : "border-line bg-surface")}>
      {manager ? (
        <div role="tablist" aria-label={copy.replyTab} className="mb-4 flex gap-2">
          {(closed ? (["internal"] as const) : (["public", "internal"] as const)).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={effectiveMode === item}
              onClick={() => {
                setMode(item);
                clear();
              }}
              className={cn(
                "inline-flex min-h-10 items-center rounded-full border px-4 text-sm transition-colors",
                effectiveMode === item ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:border-gold",
              )}
            >
              {item === "public" ? copy.replyTab : copy.noteTab}
            </button>
          ))}
        </div>
      ) : null}

      {status === "resolved" && !manager ? <p className="mb-3 text-sm text-muted">{copy.resolvedNote}</p> : null}
      {effectiveMode === "internal" ? <p className="mb-3 text-sm font-medium text-ink">{supportContent.detail.internalHint}</p> : null}

      <label htmlFor={`${id}-body`} className="mb-1.5 block text-sm font-medium text-ink">
        {internal || closed ? copy.noteLabel : copy.replyLabel}
      </label>
      <textarea
        id={`${id}-body`}
        rows={4}
        value={body}
        maxLength={SUPPORT_LIMITS.messageChars}
        placeholder={effectiveMode === "internal" ? copy.notePlaceholder : copy.replyPlaceholder}
        onChange={(event) => {
          setBody(event.target.value);
          clear();
        }}
        className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-muted"
      />

      {manager && effectiveMode === "public" ? (
        <fieldset className="mt-3">
          <legend className="mb-1.5 text-sm font-medium text-ink">{copy.afterLabel}</legend>
          <div className="flex flex-wrap gap-2">
            {AFTER_REPLY.filter((item) => status !== "resolved" || item !== "request_info").map((item) => (
              <label
                key={item}
                className={cn(
                  "inline-flex min-h-10 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold/40",
                  after === item ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:border-gold",
                )}
              >
                <input type="radio" name={`${id}-after`} className="sr-only" checked={after === item} onChange={() => setAfter(item)} />
                {copy.after[item]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {!manager && status === "resolved" ? (
        <label className="mt-3 flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={reopen} onChange={(event) => setReopen(event.target.checked)} className="mt-1" />
          {copy.reopen}
        </label>
      ) : null}

      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ActionMessage result={result} />
        <Button
          type="button"
          onClick={send}
          disabled={pending || !body.trim()}
          state={stateOf("send")}
          pendingLabel={copy.sending}
          className="sm:ml-auto"
        >
          {effectiveMode === "internal" ? copy.sendNote : copy.send}
        </Button>
      </div>
    </div>
  );
}
