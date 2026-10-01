import Link from "next/link";

import { ServiceTime, StatusPill } from "@/components/song-list/ServiceBits";
import { SongLink } from "@/components/song-list/SongLink";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { dashboardContent } from "@/content/dashboard";
import type { ComingUpService, ComingUpSong } from "@/lib/dashboard/coming-up";
import { formatCountdown, splitDateLabel } from "@/lib/service-time";

const copy = dashboardContent.comingUp;

/**
 * The next services and their songs. Someone with an assigned sheet music
 * type gets a "Sheet Music" link under each song that has that type - and
 * no link at all under one that doesn't.
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
    <Card className="relative h-full overflow-hidden p-5 sm:p-6">
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
          <SongRow key={index} song={song} />
        ))}
        {!hasSongs ? <li className="py-2 text-[0.95rem] italic text-muted">{copy.notPosted}</li> : null}
      </ol>
    </Card>
  );
}

function SongRow({ song }: { song: ComingUpSong | null }) {
  return (
    <li className="flex items-baseline gap-3 py-2">
      <span className="tnum w-8 shrink-0 text-right font-display text-base text-gold-dark">
        {song?.number ?? <span aria-hidden="true">{song ? "·" : ""}</span>}
        {song && !song.number ? <span className="sr-only">No number</span> : null}
      </span>
      <span className="min-w-0 flex-1 text-[0.95rem] leading-snug text-ink">
        {song ? <SongLink title={song.title} /> : <span className="italic text-muted">{copy.pendingSong}</span>}
        {song?.sheetHref ? (
          <a
            href={song.sheetHref}
            target="_blank"
            rel="noopener"
            className={cn(
              "mt-1 flex w-fit items-center gap-1 text-xs text-muted underline decoration-line underline-offset-4",
              "transition-colors hover:text-ink hover:decoration-gold",
            )}
          >
            {copy.sheet.label}
            <span className="sr-only"> {copy.sheet.newTab}</span>
          </a>
        ) : null}
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
