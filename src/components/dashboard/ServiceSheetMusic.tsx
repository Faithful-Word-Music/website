"use client";

import { useState } from "react";

import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/Modal";
import { dashboardContent } from "@/content/dashboard";
import { plural } from "@/lib/plural";

const copy = dashboardContent.comingUp.packet;

type PacketSong = { number: string | null; title: string; label: string };

/**
 * A service's sheet music as one PDF (see src/lib/service-sheet-pdf.ts), and
 * beside it an "i" that opens a dialog on printing it: all of it, only some
 * songs, or one song from its own page.
 */
export function ServiceSheetMusic({
  href,
  songs,
  showLabels,
  label,
}: {
  href: string;
  songs: PacketSong[];
  /** Name each song's sheet music type in the list: only when they have more than one. */
  showLabels: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const count = plural(copy.count, songs.length);

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

      {open ? (
        <PrintHelpDialog href={href} songs={songs} showLabels={showLabels} label={label} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/** Printing help, in the site's dialog (Modal); focus returns to the "i". */
function PrintHelpDialog({
  href,
  songs,
  showLabels,
  label,
  onClose,
}: {
  href: string;
  songs: PacketSong[];
  showLabels: boolean;
  label: string;
  onClose: () => void;
}) {
  const help = copy.help;

  return (
    <Modal
      title={help.title}
      subtitle={label}
      closeLabel={help.close}
      onClose={onClose}
      bodyClassName="text-[0.95rem] leading-relaxed text-ink-soft"
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClasses("secondary")}>
            {help.close}
          </button>
          <a href={href} target="_blank" rel="noopener" className={buttonClasses("primary")}>
            {help.open}
            <span className="sr-only"> {copy.newTab}</span>
          </a>
        </>
      }
    >
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
              <span className="text-ink">
                {song.title}
                {showLabels ? <span className="text-muted"> · {song.label}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="font-medium text-ink">{help.one.heading}</h3>
        <p className="mt-1">{help.one.body}</p>
      </section>
    </Modal>
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
