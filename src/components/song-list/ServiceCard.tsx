"use client";

import { ServiceTime, SongHintText, StatusPill } from "@/components/song-list/ServiceBits";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { songListContent } from "@/content/song-list";
import { songHint, type PlayIndex } from "@/lib/song-history";
import { songKey } from "@/lib/song-list";
import { splitDateLabel } from "@/lib/service-time";
import type { ServiceStatus } from "@/lib/service-time";
import type { Service } from "@/types/song-list";

/**
 * One service: its date, Morning/Evening and start time, and its songs.
 *
 * The songs are a real <table> - they are genuinely tabular (number, title,
 * key). The column headers are visually hidden because repeating "No. / Song /
 * Key" on every card is noise for sighted readers, while screen reader users
 * still get the column name announced with each cell.
 *
 * Upcoming services carry a hint under each song ("Last sung 3 weeks ago");
 * services that have happened are quieter and carry none.
 */
export function ServiceCard({
  service,
  status,
  plays,
  now,
  animateIn = false,
}: {
  service: Service;
  status: ServiceStatus;
  plays: PlayIndex | null;
  now: number;
  /** Fade up on appearing - used when the card arrives because of a search or month switch. */
  animateIn?: boolean;
}) {
  const headingId = `service-${service.id}`;
  const { columns, undatedServiceLabel } = songListContent;
  const past = status === "past";
  const highlighted = status === "next" || status === "now";
  const { weekday, day } = splitDateLabel(service.dateLabel);

  return (
    <Card
      barline
      className={cn(
        "h-full p-5 transition-shadow duration-300 sm:p-6",
        animateIn && "animate-enter",
        highlighted && "ring-2 ring-gold ring-offset-2 ring-offset-paper",
        past && "bg-surface/70",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          {weekday ? (
            <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-gold-dark">
              {weekday}
              {service.serviceLabel ? (
                <span className="text-muted"> · {service.serviceLabel}</span>
              ) : null}
            </p>
          ) : null}
          <h3
            id={headingId}
            className={cn("font-display text-xl sm:text-2xl", past ? "text-muted" : "text-ink")}
          >
            {day || service.dateLabel || undatedServiceLabel}
          </h3>
          {!weekday && service.serviceLabel ? (
            <p className="text-sm text-gold-dark">{service.serviceLabel}</p>
          ) : null}
          {service.startsAt ? (
            <ServiceTime startsAt={service.startsAt} className="mt-0.5 block text-sm text-ink-soft" />
          ) : null}
        </div>
        {status === "next" || status === "now" ? (
          <div className="shrink-0 pt-0.5">
            <StatusPill status={status} />
          </div>
        ) : null}
      </div>

      <table aria-labelledby={headingId} className="w-full table-fixed border-collapse">
        {/* table-fixed takes its column widths from the first row, and the
            first row here is the visually hidden header - so the widths are
            declared on <col> instead of on the cells. */}
        <colgroup>
          <col className="w-11 sm:w-12" />
          <col />
          <col className="w-20" />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th scope="col">{columns.number}</th>
            <th scope="col">{columns.title}</th>
            <th scope="col">{columns.key}</th>
          </tr>
        </thead>
        <tbody className={past ? "text-muted" : "text-ink"}>
          {service.songs.map((song, index) => {
            const hint =
              !past && plays && service.startsAt
                ? songHint(plays[songKey(song.title)], service.startsAt, now)
                : null;

            return (
              <tr
                key={`${service.id}-${index}`}
                className="align-baseline border-line [&:not(:last-child)]:border-b"
              >
                <td className="tnum py-2.5 pr-3 text-sm font-medium text-muted sm:text-base">
                  {song.number ?? <span aria-hidden="true">·</span>}
                </td>
                <td className="py-2.5 pr-3 text-[0.95rem] leading-snug sm:text-base">
                  {song.title}
                  {hint ? (
                    <span>
                      <SongHintText hint={hint} now={now} />
                    </span>
                  ) : null}
                </td>
                <td
                  className={cn(
                    "tnum py-2.5 text-right text-sm font-medium sm:text-base",
                    past ? "text-muted" : "text-gold-dark",
                  )}
                >
                  {song.key ?? ""}
                </td>
              </tr>
            );
          })}
          {/* Slots still marked "TBD" in the sheet: the service is planned,
              its songs are not chosen yet. */}
          {Array.from({ length: service.pendingSongs }, (_, index) => (
            <tr key={`pending-${index}`} className="align-baseline border-line [&:not(:last-child)]:border-b">
              <td className="py-2.5 pr-3" />
              <td className="py-2.5 pr-3 text-[0.95rem] italic text-muted sm:text-base">
                {songListContent.states.pendingSong}
              </td>
              <td className="py-2.5" />
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
