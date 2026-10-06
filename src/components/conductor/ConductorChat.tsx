"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { ConductorMark } from "@/components/conductor/ConductorMark";
import { ConductorMarkdown } from "@/components/conductor/ConductorMarkdown";
import { useConductor } from "@/components/conductor/conductor-store";
import { copyText } from "@/components/song-list/share-actions";
import { cn } from "@/components/ui/cn";
import { usePagePath } from "@/components/ui/use-page-path";
import { conductorContent, type ConductorStatusKey } from "@/content/conductor";
import { pageContextFor } from "@/lib/ai/conductor/context";
import { CONDUCTOR_LIMITS } from "@/lib/ai/conductor/limits";
import type { ConductorMessage } from "@/lib/ai/conductor/session";

const copy = conductorContent;

/** How close to the bottom still counts as "following the answer". */
const FOLLOW_WITHIN = 96;

/**
 * An answer as it should be SHOWN while it arrives. The model sends text in
 * uneven lumps - nothing, then half a sentence at once - which reads as
 * stuttering. This lets the shown text run after what has arrived at a steady
 * pace: each frame it takes a share of what it is behind by, so it speeds up
 * when a lot is waiting and eases as it catches up. Text that was already
 * complete when it mounted (a restored conversation) is simply shown.
 */
function useFlowingText(text: string, arriving: boolean): string {
  const [shown, setShown] = useState(() => (arriving ? 0 : text.length));
  const target = useRef(text.length);
  const behind = shown < text.length;

  useEffect(() => {
    target.current = text.length;
  }, [text]);

  useEffect(() => {
    if (!behind) return;
    // No motion wanted: show what has arrived, as it arrives.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target.current);
      return;
    }
    let frame = 0;
    const step = () => {
      setShown((count) => (count >= target.current ? count : count + Math.max(1, Math.ceil((target.current - count) / 18))));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [behind]);

  // A new conversation (or a retry) can leave less text than was shown.
  return shown >= text.length ? text : text.slice(0, shown);
}

/** Three dots that take turns: something is on its way. */
function Working() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1">
      {[0, 1, 2].map((dot) => (
        <span key={dot} className="conductor-dot h-1.5 w-1.5 rounded-full bg-gold" style={{ animationDelay: `${dot * 160}ms` }} />
      ))}
    </span>
  );
}

/** The quiet buttons under a finished answer. */
const answerAction =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] hover:text-ink";

/** Copies an answer as it was written (its Markdown), and says so for a moment. */
function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => setCopied(await copyText(text))}
      aria-label={copied ? copy.copied : copy.copy}
      title={copied ? copy.copied : copy.copy}
      className={cn(answerAction, copied && "text-gold-dark")}
    >
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
        {copied ? (
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.75" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 3.25A1.25 1.25 0 0 0 9.25 2.5h-5A1.75 1.75 0 0 0 2.5 4.25v5c0 .55.3 1 .75 1.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </>
        )}
      </svg>
      <span role="status" className="sr-only">
        {copied ? copy.copied : ""}
      </span>
    </button>
  );
}

function Message({
  message,
  writing,
  status,
  onRetry,
  page,
}: {
  message: ConductorMessage;
  /** This is the answer being written now. */
  writing: boolean;
  status: string | null;
  /** Only for the last answer, once it has settled: the question can be asked again. */
  onRetry: (() => void) | null;
  page: boolean;
}) {
  if (message.role === "user") {
    return (
      <li className="animate-enter flex justify-end">
        {/* A filled bubble, a step off whatever it sits on: the page is paper, the panel is surface. */}
        <div className={cn("max-w-[88%] rounded-2xl rounded-br-md border border-line px-4 py-2.5", page ? "bg-surface" : "bg-paper")}>
          <span className="sr-only">{copy.you}: </span>
          <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-relaxed text-ink">{message.text}</p>
        </div>
      </li>
    );
  }

  return <Answer message={message} writing={writing} status={status} onRetry={onRetry} />;
}

