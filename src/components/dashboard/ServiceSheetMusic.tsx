"use client";

import { useEffect, useId, useRef, useState } from "react";

import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useScrollLock } from "@/components/ui/use-scroll-lock";
import { dashboardContent } from "@/content/dashboard";

const copy = dashboardContent.comingUp.packet;

type PacketSong = { number: string | null; title: string };

/**
 * A service's sheet music as one PDF (see src/lib/service-sheet-pdf.ts), and
 * beside it an "i" that opens a dialog on printing it: all of it, only some
 * songs, or one song from its own page.
 */
export function ServiceSheetMusic({ href, songs, label }: { href: string; songs: PacketSong[]; label: string }) {
  const [open, setOpen] = useState(false);
  const count = (songs.length === 1 ? copy.count[0] : copy.count[1]).replace("{count}", String(songs.length));

  return (
    <>
      {/* One segmented control: the PDF, a hairline, then the help. Each half
          has its own hover, and the pair reads as one thing at any width. */}
      <div
        className={cn(
          "flex min-h-14 items-stretch overflow-hidden rounded-xl border transition-colors",
          "border-[color-mix(in_srgb,var(--color-gold)_40%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-gold)_7%,transparent)]",
          "hover:border-[color-mix(in_srgb,var(--color-gold)_70%,var(--color-line))]",
        )}
      >
        <a
          href={href}
          target="_blank"
          rel="noopener"
          className={cn(
            "group flex min-w-0 flex-1 items-center gap-3 py-2 pl-2.5 pr-3",
            "transition-colors hover:bg-[color-mix(in_srgb,var(--color-gold)_9%,transparent)] focus-visible:-outline-offset-2",
          )}
        >
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg text-gold-dark transition-transform group-active:scale-[0.94]",
              "bg-[color-mix(in_srgb,var(--color-gold)_14%,transparent)]",
            )}
          >
            <SheetIcon />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-sm font-medium text-ink">{copy.button}</span>
            <span className="mt-0.5 block text-xs text-muted">{count}</span>
            <span className="sr-only"> {copy.newTab}</span>
          </span>
        </a>

        <span aria-hidden="true" className="my-2.5 w-px shrink-0 bg-[color-mix(in_srgb,var(--color-gold)_30%,var(--color-line))]" />

        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={copy.help.toggle}
          title={copy.help.toggle}
          onClick={() => setOpen(true)}
          className={cn(
            "grid w-12 shrink-0 place-items-center text-muted transition-colors focus-visible:-outline-offset-2",
            "hover:bg-[color-mix(in_srgb,var(--color-gold)_9%,transparent)] hover:text-ink",
          )}
        >
          <InfoIcon />
        </button>
      </div>

      {open ? <PrintHelpDialog href={href} songs={songs} label={label} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Built on <dialog> like the Dashboard's other dialogs (ExpandableList):
 * showModal() keeps focus inside and the page behind inert; Escape, the close
 * button or a click outside the panel closes it, and focus returns to the "i".
 */
function PrintHelpDialog({
  href,
  songs,
  label,
  onClose,
}: {
  href: string;
  songs: PacketSong[];
  label: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const help = copy.help;

  useScrollLock(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-4 backdrop:bg-black/45 backdrop:backdrop-blur-[2px] sm:px-6 sm:pt-[10vh]"
    >
      <div className="animate-enter mx-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-card border border-line bg-surface shadow-lift sm:max-h-[80vh]">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h2 id={headingId} className="font-display text-2xl text-ink">
              {help.title}
            </h2>
            <p className="mt-1 text-sm text-muted">{label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={help.close}
            className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="space-y-6 overflow-y-auto overscroll-contain px-5 py-5 text-[0.95rem] leading-relaxed text-ink-soft">
          <p className="text-ink">{help.intro}</p>

          <section>
            <h3 className="font-medium text-ink">{help.whole.heading}</h3>
            <p className="mt-1">{help.whole.body}</p>
          </section>

          <section>
            <h3 className="font-medium text-ink">{help.some.heading}</h3>
            <ol className="mt-2 space-y-1.5">
              {help.some.steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="tnum mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-gold)_16%,transparent)] text-xs font-semibold text-gold-dark"
                  >
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 rounded-lg border-l-2 border-gold bg-[color-mix(in_srgb,var(--color-gold)_8%,transparent)] px-3 py-2 text-ink">
              {help.some.twoPages}
            </p>

            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-gold-dark">{help.some.inOrder}</p>
            <ol className="mt-1.5 space-y-0.5 text-sm">
              {songs.map((song, index) => (
                <li key={index} className="flex gap-2">
                  <span className="tnum w-8 shrink-0 text-right text-gold-dark">{song.number ?? "·"}</span>
                  <span className="text-ink">{song.title}</span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="font-medium text-ink">{help.one.heading}</h3>
            <p className="mt-1">{help.one.body}</p>
          </section>
        </div>

        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button type="button" onClick={onClose} className={buttonClasses("secondary")}>
            {help.close}
          </button>
          <a href={href} target="_blank" rel="noopener" className={buttonClasses("primary")}>
            {help.open}
            <span className="sr-only"> {copy.newTab}</span>
          </a>
        </footer>
      </div>
    </dialog>
  );
}

/** A page with a note on it. */
function SheetIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path
        d="M10.5 1.75H4.75a1 1 0 0 0-1 1v12.5a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1V5.5l-3.75-3.75Zm0 0V5.5h3.75"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.9 12.9V8.4l2.1-.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="8.5" cy="13" rx="1.5" ry="1.1" transform="rotate(-20 8.5 13)" fill="currentColor" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 8v4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="5.5" r="0.95" fill="currentColor" />
    </svg>
  );
}
