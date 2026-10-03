"use client";

import { cn } from "@/components/ui/cn";
import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { SongLink } from "@/components/song-list/SongLink";
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

/** The hint under an upcoming song: "Last sung 3 weeks ago", "First time ever"... */
export function SongHintText({ hint, now }: { hint: SongHint; now: number }) {
  const { hints } = songListContent;
  const { showFirstTimeHints } = siteConfig.songList;

  switch (hint.kind) {
    case "first-ever":
      return showFirstTimeHints ? <HintLabel emphasis>{hints.firstEver}</HintLabel> : null;
    case "first-this-year":
      return showFirstTimeHints ? <HintLabel emphasis>{hints.firstThisYear}</HintLabel> : null;
    case "last-sung":
      return (
        <HintLabel>
          {hints.lastSung.replace("{when}", formatAgo(Date.parse(hint.at), now))}
        </HintLabel>
      );
    case "also-on":
      return <HintLabel>{hints.alsoOn.replace("{date}", formatShortDate(hint.at))}</HintLabel>;
  }
}

function HintLabel({ children, emphasis = false }: { children: string; emphasis?: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 block text-xs",
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
 * A service not posted yet whose week's insert is already planned: that one
 * song, labelled, so it can be learned ahead (src/lib/schedule-months.ts,
 * plannedInserts). Number, title and key read as on a posted service.
 */
export function PlannedInsert({ song, className }: { song: Song; className?: string }) {
  return (
    <p className={cn("flex items-baseline gap-3", className)}>
      <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-gold-dark">
        {songListContent.states.plannedInsert}
      </span>
      <span className="min-w-0 flex-1 text-[0.95rem] leading-snug text-ink sm:text-base">
        {song.number ? <span className="tnum mr-2 text-sm font-medium text-muted sm:text-base">{song.number}</span> : null}
        <SongLink title={song.title} />
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