/**
 * Before anything has been asked: what Conductor is for, and a few questions
 * to start from. On the Conductor page it is the middle of the screen, centred
 * like the column around it; in the panel it is the same things, smaller, from
 * the left - and there the one sentence is Conductor's limits, which the page
 * says under the box to type in.
 */
function EmptyState({ page, examples, onAsk }: { page: boolean; examples: readonly string[]; onAsk: (text: string) => void }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col justify-center",
        page ? "max-w-2xl flex-1 items-center py-6 text-center" : "min-h-full max-w-xl",
      )}
    >
      {page ? (
        <span
          aria-hidden="true"
          className="mb-5 grid size-12 place-items-center rounded-full border border-[color-mix(in_srgb,var(--color-gold)_45%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-gold)_8%,transparent)] text-gold"
        >
          <ConductorMark size={22} />
        </span>
      ) : null}
      <p className={cn("text-balance font-display text-ink", page ? "text-3xl sm:text-4xl" : "text-2xl")}>{copy.empty.heading}</p>
      {/* With a phone's keyboard up (the sheet marks itself data-keyboard) it gives way to the suggestions. */}
      <p
        className={cn(
          "text-pretty text-muted [[data-keyboard]_&]:hidden",
          page ? "mt-3 max-w-lg text-[0.95rem] leading-relaxed sm:text-base" : "mt-2 text-sm",
        )}
      >
        {page ? copy.empty.body : copy.capabilities}
      </p>
      <p className="sr-only">{copy.empty.examplesLabel}</p>
      <ul className={cn("grid w-full text-left", page ? "mt-8 gap-2.5 sm:grid-cols-2" : "mt-5 gap-2 [[data-keyboard]_&]:mt-3")}>
        {examples.map((example) => (
          <li key={example}>
            <button
              type="button"
              onClick={() => onAsk(example)}
              className={cn(
                "group flex h-full w-full items-center justify-between gap-3 rounded-xl border border-line px-4 text-left text-sm text-ink-soft transition-colors hover:border-gold hover:text-ink",
                page ? "min-h-14 bg-surface py-3" : "min-h-12 bg-paper py-2.5",
              )}
            >
              {example}
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                className="shrink-0 text-gold opacity-40 transition-[opacity,transform,translate,scale,rotate] group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Answer({
  message,
  writing,
  status,
  onRetry,
}: {
  message: ConductorMessage;
  writing: boolean;
  status: string | null;
  onRetry: (() => void) | null;
}) {
  const text = useFlowingText(message.text, writing);
  // Still catching up with what has arrived, though the answer itself is complete.
  const flowing = text.length < message.text.length;
  const statusText = status && Object.hasOwn(copy.status, status) ? copy.status[status as ConductorStatusKey] : null;
  // Settled, with something to act on. A failed answer offers "Try again" in its own notice instead.
  const settled = !writing && !flowing && message.text !== "" && !message.error;

  return (
    <li className="group/answer animate-enter">
      <span className="sr-only">{copy.name}: </span>
      {text ? <ConductorMarkdown text={text} /> : null}
      {/* Before the answer starts: what Conductor is doing, in words. Once it is being written, the words themselves say so. */}
      {writing && text === "" ? (
        <p key={statusText ?? "thinking"} className="animate-enter flex items-center gap-2.5 text-sm text-muted">
          <Working />
          {statusText ?? copy.thinking}
        </p>
      ) : null}
      {(writing || flowing) && text !== "" ? (
        <p className="mt-3 flex h-4 items-center">
          <Working />
          <span className="sr-only">{copy.responding}</span>
        </p>
      ) : null}
      {message.stopped ? <p className={cn("text-sm text-muted", message.text && "mt-2")}>{copy.stopped}</p> : null}
      {message.error ? (
        <div role="alert" className={cn("rounded-lg border border-line bg-paper px-3.5 py-3", message.text && "mt-3")}>
          <p className="text-sm text-gold-dark">{message.error}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 inline-flex min-h-9 items-center text-sm font-medium text-ink underline decoration-transparent underline-offset-4 transition-colors hover:text-gold-dark hover:decoration-current"
            >
              {copy.retry}
            </button>
          ) : null}
        </div>
      ) : null}
      {settled ? (
        <div
          className={cn(
            "-ml-2 mt-1.5 flex items-center gap-0.5 transition-opacity",
            // The last answer always shows them; earlier ones on hover or focus, where there is a pointer to hover with.
            !onRetry &&
              "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-within:opacity-100 [@media(hover:hover)]:group-hover/answer:opacity-100",
          )}
        >
          <CopyAnswer text={message.text} />
          {onRetry ? (
            <button type="button" onClick={onRetry} aria-label={copy.retry} title={copy.retry} className={answerAction}>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M13 8a5 5 0 1 1-1.6-3.67" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M13.25 2.5v2.75H10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Conductor's conversation: what has been said, and the box to ask the next
 * thing. The ONE view of it - the Conductor page, the desktop panel and the
 * phone sheet all render this, over the same shared conversation
 * (conductor-store.ts), so they cannot behave differently.
 *
 * What differs is only what scrolls:
 *
 *   panel  It fills the height it is given (the drawer, the sheet): the
 *          messages scroll inside it and the composer stays at its foot.
 *   page   Nothing scrolls inside it. The conversation is simply part of
 *          the page and grows with it - the window scrolls, as for any other
 *          page - while the composer stays at the bottom of the window.
 */
export function ConductorChat({ variant, autoFocus = false }: { variant: "page" | "panel"; autoFocus?: boolean }) {
  const { userId } = useAccount();
  const pathname = usePagePath();
  const { session, ask, stop, retry } = useConductor(userId);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const following = useRef(true);
  const page = variant === "page";
  const fieldId = useId();
  const hintId = useId();

  const { messages, pending, status } = session;
  const last = messages.at(-1);
  const tooLong = draft.trim().length > CONDUCTOR_LIMITS.questionChars;
  const canSend = !pending && draft.trim() !== "" && !tooLong;

  // Stay with the answer as it is written - unless the person has scrolled up
  // to read. Followed by the conversation's height, not by each event: the
  // words are shown at their own pace (useFlowingText), so it grows every frame.
  const hasMessages = messages.length > 0;
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const list = listRef.current;
    if (!box || !list) return;

    // On the page it is the window that scrolls: how far the end of the
    // conversation sits below the top of the composer.
    const hidden = () => list.getBoundingClientRect().bottom + 24 - (formRef.current?.getBoundingClientRect().top ?? window.innerHeight);
    const follow = () => {
      if (!following.current) return;
      if (!page) box.scrollTop = box.scrollHeight;
      else if (hidden() > 0) window.scrollBy({ top: hidden(), behavior: "instant" });
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(list);

    if (!page) return () => observer.disconnect();
    const onScroll = () => {
      following.current = hidden() < FOLLOW_WITHIN;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [hasMessages, page]);

  // On the page the composer owns the bottom of the window, so "Back to top"
  // stands down (BackToTop.tsx) rather than sit on the send button.
  useEffect(() => {
    if (!page) return;
    document.documentElement.dataset.conductorPage = "";
    return () => {
      delete document.documentElement.dataset.conductorPage;
    };
  }, [page]);

  // The box grows with what is typed, up to a few lines - and is measured
  // again when its width changes (the panel opening, or being dragged), since
  // the same words then take more lines or fewer.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const fit = () => {
      field.style.height = "auto";
      field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
    };
    fit();
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth === width) return;
      width = field.clientWidth;
      fit();
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [draft]);

  // Opened to type in - but only with a mouse and keyboard, so a phone does not throw up its keyboard.
  useEffect(() => {
    if (autoFocus && window.matchMedia("(pointer: fine)").matches) fieldRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  function send(text: string) {
    if (pending || text.trim() === "") return;
    following.current = true;
    ask(text, pathname);
    setDraft("");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSend) send(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter (and an Enter that is choosing a word, in an input method) does not.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) send(draft);
  }

  const context = pageContextFor(pathname);
  const examples = [
    ...(context.service ? copy.empty.serviceExamples : []),
    ...(context.song ? copy.empty.songExamples : []),
    ...copy.empty.examples,
    // Four on the page, where they sit two by two; five down the panel.
  ].slice(0, page ? 4 : 5);
  const gutter = page ? "" : "px-4";

  return (
    <div className={cn("flex flex-col", page ? "flex-1" : "h-full min-h-0")}>
      <div
        ref={scrollRef}
        onScroll={
          page
            ? undefined
            : (event) => {
                const box = event.currentTarget;
                following.current = box.scrollHeight - box.scrollTop - box.clientHeight < FOLLOW_WITHIN;
              }
        }
        className={cn(
          "flex-1",
          // With a phone's keyboard up (the sheet marks itself data-keyboard) there is little height: less of it goes on room.
          page ? "flex flex-col pb-8 pt-6" : "min-h-0 overflow-y-auto overscroll-contain py-5 [[data-keyboard]_&]:py-3",
          gutter,
        )}
      >
        {messages.length === 0 ? (
          <EmptyState page={page} examples={examples} onAsk={send} />
        ) : (
          // Announced as it settles, not word by word: aria-busy holds it back while an answer is being written.
          <ol ref={listRef} aria-live="polite" aria-busy={pending} className={cn("mx-auto w-full space-y-6", page && "max-w-3xl")}>
            {messages.map((message) => {
              const isLast = message === last;
              return (
                <Message
                  key={message.id}
                  message={message}
                  writing={pending && isLast && message.role === "assistant"}
                  status={isLast ? status : null}
                  onRetry={isLast && !pending && message.role === "assistant" ? () => retry(pathname) : null}
                  page={page}
                />
              );
            })}
          </ol>
        )}
      </div>

      <form
        ref={formRef}
        onSubmit={onSubmit}
        className={cn(
          "shrink-0",
          // On the page it rides at the bottom of the window, the conversation fading out beneath it.
          // In the panel it keeps a finger's room off the bottom of the screen - less with the keyboard up,
          // where the keyboard is what is below it.
          page
            ? "sticky bottom-0 z-10 bg-paper pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1"
            : "border-t border-line bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 [[data-keyboard]_&]:pb-3",
          gutter,
        )}
      >
        {page ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-full h-10 bg-gradient-to-t from-paper to-transparent" />
        ) : null}
        <div className={cn("mx-auto", page && "max-w-3xl")}>
          <div
            className={cn(
              "flex items-end gap-2 rounded-card border border-line py-1.5 pl-4 pr-1.5 transition-colors focus-within:border-gold",
              page ? "bg-surface shadow-card" : "bg-paper",
            )}
          >
            <label htmlFor={fieldId} className="sr-only">
              {copy.composer.label}
            </label>
            <textarea
              ref={fieldRef}
              id={fieldId}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={copy.composer.placeholder}
              aria-describedby={hintId}
              aria-invalid={tooLong || undefined}
              enterKeyHint="send"
              // 16px: anything smaller and an iPhone zooms the page when the box is tapped.
              className="max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 text-ink outline-none placeholder:text-muted focus-visible:outline-none"
            />
            {pending ? (
              <button
                type="button"
                onClick={stop}
                aria-label={copy.composer.stop}
                title={copy.composer.stop}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-gold"
              >
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] bg-ink" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                aria-label={copy.composer.send}
                title={copy.composer.send}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-[background-color,opacity,transform,translate,scale,rotate] not-disabled:hover:bg-ink-soft not-disabled:active:scale-95 disabled:opacity-40"
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
          {/* The panel has said this already, over the suggestions: there it is kept for a screen reader only. */}
          <p
            id={hintId}
            className={cn("mt-2 text-xs", page && "text-pretty text-center", tooLong ? "text-gold-dark" : page ? "text-muted" : "sr-only")}
          >
            {tooLong
              ? copy.composer.tooLong.replace("{max}", CONDUCTOR_LIMITS.questionChars.toLocaleString("en-US"))
              : copy.capabilities}
          </p>
        </div>
      </form>
    </div>
  );
}
