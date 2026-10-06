"use client";

import Link from "next/link";
import { useMemo } from "react";

import { PlannedInsert, ServiceTime, StatusPill } from "@/components/song-list/ServiceBits";
import { SongLink } from "@/components/song-list/SongLink";
import { useNow } from "@/components/song-list/use-now";
import { buttonClasses } from "@/components/ui/Button";
import { homeContent } from "@/content/home";
import { songListContent } from "@/content/song-list";
import { formatCountdown, getTimeline, splitDateLabel } from "@/lib/service-time";
import { serviceSlots } from "@/lib/song-list";
import type { Service } from "@/types/song-list";

/**
 * A compact version of the song list's spotlight for the home page: the
 * service happening now, or the next one, with its songs. Worked out against
 * the visitor's live clock, like the song list itself, so it moves on the
 * moment a service starts. No song hints - the full list has those.
 */
export function NextServiceCard({ services, serverNow }: { services: Service[]; serverNow: number }) {
  const now = useNow(serverNow);
  const timeline = useMemo(() => getTimeline(services, now), [services, now]);
  const { next: copy } = homeContent.songList;
  const { states, spotlight } = songListContent;

  const featuredId = timeline.nowId ?? timeline.nextId;
  const featured = services.find((service) => service.id === featuredId) ?? null;
  const isNow = featured !== null && featured.id === timeline.nowId;
  const headingId = "home-next-service";

  if (!featured || !featured.startsAt) {
    return (
      <div className="rounded-card border border-line bg-paper p-5 text-center sm:p-6">
        <p className="font-display text-lg text-ink">{spotlight.noneTitle}</p>
      </div>
    );
  }

  const { weekday, day } = splitDateLabel(featured.dateLabel);

  return (
    <section
      aria-labelledby={headingId}
      className="relative overflow-hidden rounded-card border border-line bg-paper p-5 sm:p-6"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gold" />

      <p className="flex flex-wrap items-center gap-3">
        <StatusPill status={isNow ? "now" : "next"} />
        <span className="sr-only">{isNow ? copy.nowEyebrow : copy.nextEyebrow}: </span>
        <span className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">
          {weekday ?? ""}
          {weekday && featured.serviceLabel ? " · " : ""}
          {featured.serviceLabel ?? ""}
        </span>
      </p>

      <h3 id={headingId} className="mt-3 font-display text-2xl leading-tight text-ink sm:text-3xl">
        {day ?? featured.dateLabel}
      </h3>
      <p className="mt-1 text-sm text-ink-soft">
        <ServiceTime startsAt={featured.startsAt} />
        {!isNow ? (
          <span className="text-muted"> · {formatCountdown(featured.startsAt, now)}</span>
        ) : null}
      </p>

      <ol className="mt-4 divide-y divide-line border-y border-line">
        {serviceSlots(featured).map((song, index) => (
          <li key={index} className="flex items-baseline gap-3 py-2">
            <span className="tnum w-8 shrink-0 text-right font-display text-base text-gold-dark">
              {song?.number ?? <span aria-hidden="true">{song ? "·" : ""}</span>}
              {song && !song.number ? <span className="sr-only">No number</span> : null}
            </span>
            <span className="min-w-0 flex-1 text-[0.95rem] leading-snug text-ink">
              {song ? <SongLink title={song.title} /> : <span className="italic text-muted">{states.pendingSong}</span>}
            </span>
            {song?.key ? (
              <span className="tnum shrink-0 rounded-md border border-line px-1.5 py-0.5 text-xs font-medium text-ink-soft">
                <span className="sr-only">Key of </span>
                {song.key}
              </span>
            ) : null}
          </li>
        ))}
        {featured.songs.length === 0 && featured.pendingSongs === 0 ? (
          <li className="py-2 pl-11 text-[0.95rem] italic text-muted">{states.notPosted}</li>
        ) : null}
        {featured.plannedInserts?.map((song) => (
          <li key={song.title} className="py-2 pl-11">
            <PlannedInsert song={song} />
          </li>
        ))}
      </ol>

      <Link href="/song-list" className={buttonClasses("secondary", "md", "group mt-5 w-full px-6")}>
        {copy.fullList}
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </Link>
    </section>
  );
}
