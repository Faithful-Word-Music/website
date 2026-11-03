import Link from "next/link";
import type { ReactNode } from "react";

import { ListRow } from "@/components/dashboard/DashboardSection";
import { ExpandableList } from "@/components/dashboard/ExpandableList";
import { NewTabNote, songLinkClasses, songLinkProps } from "@/components/song-list/SongLink";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/Icon";
import { dashboardContent } from "@/content/dashboard";
import type { NewSheetSong } from "@/lib/dashboard/new-sheet-music";
import type { BrushUpSong, QuarterGlance as Glance } from "@/lib/dashboard/repertoire";
import type { SheetGap, SongSheetGaps } from "@/lib/dashboard/sheet-gaps";
import { plural } from "@/lib/plural";
import { formatAgo, formatLongDate, formatShortDate } from "@/lib/service-time";
import { songPath } from "@/lib/song-list";

const copy = dashboardContent;

/** Rows shown before "Show all". */
export const MUSIC_LIST_LIMIT = 5;

function SongTitle({ title, number, slug }: { title: string; number?: string | null; slug: string }) {
  return (
    <span className="text-[0.95rem] text-ink">
      {number ? <span className="tnum mr-2 font-display text-gold-dark">{number}</span> : null}
      <Link href={songPath(slug)} {...songLinkProps} className={songLinkClasses}>
        {title}
        <NewTabNote />
      </Link>
    </span>
  );
}

/**
 * A list of songs in a tab or a panel: the first five, then "Show all",
 * which opens every row in a dialog so the panel never grows.
 */
export function MusicList({ rows, title, lead }: { rows: ReactNode[]; title: string; lead?: string }) {
  return rows.length > MUSIC_LIST_LIMIT ? (
    <ExpandableList rows={rows} limit={MUSIC_LIST_LIMIT} title={title} lead={lead} />
  ) : (
    <ul className="divide-y divide-line border-t border-line">{rows}</ul>
  );
}

/** Upcoming songs not sung for a while, for the people who play or lead them. */
export function brushUpRows(songs: BrushUpSong[], recordsBegan: string | null): ReactNode[] {
  return songs.map((song) => (
    <ListRow
      key={song.slug}
      main={<SongTitle {...song} />}
      aside={formatShortDate(song.startsAt)}
      detail={
        song.lastSung
          ? copy.brushUp.lastSung.replace("{date}", formatLongDate(song.lastSung))
          : recordsBegan
            ? copy.brushUp.neverSung.replace("{date}", formatLongDate(recordsBegan))
            : copy.brushUp.neverSungNoRecords
      }
    />
  ));
}

/** Sheet music added or changed recently, upcoming songs first. */
export function newSheetRows(songs: NewSheetSong[], now: number): ReactNode[] {
  return songs.map((song) => (
    <ListRow
      key={song.slug}
      main={<SongTitle {...song} />}
      aside={song.upcoming ? <span className="text-gold-dark">{copy.newSheet.upcoming}</span> : null}
      detail={copy.newSheet.updated.replace("{when}", formatAgo(Date.parse(song.changedAt), now))}
    />
  ));
}

function gapLabel(gap: SheetGap): string {
  const { gaps } = copy.sheetGaps;
  switch (gap.kind) {
    case "no-entry":
      return gaps.noEntry;
    case "no-files":
      return gaps.noFiles;
    case "no-main-type":
      return gaps.noMainType.replace("{type}", gap.type);
    case "no-capo":
      return gaps.noCapo.replace("{type}", gap.type);
    case "missing-pdf":
      return gaps.missingPdf.replace("{types}", gap.types.join(", "));
    case "rights":
      return gaps.rights;
  }
}

/** Upcoming songs with missing or incomplete sheet music, soonest first, for whoever looks after it. */
export function sheetGapRows(songs: SongSheetGaps[]): ReactNode[] {
  return songs.map((song) => (
    <ListRow
      key={song.slug}
      main={<SongTitle {...song} />}
      aside={formatShortDate(song.firstStartsAt)}
      detail={song.gaps.map(gapLabel).join(" · ")}
    />
  ));
}

/**
 * The quarter in one line, for people who see the statistics: a slim strip
 * at the foot of the main column rather than a card of its own.
 */
export function QuarterGlance({ glance, className }: { glance: Glance; className?: string }) {
  const { quarter } = copy;
  const headingId = "dashboard-quarter";

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col gap-2 rounded-card border border-line bg-surface px-5 py-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-x-4 gap-y-1 md:flex-row md:items-baseline">
        <h2 id={headingId} className="shrink-0 font-display text-lg text-ink">
          {(glance.current ? quarter.titleCurrent : quarter.titlePrevious).replace("{label}", glance.label)}
        </h2>
        <p className="min-w-0 text-sm text-ink-soft">
          {plural(quarter.services, glance.services)} · {plural(quarter.songs, glance.differentSongs)}
          {glance.mostSung ? (
            <span className="text-muted">
              {" · "}
              {quarter.mostSung.split("{title}")[0]}
              <Link href={songPath(glance.mostSung.slug)} {...songLinkProps} className={cn(songLinkClasses, "text-ink")}>
                {glance.mostSung.title}
                <NewTabNote />
              </Link>
              {quarter.mostSung.split("{title}")[1].replace("{count}", String(glance.mostSung.count))}
            </span>
          ) : null}
        </p>
      </div>
      <Link
        href={`/song-list/year/${glance.quarter.year}`}
        className="group inline-flex min-h-9 shrink-0 items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
      >
        {quarter.recap.replace("{year}", String(glance.quarter.year))}
        <Icon name="arrow-right" size={13} strokeWidth={1.6} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </Link>
    </section>
  );
}
