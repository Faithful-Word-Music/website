"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";

import { NewTabNote, songLinkProps } from "@/components/song-list/SongLink";
import { SongSearch } from "@/components/song-list/SongSearch";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useFlip } from "@/components/ui/use-flip";
import { libraryContent } from "@/content/library";
import { libraryLetter, type LibrarySong } from "@/lib/library";
import { plural } from "@/lib/plural";
import { matchesSong, songPath } from "@/lib/song-list";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * The songs, set out like the alphabetical index at the back of a hymnal:
 * a large initial for each letter, each title led by dots to its number,
 * and a thumb index along the top to jump between letters. The search box
 * narrows the index as you type.
 */
export function SongIndex({ songs }: { songs: LibrarySong[] }) {
  const idPrefix = useId();
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(
    () => songs.filter((song) => matchesSong({ ...song, keys: [] }, { query, key: "" })),
    [songs, query],
  );
  const groups = useMemo(() => groupByLetter(shown), [shown]);
  // Each change of search glides the index into its new shape (see useFlip).
  useFlip(rootRef, shown);
  const present = new Set(groups.map(([letter]) => letter));
  const letters = songs.some((song) => libraryLetter(song.title) === "#") ? ["#", ...ALPHABET] : ALPHABET;

  const statusId = `${idPrefix}-status`;
  const searching = query.trim() !== "";
  const count = searching
    ? plural(libraryContent.matchCount, shown.length).replace("{total}", format(songs.length))
    : plural(libraryContent.songCount, songs.length);

  return (
    <div ref={rootRef}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SongSearch
          value={query}
          onChange={setQuery}
          inputId={`${idPrefix}-search`}
          describedBy={statusId}
          label={libraryContent.search.label}
          placeholder={libraryContent.search.placeholder}
          className="sm:max-w-md"
        />
        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
          <p id={statusId} role="status" className="tnum">
            {count}
          </p>
          {songs.some((song) => song.sheetMusic) ? (
            <p className="inline-flex items-center gap-1.5">
              <NoteMark />
              {libraryContent.sheetMusicKey}
            </p>
          ) : null}
        </div>
      </div>

      {/* The thumb index: every letter, with those that have no songs dimmed. */}
      <nav
        aria-label={libraryContent.lettersLabel}
        className="glass sticky top-16 z-20 -mx-4 mt-8 border-y border-line/80 px-4 sm:mx-0 sm:rounded-full sm:border sm:px-2"
      >
        <ul className="flex overflow-x-auto py-1 [scrollbar-width:none] sm:justify-between">
          {letters.map((letter) => (
            <li key={letter} className="shrink-0">
              {present.has(letter) ? (
                <a
                  href={`#${anchor(letter)}`}
                  className="flex h-9 min-w-9 items-center justify-center rounded-full font-display text-base text-ink transition-colors hover:bg-gold/15 hover:text-gold-dark"
                >
                  {letter}
                </a>
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-9 min-w-9 items-center justify-center font-display text-base text-muted/40"
                >
                  {letter}
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {groups.length === 0 ? (
        <div className="animate-enter py-20 text-center">
          <p className="font-display text-2xl text-ink">
            {libraryContent.noMatchTitle.replace("{query}", query.trim())}
          </p>
          <p className="mt-2 text-muted">{libraryContent.noMatchBody}</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className={buttonClasses("secondary", "md", "mt-6 px-6")}
          >
            {libraryContent.clearSearch}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          {groups.map(([letter, letterSongs]) => (
            <section
              key={letter}
              data-flip={`letter-${letter}`}
              aria-labelledby={anchor(letter)}
              className="grid grid-cols-1 gap-x-8 border-b border-line py-8 last:border-b-0 md:grid-cols-[6rem_minmax(0,1fr)] md:py-10"
            >
              <h3
                id={anchor(letter)}
                className="scroll-mt-32 font-display text-6xl leading-[0.85] text-gold md:sticky md:top-32 md:self-start md:text-7xl"
              >
                {letter}
              </h3>
              <ul className="mt-4 md:mt-0 lg:columns-2 lg:gap-12">
                {letterSongs.map((song) => (
                  <li key={song.slug} data-flip={song.slug} className="break-inside-avoid">
                    <IndexEntry song={song} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** One line of the index: title, dotted leader, hymn number. */
function IndexEntry({ song }: { song: LibrarySong }) {
  return (
    <Link
      href={songPath(song.slug)}
      {...songLinkProps}
      className="group flex min-h-11 items-baseline gap-2 rounded-sm py-2 focus-visible:outline-offset-4"
    >
      <span className="min-w-0 font-display text-[1.0625rem] leading-snug text-ink transition-colors group-hover:text-gold-dark">
        {song.title}
        <NewTabNote />
        {song.sheetMusic ? (
          <>
            {/* A no-break space keeps the note with the last word when the title wraps. */}
            {" "}
            <NoteMark className="ml-0.5 inline-block align-[-0.05em]" />
            <span className="sr-only">, {libraryContent.sheetMusicLabel}</span>
          </>
        ) : null}
      </span>
      {song.number ? (
        <>
          <span
            aria-hidden="true"
            className="relative -top-[0.3em] min-w-6 flex-1 border-b-2 border-dotted border-staff transition-colors group-hover:border-gold/60"
          />
          <span className="tnum shrink-0 font-display text-[1.0625rem] text-muted transition-colors group-hover:text-gold-dark">
            {song.number}
          </span>
        </>
      ) : null}
    </Link>
  );
}

/** A small quaver: this song has sheet music anyone can open. */
export function NoteMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 16"
      width="10"
      height="13"
      fill="currentColor"
      className={cn("shrink-0 text-gold", className)}
    >
      <ellipse cx="4" cy="12.6" rx="3.3" ry="2.4" transform="rotate(-22 4 12.6)" />
      <path d="M6.4 12.2V1c2 1.6 4.8 2.6 4.6 5.8-.9-1.4-2.4-2-3.2-2.2v7.6z" />
    </svg>
  );
}

/** Songs are already A-Z, so each letter's group keeps that order. */
function groupByLetter(songs: LibrarySong[]): Array<[string, LibrarySong[]]> {
  const groups = new Map<string, LibrarySong[]>();
  for (const song of songs) {
    const letter = libraryLetter(song.title);
    groups.set(letter, [...(groups.get(letter) ?? []), song]);
  }
  return [...groups.entries()];
}

function anchor(letter: string): string {
  return `letter-${letter === "#" ? "0-9" : letter}`;
}

function format(count: number): string {
  return count.toLocaleString("en-US");
}
