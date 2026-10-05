"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { ConductorMarkdown } from "@/components/conductor/ConductorMarkdown";
import { useConductor } from "@/components/conductor/conductor-store";
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

function Message({
  message,
  writing,
  status,
  onRetry,
}: {
  message: ConductorMessage;
  /** This is the answer being written now. */
  writing: boolean;
  status: string | null;
  onRetry: (() => void) | null;
}) {
  if (message.role === "user") {
    return (
      <li className="animate-enter flex justify-end">
        <div className="max-w-[88%] rounded-card rounded-br-sm border border-line bg-paper px-4 py-2.5">
          <span className="sr-only">{copy.you}: </span>
          <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-relaxed text-ink">{message.text}</p>
        </div>
      </li>
    );
  }

  return <Answer message={message} writing={writing} status={status} onRetry={onRetry} />;
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

  return (
    <li className="animate-enter">
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
  ].slice(0, 5);
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
          page ? "flex flex-col pb-8 pt-2" : "min-h-0 overflow-y-auto overscroll-contain py-5 [[data-keyboard]_&]:py-3",
          gutter,
        )}
      >
        {messages.length === 0 ? (
          <div className={cn("mx-auto flex w-full max-w-xl flex-col justify-center", page ? "flex-1 py-6" : "min-h-full")}>
            <p className="font-display text-2xl text-ink">{copy.empty.heading}</p>
            {/* In the panel this is the one place its limits are said (the page says them under the box to type in);
                it gives way to the suggestions while the keyboard is up. */}
            <p className="mt-2 text-sm text-muted [[data-keyboard]_&]:hidden">{page ? copy.empty.body : copy.capabilities}</p>
            <p className="mt-6 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark [[data-keyboard]_&]:mt-3">
              {copy.empty.examplesLabel}
            </p>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {examples.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => send(example)}
                    className="group flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm text-ink-soft transition-colors hover:text-ink"
                  >
                    {example}
                    <svg
                      aria-hidden="true"
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      className="shrink-0 text-gold opacity-0 transition-[opacity,transform,translate,scale,rotate] group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100"
                    >
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
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
                  onRetry={isLast && message.error ? () => retry(pathname) : null}
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
          "shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          // On the page it rides at the bottom of the window, the conversation fading out beneath it.
          page ? "sticky bottom-0 z-10 bg-paper pt-1" : "border-t border-line bg-surface pt-3",
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
          <p id={hintId} className={cn("mt-2 text-xs", tooLong ? "text-gold-dark" : page ? "text-muted" : "sr-only")}>
            {tooLong
              ? copy.composer.tooLong.replace("{max}", CONDUCTOR_LIMITS.questionChars.toLocaleString("en-US"))
              : copy.capabilities}
          </p>
        </div>
      </form>
    </div>
  );
}
