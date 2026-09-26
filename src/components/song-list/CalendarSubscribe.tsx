"use client";

import { useEffect, useId, useRef, useState } from "react";

import { copyText } from "@/components/song-list/share-actions";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { songListContent } from "@/content/song-list";
import { calendarPath, SERVICE_KINDS, type ServiceKind } from "@/lib/calendar";

const { calendar } = songListContent;

/**
 * "Add to calendar": pick the services you attend, then subscribe in Apple
 * Calendar, Google Calendar or anything else that takes a calendar link
 * (src/app/song-list/calendar.ics). The choice is part of the link, so the
 * site stores nothing about who subscribes - and stopping is done in the
 * calendar app, which the dialog explains.
 *
 * A native modal <dialog>: it traps focus, closes on Escape and returns focus
 * to the button by itself. Its links are only drawn while it is open, which is
 * always after hydration, so they can use this page's own address - a preview
 * deployment subscribes to its own feed.
 */
export function CalendarSubscribe() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [kinds, setKinds] = useState<ReadonlySet<ServiceKind>>(() => new Set(SERVICE_KINDS));
  const [tried, setTried] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 1800);
    return () => window.clearTimeout(timer);
  }, [status]);

  function show() {
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function toggle(kind: ServiceKind) {
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
    setTried(false);
  }

  const none = kinds.size === 0;

  return (
    <>
      <button type="button" onClick={show} className={buttonClasses("secondary")}>
        <CalendarIcon />
        {calendar.buttonLabel}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        // A click on the dimmed backdrop lands on the dialog itself: close.
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-line bg-surface p-0 text-ink shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
      >
        {open ? (
          <div className="p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <h2 id={titleId} className="font-display text-xl text-ink sm:text-2xl">
                {calendar.title}
              </h2>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                aria-label={calendar.close}
                className="-mr-2 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink"
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-sm text-muted">{calendar.lead}</p>

            <fieldset className="mt-5">
              <legend className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">
                {calendar.kindsLabel}
              </legend>
              <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {SERVICE_KINDS.map((kind) => (
                  <label
                    key={kind}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm transition-colors hover:bg-paper"
                  >
                    <input
                      type="checkbox"
                      checked={kinds.has(kind)}
                      onChange={() => toggle(kind)}
                      className="h-4 w-4 accent-ink"
                    />
                    {calendar.kinds[kind]}
                  </label>
                ))}
              </div>
            </fieldset>

            <p role="alert" className="mt-1 min-h-5 text-sm text-gold-dark">
              {none && tried ? calendar.atLeastOne : null}
            </p>

            <SubscribeLinks kinds={kinds} onBlocked={() => setTried(true)} onStatus={setStatus} />

            <p role="status" className="mt-2 min-h-5 text-center text-xs font-medium text-ink">
              {status}
            </p>

            <p className="mt-2 text-xs text-muted">{calendar.refreshNote}</p>

            <details className="group mt-4 border-t border-line pt-4">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
                {calendar.stopTitle}
                <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">
                  ⌄
                </span>
              </summary>
              <ul className="mt-2 space-y-2 text-sm text-muted">
                {calendar.stopSteps.map((step) => (
                  <li key={step} className="flex gap-2">
                    <span aria-hidden="true" className="text-gold">•</span>
                    {step}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">{calendar.stopNote}</p>
            </details>
          </div>
        ) : null}
      </dialog>
    </>
  );
}

/**
 * The three ways to subscribe. With no service ticked they stay visible but
 * do nothing except explain why, which reads better than vanishing.
 */
function SubscribeLinks({
  kinds,
  onBlocked,
  onStatus,
}: {
  kinds: ReadonlySet<ServiceKind>;
  onBlocked: () => void;
  onStatus: (message: string) => void;
}) {
  const hintId = useId();
  const none = kinds.size === 0;
  const feed = new URL(calendarPath(kinds), window.location.origin);
  // webcal:// is the scheme calendar apps claim: on an iPhone it opens "Subscribe".
  const webcal = feed.href.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;

  const guard = (event: { preventDefault: () => void }) => {
    if (!none) return false;
    event.preventDefault();
    onBlocked();
    return true;
  };

  const linkClass = cn(buttonClasses("secondary", "md", "w-full"), none && "opacity-50");

  return (
    <div className="mt-2 grid gap-2">
      <a href={webcal} onClick={guard} aria-disabled={none || undefined} className={buttonClasses("primary", "md", cn("w-full", none && "opacity-50"))}>
        <CalendarCheckIcon />
        {calendar.apple}
      </a>
      <a href={google} target="_blank" rel="noopener" onClick={guard} aria-disabled={none || undefined} className={linkClass}>
        <ExternalIcon />
        {calendar.google}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <button
        type="button"
        onClick={async (event) => {
          if (guard(event)) return;
          onStatus((await copyText(feed.href)) ? calendar.copied : calendar.copyFailed);
        }}
        aria-disabled={none || undefined}
        aria-describedby={hintId}
        className={linkClass}
      >
        <LinkIcon />
        {calendar.copy}
      </button>
      <p id={hintId} className="text-center text-xs text-muted">
        {calendar.copyHint}
      </p>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function CalendarCheckIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 6.5h12M5.5 9.5l1.7 1.7 3.3-3.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path
        d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path
        d="M6.8 9.2a2.8 2.8 0 0 0 4 0l2-2a2.8 2.8 0 0 0-4-4l-.6.6M9.2 6.8a2.8 2.8 0 0 0-4 0l-2 2a2.8 2.8 0 0 0 4 4l.6-.6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
