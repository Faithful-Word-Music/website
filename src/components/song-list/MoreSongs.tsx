"use client";

import Link from "next/link";
import { useState } from "react";

import { NewTabNote, songLinkGroupClasses, songLinkProps } from "@/components/song-list/SongLink";
import { Modal } from "@/components/ui/Modal";
import { songListContent } from "@/content/song-list";
import { formatLongDate } from "@/lib/service-time";
import { songPath, songSlug } from "@/lib/song-list";
import type { RecapSong } from "@/lib/year-recap";

const { facts } = songListContent.yearRecap;

const count = (template: string, value: number) => template.replace("{count}", value.toLocaleString("en-US"));

/**
 * "and 110 more": opens the songs sung once that the year page does not
 * name, in a scrolling list, in the site's dialog (Modal) - oldest first, the
 * order the page's own few are in.
 */
export function MoreSongs({ songs }: { songs: Array<RecapSong & { startsAt: string }> }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex min-h-9 items-center rounded-full border border-dashed border-staff px-3.5 text-sm font-medium text-ink transition-colors hover:border-gold"
      >
        {count(facts.onceMore, songs.length)}
      </button>

      {open ? (
        <Modal
          title={facts.onceMoreTitle}
          subtitle={count(facts.onceMoreLead[songs.length === 1 ? 0 : 1], songs.length)}
          closeLabel={facts.close}
          onClose={() => setOpen(false)}
          bare
        >
          <ol className="px-5 py-2">
            {songs.map((song) => (
              <li key={song.id} className="border-b border-line last:border-b-0">
                <Link
                  href={songPath(songSlug(song.title))}
                  {...songLinkProps}
                  className="group grid grid-cols-[2.75rem_1fr_auto] items-baseline gap-x-3 py-2.5"
                >
                  <span className="tnum text-sm font-medium text-muted">
                    {song.number ?? <span aria-hidden="true">·</span>}
                  </span>
                  <span className={`min-w-0 text-[0.95rem] leading-snug text-ink ${songLinkGroupClasses}`}>
                    {song.title}
                    <NewTabNote />
                  </span>
                  <span className="tnum whitespace-nowrap text-right text-xs text-muted">
                    {formatLongDate(song.startsAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Modal>
      ) : null}
    </>
  );
}
