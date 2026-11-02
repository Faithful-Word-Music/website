"use client";

import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";
import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { SongLink, songRef } from "@/components/song-list/SongLink";
import { useHydrated } from "@/components/song-list/use-now";
import {
  formatAgo,
  formatChurchTime,
  formatLocalTime,
  formatShortDate,
  isDifferentClock,
} from "@/lib/service-time";
import type { SongHint } from "@/lib/song-history";
import type { Song } from "@/types/song-list";

/**
 * "10:30 AM Arizona time", plus "· 1:30 PM your time" for visitors whose clock
 * differs. The local part appears only after hydration: the server cannot know
 * the visitor's timezone, and guessing would flash the wrong time.
 */
export function ServiceTime({ startsAt, className }: { startsAt: string; className?: string }) {
  const hydrated = useHydrated();
  const showLocal = hydrated && isDifferentClock(startsAt);

  return (
    <span className={className}>
      <time dateTime={startsAt}>
        {formatChurchTime(startsAt)}{" "}
        <span className="text-muted">{siteConfig.songList.timeZoneLabel}</span>
      </time>
      {showLocal ? (
        <span className="text-muted">
          {" · "}
          {songListContent.spotlight.yourTime.replace("{time}", formatLocalTime(startsAt))}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The hint under an upcoming song: "Last sung 3 weeks ago", "First time ever"...
 * `inline` when it shares the song's second line with its leader tag (SongMeta).
 */
export function SongHintText({ hint, now, inline = false }: { hint: SongHint; now: number; inline?: boolean }) {
  const { hints } = songListContent;
  const { showFirstTimeHints } = siteConfig.songList;

  switch (hint.kind) {
    case "first-ever":
      return showFirstTimeHints ? <HintLabel emphasis inline={inline}>{hints.firstEver}</HintLabel> : null;
    case "first-this-year":
      return showFirstTimeHints ? <HintLabel emphasis inline={inline}>{hints.firstThisYear}</HintLabel> : null;
    case "last-sung":
      return (
        <HintLabel inline={inline}>
          {hints.lastSung.replace("{when}", formatAgo(Date.parse(hint.at), now))}
        </HintLabel>
      );
    case "also-on":
      return <HintLabel inline={inline}>{hints.alsoOn.replace("{date}", formatShortDate(hint.at))}</HintLabel>;
  }
}

/**
 * A song's second line: who leads it first, as a tag (LeaderTag) - always in
 * the same place, right under the title - then its "Last sung" hint. The tag
 * is a pill with a photo, not words, so the two never read as one sentence.
 * Nothing when there is neither. On a narrow card the hint wraps under the tag.
 */
export function SongMeta({ hint, leader }: { hint?: ReactNode; leader?: ReactNode }) {
  if (!hint && !leader) return null;
  return (
    // Same spacing as a hint alone (mt-0.5, a 1rem line): the tag adds no height to the row.
    <span className="mt-0.5 flex min-h-4 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs leading-4">
      {leader ? <span className="flex min-w-0 max-w-full">{leader}</span> : null}
      {hint}
    </span>
  );
}

function HintLabel({ children, emphasis = false, inline = false }: { children: string; emphasis?: boolean; inline?: boolean }) {
  return (
    <span
      className={cn(
        inline ? "min-w-0 text-xs" : "mt-0.5 block text-xs",
        emphasis ? "font-medium text-gold-dark" : "text-muted",
      )}
    >
      {emphasis ? (
        <span aria-hidden="true" className="mr-1">
          ✦
        </span>
      ) : null}
      {children}
    </span>
  );
}

/** The small "Next" / "Now" pill on a service. */
export function StatusPill({ status }: { status: "next" | "now" }) {
  const { badges } = songListContent;

  return status === "now" ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-dark px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-paper">
      <span aria-hidden="true" className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-paper/70" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-paper" />
      </span>
      {badges.now}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-ink px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-paper">
      {badges.next}
    </span>
  );
}

/**
 * A service not posted yet whose week's insert is already planned: that
 * song, labelled, so it can be learned ahead (src/lib/schedule-months.ts,
 * plannedInserts). Number, title and key read as on a posted service. A week
 * with a second insert shows one of these for each.
 */
export function PlannedInsert({ song, className }: { song: Song; className?: string }) {
  return (
    <p className={cn("flex items-baseline gap-3", className)}>
      <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-gold-dark">
        {songListContent.states.plannedInsert}
      </span>
      <span className="min-w-0 flex-1 text-[0.95rem] leading-snug text-ink sm:text-base">
        {song.number ? <span className="tnum mr-2 text-sm font-medium text-muted sm:text-base">{song.number}</span> : null}
        <SongLink {...songRef(song)} />
      </span>
      {song.key ? (
        <span className="tnum shrink-0 text-sm font-medium text-gold-dark sm:text-base">
          <span className="sr-only">Key of </span>
          {song.key}
        </span>
      ) : null}
    </p>
  );
}
