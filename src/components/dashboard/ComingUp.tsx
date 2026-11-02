import Link from "next/link";

import { ServiceSheetMusic } from "@/components/dashboard/ServiceSheetMusic";
import { NoServiceSheetMusic } from "@/components/song-list/ServicePackets";
import { PlannedInsert, ServiceTime, StatusPill } from "@/components/song-list/ServiceBits";
import { ReportLink } from "@/components/support/ReportLink";
import { SongLink, songRef } from "@/components/song-list/SongLink";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { dashboardContent } from "@/content/dashboard";
import { supportContent } from "@/content/support";
import type { ComingUpService, ComingUpSong } from "@/lib/dashboard/coming-up";
import type { CardLeaders } from "@/lib/dashboard/leadership";
import type { CardLeader, MyAssignment } from "@/lib/leadership/board";
import { LeaderTag, ServiceLeaderLine } from "@/components/song-list/LeaderCaption";
import { SongMeta } from "@/components/song-list/ServiceBits";
import { positionsLabel } from "@/lib/leadership/model";
import { serviceHeadline } from "@/lib/service-planner/format";
import { formatCountdown, splitDateLabel } from "@/lib/service-time";
import { songIdentity } from "@/lib/song-identity";

const copy = dashboardContent.comingUp;
const leading = dashboardContent.leading;

/**
 * The next services and their songs. Someone with assigned sheet music types
 * gets their sheet music for each service as one PDF, with how to print it -
 * all of it or only some - in a dialog beside the button; under each song,
 * which of their types it uses, and a note when it has none of them.
 */
export function ComingUp({
  services,
  unavailable,
  now,
  leaders = {},
  later = [],
  className,
}: {
  services: ComingUpService[];
  /** The song list could not be read. */
  unavailable: boolean;
  /** When the page was rendered, for "in 2 days". */
  now: number;
  /** By service: who leads its songs, as the viewer may see it (src/lib/dashboard/leadership.ts). */
  leaders?: Record<string, CardLeaders | null>;
  /** The viewer's own song leading beyond these cards. */
  later?: MyAssignment[];
  className?: string;
}) {
  const headingId = "dashboard-coming-up";

  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={headingId} className="font-display text-2xl text-ink">
          {copy.title}
        </h2>
        <Link
          href="/song-list"
          className="group inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
        >
          {copy.fullList}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      </div>

      {services.length === 0 ? (
        <p className="mt-4 text-muted">{unavailable ? copy.unavailable : copy.none}</p>
      ) : (
        <ol className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <li key={service.id}>
              <ServiceSummary service={service} now={now} leaders={leaders[service.id] ?? null} />
            </li>
          ))}
        </ol>
      )}
      {later.length > 0 ? <LaterLeading assignments={later} /> : null}
    </section>
  );
}

function ServiceSummary({ service, now, leaders }: { service: ComingUpService; now: number; leaders: CardLeaders | null }) {
  const { weekday, day } = splitDateLabel(service.dateLabel);
  const flagged = service.status === "now" || service.status === "next";
  const headingId = `dashboard-service-${service.id}`;
  const hasSongs = service.slots.length > 0;

  return (
    <Card className="relative flex h-full flex-col overflow-hidden p-5 sm:p-6">
      {flagged ? <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gold" /> : null}

      <p className="flex flex-wrap items-center gap-3">
        {service.status === "now" || service.status === "next" ? <StatusPill status={service.status} /> : null}
        <span className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">
          {weekday ?? ""}
          {weekday && service.serviceLabel ? " · " : ""}
          {service.serviceLabel ?? ""}
        </span>
      </p>

      <h3 id={headingId} className="mt-3 font-display text-xl leading-tight text-ink sm:text-2xl">
        {day ?? service.dateLabel}
      </h3>
      <p className="mt-1 text-sm text-ink-soft">
        <ServiceTime startsAt={service.startsAt} />
        {service.status !== "now" ? (
          <span className="text-muted"> · {formatCountdown(service.startsAt, now)}</span>
        ) : null}
      </p>

      {leaders?.view?.service ? <ServiceLeaderLine leader={leaders.view.service} className="mt-1" /> : null}
      {!hasSongs && leaders && leaders.mine.length > 0 ? (
        <p className="mt-2 text-sm font-medium text-gold-dark">{leading.youLeadDraft.replace("{songs}", positionsLabel(leaders.mine))}</p>
      ) : null}
      {leaders && leaders.mine.length > 0 ? (
        <ReportLink entry="problem" category="leader_assignment" refs={{ service: service.id, leading: 1 }} className="mt-1 self-start">
          {supportContent.report.assignment}
        </ReportLink>
      ) : null}
      <ol aria-labelledby={headingId} className="mt-4 divide-y divide-line border-y border-line">
        {service.slots.map((song, index) => (
          <SongRow
            key={index}
            song={song}
            showLabel={service.showLabels}
            // Not one person for the whole service: each song says who leads it (cardLeaderView).
            leader={hasSongs && leaders?.view && !leaders.view.service ? leaders.view.rows[index + 1] : undefined}
          />
        ))}
        {!hasSongs ? <li className="py-2 text-[0.95rem] italic text-muted">{copy.notPosted}</li> : null}
        {service.plannedInserts.map((song) => (
          <li key={songIdentity(song)} className="py-2">
            <PlannedInsert song={song} />
          </li>
        ))}
      </ol>

      {service.packetHref ? (
        // mt-auto: on a row of cards, the buttons line up along the bottom.
        <div className="mt-auto pt-5">
          <ServiceSheetMusic
            href={service.packetHref}
            songs={service.packetSongs}
            showLabels={service.showLabels}
            label={[weekday, service.serviceLabel, day].filter(Boolean).join(" · ")}
            types={service.packetTypes}
          />
        </div>
      ) : hasSongs && (service.sheetMusicChecked || service.packetTypes.length > 0) ? (
        <div className="mt-auto pt-5">
          <NoServiceSheetMusic types={service.packetTypes} own={service.sheetMusicChecked} />
        </div>
      ) : null}
    </Card>
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
    <li className="flex items-baseline gap-3 py-2">
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

/**
 * The viewer's next services as a song leader, beyond the cards above: which
 * songs they lead, and - once the song list is published - those songs and
 * their keys. Before then, only their positions: a draft's songs are not
 * theirs to see yet.
 */
function LaterLeading({ assignments }: { assignments: MyAssignment[] }) {
  return (
    <div className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-dark">{leading.title}</h3>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {assignments.map((assignment) => (
          <li key={assignment.anchor} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-sm">
            {assignment.published ? (
              <Link
                href={`/song-list#${assignment.anchor}`}
                className="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-gold"
              >
                {serviceHeadline(assignment)}
              </Link>
            ) : (
              <span className="font-medium text-ink">{serviceHeadline(assignment)}</span>
            )}
            <span className="text-ink-soft">{positionsLabel(assignment.positions)}</span>
            {assignment.songs && assignment.songs.length > 0 ? (
              <span className="min-w-0 text-muted">
                {assignment.songs
                  .map((song) => [song.number, song.title].filter(Boolean).join(" ") + (song.key ? ` (${song.key})` : ""))
                  .join(" · ")}
              </span>
            ) : !assignment.published ? (
              <span className="text-muted">{leading.notPublished}</span>
            ) : null}
            {assignment.unavailable ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-gold-dark">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-gold" />
                {leading.unavailable}
              </span>
            ) : null}
            <ReportLink entry="problem" category="leader_assignment" refs={{ service: assignment.anchor, leading: 1 }} className="ml-auto">
              {supportContent.report.assignment}
            </ReportLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
