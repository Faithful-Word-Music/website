"use client";

import { ServiceTime, SongHintText, StatusPill } from "@/components/song-list/ServiceBits";
import { Card } from "@/components/ui/Card";
import { SongLink } from "@/components/song-list/SongLink";
import { songListContent } from "@/content/song-list";
import { formatCountdown, formatShortDate, splitDateLabel } from "@/lib/service-time";
import { songHint, type PlayIndex } from "@/lib/song-history";
import { songKey } from "@/lib/song-list";
import type { Service } from "@/types/song-list";

/**
 * The first thing on the page: the service in progress, or the next one to
 * start, with its songs in large type.
 *
 * While a service is under way it is shown as "Happening now", with the one
 * after it named underneath - so someone arriving mid-service sees what is
 * being sung, and anyone planning ahead sees what is next.
 */
export function NextServiceSpotlight({
  current,
  next,
  plays,
  now,
}: {
  current: Service | null;
  next: Service | null;
  plays: PlayIndex | null;
  now: number;
}) {
  const { spotlight } = songListContent;
  const featured = current ?? next;

  if (!featured || !featured.startsAt) {
    return (
      <Card className="p-6 text-center sm:p-10 print:hidden">
        <h2 className="font-display text-2xl text-ink">{spotlight.noneTitle}</h2>
        <p className="mx-auto mt-2 max-w-md text-muted">{spotlight.noneBody}</p>
      </Card>
    );
  }

  const isNow = featured === current;
  const { weekday, day } = splitDateLabel(featured.dateLabel);
  const headingId = "spotlight-heading";

  return (
    <section aria-labelledby={headingId} className="print:hidden">
      <Card className="relative overflow-hidden p-6 sm:p-8 lg:p-10">
        {/* Gold rule across the top: the one strong accent on the page. */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gold" />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
          <div>
            <p className="flex flex-wrap items-center gap-3">
              <StatusPill status={isNow ? "now" : "next"} />
              <span className="sr-only">{isNow ? spotlight.nowEyebrow : spotlight.nextEyebrow}: </span>
              <span className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">
                {weekday ?? ""}
                {weekday && featured.serviceLabel ? " · " : ""}
                {featured.serviceLabel ?? ""}
              </span>
            </p>

            <h2
              id={headingId}
              className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl"
            >
              {day ?? featured.dateLabel}
            </h2>
            <p className="mt-2 text-base text-ink-soft sm:text-lg">
              <ServiceTime startsAt={featured.startsAt} />
            </p>

            {!isNow ? (
              <p className="mt-5 inline-flex items-center rounded-full border border-line bg-paper px-4 py-1.5 text-sm font-medium text-ink">
                {capitalize(formatCountdown(featured.startsAt, now))}
              </p>
            ) : null}

            {isNow && next?.startsAt ? (
              <div className="mt-6 border-t border-line pt-4">
                <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted">
                  {spotlight.thenLabel}
                </p>
                <p className="mt-1 text-ink">
                  {formatShortDate(next.startsAt)}
                  {next.serviceLabel ? ` · ${next.serviceLabel}` : ""}
                </p>
                <p className="text-sm text-muted">{capitalize(formatCountdown(next.startsAt, now))}</p>
              </div>
            ) : null}
          </div>

          <ol className="divide-y divide-line border-y border-line lg:border-t-0">
            {featured.songs.map((song, index) => {
              const hint =
                plays && !isNow ? songHint(plays[songKey(song.title)], featured.startsAt!, now) : null;

              return (
                <li key={index} className="flex items-baseline gap-4 py-3 sm:py-3.5">
                  <span className="tnum w-12 shrink-0 text-right font-display text-xl text-gold-dark sm:text-2xl">
                    {song.number ?? <span aria-hidden="true">·</span>}
                    {song.number ? null : <span className="sr-only">No number</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg leading-snug text-ink sm:text-xl"><SongLink title={song.title} /></span>
                    {hint ? <SongHintText hint={hint} now={now} /> : null}
                  </span>
                  {song.key ? (
                    <span className="tnum shrink-0 rounded-md border border-line px-2 py-0.5 text-sm font-medium text-ink-soft">
                      <span className="sr-only">Key of </span>
                      {song.key}
                    </span>
                  ) : null}
                </li>
              );
            })}
            {Array.from({ length: featured.pendingSongs }, (_, index) => (
              <li key={`pending-${index}`} className="flex items-baseline gap-4 py-3 sm:py-3.5">
                <span aria-hidden="true" className="w-12 shrink-0" />
                <span className="text-lg italic text-muted sm:text-xl">
                  {songListContent.states.pendingSong}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </Card>
    </section>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
