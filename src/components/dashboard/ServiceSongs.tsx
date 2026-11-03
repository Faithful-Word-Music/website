import { LeaderTag } from "@/components/song-list/LeaderCaption";
import { PlannedInsert, SongMeta } from "@/components/song-list/ServiceBits";
import { SongLink, songRef } from "@/components/song-list/SongLink";
import { cn } from "@/components/ui/cn";
import { dashboardContent } from "@/content/dashboard";
import type { ComingUpService, ComingUpSong } from "@/lib/dashboard/coming-up";
import type { CardLeaders } from "@/lib/dashboard/leadership";
import type { CardLeader } from "@/lib/leadership/board";
import { songIdentity } from "@/lib/song-identity";

const copy = dashboardContent.comingUp;

/**
 * A service's songs, in order, as the next service's details show them:
 * number, title (to its song page), who leads it when the service is not
 * led by one person throughout, the person's sheet music for it, and its key.
 * A service not posted yet says so, with any planned inserts.
 */
export function ServiceSongs({
  service,
  leaders,
  className,
}: {
  service: ComingUpService;
  leaders: CardLeaders | null;
  className?: string;
}) {
  const hasSongs = service.slots.length > 0;
  return (
    <ol className={cn("divide-y divide-line", className)}>
      {service.slots.map((song, index) => (
        <SongRow
          key={index}
          song={song}
          showLabel={service.showLabels}
          // Not one person for the whole service: each song says who leads it (cardLeaderView).
          leader={hasSongs && leaders?.view && !leaders.view.service ? leaders.view.rows[index + 1] : undefined}
        />
      ))}
      {!hasSongs ? <li className="py-2.5 text-[0.95rem] italic text-muted">{copy.notPosted}</li> : null}
      {service.plannedInserts.map((song) => (
        <li key={songIdentity(song)} className="py-2.5">
          <PlannedInsert song={song} />
        </li>
      ))}
    </ol>
  );
}

/**
 * One song. `leader`, when given (a service not led by one person
 * throughout), is a tag with their photo at the start of the song's second
 * line: "Brian", or "You" in gold - the viewer's own, easy to find.
 */
function SongRow({
  song,
  showLabel,
  leader,
}: {
  song: ComingUpSong | null;
  showLabel: boolean;
  leader: CardLeader | null | undefined;
}) {
  const tag = leader !== undefined ? <LeaderTag leader={leader} /> : undefined;
  return (
    <li className="flex items-baseline gap-3 py-2.5">
      <span className="tnum w-8 shrink-0 text-right font-display text-base text-gold-dark">
        {song?.number ?? <span aria-hidden="true">{song ? "·" : ""}</span>}
        {song && !song.number ? <span className="sr-only">No number</span> : null}
      </span>
      <span className="min-w-0 flex-1 text-[0.95rem] leading-snug text-ink">
        {song ? <SongLink {...songRef(song)} /> : <span className="italic text-muted">{copy.pendingSong}</span>}
        {/* Its second line: who leads it (a tag), then its sheet music. */}
        <SongMeta hint={song?.sheet ? <SongSheet sheet={song.sheet} showLabel={showLabel} /> : null} leader={tag} />
      </span>
      {song?.key ? (
        <span className="tnum min-w-8 shrink-0 rounded-md border border-line px-1.5 py-0.5 text-center text-xs font-medium text-ink-soft">
          <span className="sr-only">Key of </span>
          {song.key}
        </span>
      ) : null}
    </li>
  );
}

const sheetLinkClasses =
  "underline decoration-line underline-offset-2 transition-colors hover:text-ink hover:decoration-gold";

/**
 * Under a song: which of the person's sheet music types the service PDF uses
 * for it, with their other types it has as single PDFs - named only when
 * they have more than one type. A song with none of their types says so.
 */
function SongSheet({ sheet, showLabel }: { sheet: NonNullable<ComingUpSong["sheet"]>; showLabel: boolean }) {
  if (sheet.status === "missing") {
    return <span className="mt-0.5 block text-xs italic text-muted">{copy.noSheet}</span>;
  }
  if (!showLabel) return null;
  return (
    <span className="mt-0.5 block text-xs text-muted">
      <a href={sheet.shown.href} target="_blank" rel="noopener" className={cn(sheetLinkClasses, "text-ink-soft")}>
        {sheet.shown.label}
        <span className="sr-only"> {copy.sheetNewTab}</span>
      </a>
      {sheet.alternatives.length > 0 ? (
        <>
          {" · "}
          {copy.alsoSheet}{" "}
          {sheet.alternatives.map((choice, index) => (
            <span key={choice.href}>
              {index > 0 ? ", " : null}
              <a href={choice.href} target="_blank" rel="noopener" className={sheetLinkClasses}>
                {choice.label}
                <span className="sr-only"> {copy.sheetNewTab}</span>
              </a>
            </span>
          ))}
        </>
      ) : null}
    </span>
  );
}
