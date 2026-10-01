import Link from "next/link";

import { ListCard, ListRow } from "@/components/dashboard/DashboardSection";
import { songLinkClasses } from "@/components/song-list/SongLink";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { dashboardContent } from "@/content/dashboard";
import type { NewSheetSong } from "@/lib/dashboard/new-sheet-music";
import type { BrushUpSong, QuarterGlance as Glance } from "@/lib/dashboard/repertoire";
import type { SheetGap, SongSheetGaps } from "@/lib/dashboard/sheet-gaps";
import { formatAgo, formatLongDate, formatShortDate } from "@/lib/service-time";
import { songPath } from "@/lib/song-list";

const copy = dashboardContent;

function SongTitle({ title, number, slug }: { title: string; number?: string | null; slug: string }) {
  return (
    <span className="text-[0.95rem] text-ink">
      {number ? <span className="tnum mr-2 font-display text-gold-dark">{number}</span> : null}
      <Link href={songPath(slug)} className={songLinkClasses}>
        {title}
      </Link>
    </span>
  );
}

/** Upcoming songs not sung for a while, for the people who play or lead them. */
export function BrushUp({
  songs,
  recordsBegan,
  className,
}: {
  songs: BrushUpSong[];
  /** When the song records begin, to say "not since our records began" honestly. */
  recordsBegan: string | null;
  className?: string;
}) {
  return (
    <ListCard
      id="brush-up"
      title={copy.brushUp.title}
      lead={copy.brushUp.lead}
      className={className}
      rows={songs.map((song) => (
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
      ))}
    />
  );
}

function gapLabel(gap: SheetGap): string {
  const { gaps } = copy.sheetGaps;
  switch (gap.kind) {
    case "no-entry":
      return gaps.noEntry;
    case "no-files":
      return gaps.noFiles;
    case "no-standard":
      return gaps.noStandard;
    case "missing-pdf":
      return gaps.missingPdf.replace("{charts}", gap.charts.join(", "));
    case "rights":
      return gaps.rights;
  }
}

/** Upcoming songs with missing or incomplete sheet music, soonest first, for whoever looks after it. */
export function SheetGaps({ songs, className }: { songs: SongSheetGaps[]; className?: string }) {
  return (
    <ListCard
      id="sheet-music-gaps"
      title={copy.sheetGaps.title}
      lead={copy.sheetGaps.lead}
      className={className}
      rows={songs.map((song) => (
        <ListRow
          key={song.slug}
          main={<SongTitle {...song} />}
          aside={formatShortDate(song.firstStartsAt)}
          detail={song.gaps.map(gapLabel).join(" · ")}
        />
      ))}
    />
  );
}

/** Sheet music added or changed recently, upcoming songs first. */
export function NewSheetMusic({ songs, now, className }: { songs: NewSheetSong[]; now: number; className?: string }) {
  return (
    <ListCard
      id="new-sheet-music"
      title={copy.newSheet.title}
      lead={copy.newSheet.lead}
      className={className}
      rows={songs.map((song) => (
        <ListRow
          key={song.slug}
          main={<SongTitle {...song} />}
          aside={song.upcoming ? <span className="text-gold-dark">{copy.newSheet.upcoming}</span> : null}
          detail={copy.newSheet.updated.replace("{when}", formatAgo(Date.parse(song.changedAt), now))}
        />
      ))}
    />
  );
}

/** One line about the quarter, for people who see the statistics. */
export function QuarterGlance({ glance, className }: { glance: Glance; className?: string }) {
  const { quarter } = copy;
  const counted = (forms: readonly [string, string], count: number) =>
    (count === 1 ? forms[0] : forms[1]).replace("{count}", String(count));

  return (
    <Card
      barline
      className={cn("flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between", className)}
    >
      <p className="text-sm text-ink">
        <span className="mr-3 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">
          {(glance.current ? quarter.titleCurrent : quarter.titlePrevious).replace("{label}", glance.label)}
        </span>
        {counted(quarter.services, glance.services)} · {counted(quarter.songs, glance.differentSongs)}
        {glance.mostSung ? (
          <>
            {" · "}
            {quarter.mostSung.split("{title}")[0]}
            <Link href={songPath(glance.mostSung.slug)} className={songLinkClasses}>
              {glance.mostSung.title}
            </Link>
            {quarter.mostSung.split("{title}")[1].replace("{count}", String(glance.mostSung.count))}
          </>
        ) : null}
      </p>
      <Link
        href={`/song-list/year/${glance.quarter.year}`}
        className="group inline-flex shrink-0 items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
      >
        {quarter.recap.replace("{year}", String(glance.quarter.year))}
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </Link>
    </Card>
  );
}
