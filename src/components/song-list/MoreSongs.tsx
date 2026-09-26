"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";

import { songListContent } from "@/content/song-list";
import { formatLongDate } from "@/lib/service-time";
import { songSlug } from "@/lib/song-list";
import type { RecapSong } from "@/lib/year-recap";

const { facts } = songListContent.yearRecap;

const count = (template: string, value: number) => template.replace("{count}", value.toLocaleString("en-US"));

/**
 * "and 110 more": opens the songs sung once that the year page does not
 * name, in a scrolling list. A native modal <dialog>, like "Add to
 * calendar": focus stays inside, Escape closes it, focus returns to the button.
 */
export function MoreSongs({ songs }: { songs: Array<RecapSong & { startsAt: string }> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          dialogRef.current?.showModal();
        }}
        aria-haspopup="dialog"
        className="inline-flex min-h-9 items-center rounded-full border border-dashed border-staff px-3.5 text-sm font-medium text-ink transition-colors hover:border-gold"
      >
        {count(facts.onceMore, songs.length)}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        // A click on the dimmed backdrop lands on the dialog itself: close.
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-card border border-line bg-surface p-0 text-ink shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
      >
        {open ? (
          <div className="flex max-h-[min(40rem,calc(100dvh-4rem))] flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 pb-4 pt-6">
              <div>
                <h2 id={titleId} className="font-display text-xl text-ink sm:text-2xl">
                  {facts.onceMoreTitle}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {count(facts.onceMoreLead[songs.length === 1 ? 0 : 1], songs.length)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                aria-label={facts.close}
                className="-mr-2 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink"
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <ol className="overflow-y-auto overscroll-contain px-6 py-2">
              {songs.map((song) => (
                <li key={song.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={`/song-list/archive/${songSlug(song.title)}`}
                    className="group grid grid-cols-[2.75rem_1fr_auto] items-baseline gap-x-3 py-2.5"
                  >
                    <span className="tnum text-sm font-medium text-muted">
                      {song.number ?? <span aria-hidden="true">·</span>}
                    </span>
                    <span className="min-w-0 text-[0.95rem] leading-snug text-ink decoration-gold underline-offset-4 group-hover:underline">
                      {song.title}
                    </span>
                    <span className="tnum whitespace-nowrap text-right text-xs text-muted">
                      {formatLongDate(song.startsAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
