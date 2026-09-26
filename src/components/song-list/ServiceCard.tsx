"use client";

import type { MouseEvent, ReactNode } from "react";

import { ServiceTime, SongHintText, StatusPill } from "@/components/song-list/ServiceBits";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { songListContent } from "@/content/song-list";
import { serviceName } from "@/lib/share-services";
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
 *
 * The header's corner holds a share button - or, in select mode, a checkbox,
 * and then a tap anywhere on the card ticks it.
 */
export function ServiceCard({
  service,
  status,
  plays,
  now,
  animateIn = false,
  share,
  selection,
}: {
  service: Service;
  status: ServiceStatus;
  plays: PlayIndex | null;
  now: number;
  /** Fade up on appearing - used when the card arrives because of a search or month switch. */
  animateIn?: boolean;
  /** The share button for the header's corner. */
  share?: ReactNode;
  /**
   * Present in select mode: whether this card is ticked, whether it is
   * resting because the limit is reached, and how to toggle it.
   */
  selection?: { selected: boolean; blocked: boolean; onToggle: () => void };
}) {
  const headingId = `service-${service.id}`;
  const { columns, undatedServiceLabel } = songListContent;
  const past = status === "past";
  const highlighted = status === "next" || status === "now";
  const { weekday, day } = splitDateLabel(service.dateLabel);
  const selected = selection?.selected ?? false;
  const blocked = selection?.blocked ?? false;

  // In select mode the whole card is the target. The checkbox handles its own
  // clicks (and the keyboard), so those are not counted twice.
  function onCardClick(event: MouseEvent<HTMLDivElement>) {
    if (!selection || (event.target as HTMLElement).closest("input, label, button, a")) return;
    selection.onToggle();
  }

  const card = (
    <Card
      barline
      className={cn(
        "h-full p-5 transition-[box-shadow,opacity] duration-300 sm:p-6",
        animateIn && "animate-enter",
        highlighted && !selection && "ring-2 ring-gold ring-offset-2 ring-offset-paper",
        past && "bg-surface/70",
        selection && "select-none",
        selection && (blocked ? "cursor-not-allowed opacity-55" : "cursor-pointer"),
        selected && "bg-white ring-2 ring-ink ring-offset-2 ring-offset-paper",
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
          {/* Next/Now sits beside the date it describes, inside the heading's
              line height - so it shifts nothing, and the corner stays free
              for the card's action. */}
          <div className="flex flex-wrap items-center gap-x-3">
            <h3
              id={headingId}
              className={cn("font-display text-xl sm:text-2xl", past ? "text-muted" : "text-ink")}
            >
              {day || service.dateLabel || undatedServiceLabel}
            </h3>
            {status === "next" || status === "now" ? <StatusPill status={status} /> : null}
          </div>
          {!weekday && service.serviceLabel ? (
            <p className="text-sm text-gold-dark">{service.serviceLabel}</p>
          ) : null}
          {service.startsAt ? (
            <ServiceTime startsAt={service.startsAt} className="mt-0.5 block text-sm text-ink-soft" />
          ) : null}
        </div>
        <div className="-mr-2 -mt-2 shrink-0">
          {selection ? (
            <SelectBox
              checked={selected}
              blocked={blocked}
              onChange={selection.onToggle}
              label={songListContent.share.selectLabel.replace("{date}", serviceName(service))}
            />
          ) : (
            share
          )}
        </div>
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

  return selection ? (
    <div className="h-full" onClick={onCardClick}>
      {card}
    </div>
  ) : (
    card
  );
}

/** A round tick box with a 44px target, like a phone's own select mode. */
function SelectBox({
  checked,
  blocked,
  onChange,
  label,
}: {
  checked: boolean;
  /** At the limit: shown as unavailable. Still takes a tap, which explains why. */
  blocked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      className={cn(
        "relative inline-flex h-11 w-11 items-center justify-center",
        blocked ? "cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        aria-disabled={blocked || undefined}
        className="peer h-6 w-6 cursor-[inherit] appearance-none aria-disabled:border-line aria-disabled:bg-paper rounded-full border-[1.5px] border-muted bg-surface transition-colors checked:border-ink checked:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-dark"
      />
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute text-paper opacity-0 transition-opacity peer-checked:opacity-100"
      >
        <path d="M2.5 6.2l2.3 2.3 4.7-4.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
