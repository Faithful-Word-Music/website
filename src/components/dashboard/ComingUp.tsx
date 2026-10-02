import Link from "next/link";

import { ServiceSheetMusic } from "@/components/dashboard/ServiceSheetMusic";
import { ServiceTime, StatusPill } from "@/components/song-list/ServiceBits";
import { SongLink } from "@/components/song-list/SongLink";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { dashboardContent } from "@/content/dashboard";
import type { ComingUpService, ComingUpSong } from "@/lib/dashboard/coming-up";
import { formatCountdown, splitDateLabel } from "@/lib/service-time";

const copy = dashboardContent.comingUp;

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
  className,
}: {
  services: ComingUpService[];
  /** The song list could not be read. */
  unavailable: boolean;
  /** When the page was rendered, for "in 2 days". */
  now: number;
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
        <ol className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <li key={service.id}>
              <ServiceSummary service={service} now={now} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ServiceSummary({ service, now }: { service: ComingUpService; now: number }) {
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

      <ol aria-labelledby={headingId} className="mt-4 divide-y divide-line border-y border-line">
        {service.slots.map((song, index) => (
          <SongRow key={index} song={song} showLabel={service.showLabels} />
        ))}
        {!hasSongs ? <li className="py-2 text-[0.95rem] italic text-muted">{copy.notPosted}</li> : null}
      </ol>

      {service.packetHref ? (
        // mt-auto: on a row of cards, the buttons line up along the bottom.
        <div className="mt-auto pt-5">
          <ServiceSheetMusic
            href={service.packetHref}
            songs={service.packetSongs}
            showLabels={service.showLabels}
            label={[weekday, service.serviceLabel, day].filter(Boolean).join(" · ")}
          />
        </div>
      ) : null}
    </Card>
  );
}

function SongRow({ song, showLabel }: { song: ComingUpSong | null; showLabel: boolean }) {
  return (
    <li className="flex items-baseline gap-3 py-2">
      <span className="tnum w-8 shrink-0 text-right font-display text-base text-gold-dark">
        {song?.number ?? <span aria-hidden="true">{song ? "·" : ""}</span>}
        {song && !song.number ? <span className="sr-only">No number</span> : null}
      </span>
      <span className="min-w-0 flex-1 text-[0.95rem] leading-snug text-ink">
        {song ? <SongLink title={song.title} /> : <span className="italic text-muted">{copy.pendingSong}</span>}
        {song?.sheet ? <SongSheet sheet={song.sheet} showLabel={showLabel} /> : null}
      </span>
      {song?.key ? (
        <span className="tnum shrink-0 rounded-md border border-line px-1.5 py-0.5 text-xs font-medium text-ink-soft">
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
