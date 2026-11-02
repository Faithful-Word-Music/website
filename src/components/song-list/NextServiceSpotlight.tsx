"use client";

import { songIdentity } from "@/lib/song-identity";

import { ListenLink } from "@/components/recordings/ListenLink";
import { ReportLink } from "@/components/support/ReportLink";
import { supportContent } from "@/content/support";
import { PlannedInsert, ServiceTime, SongHintText, SongMeta, StatusPill } from "@/components/song-list/ServiceBits";
import { LeaderTag, ServiceLeaderLine } from "@/components/song-list/LeaderCaption";
import { ServicePacketSlot } from "@/components/song-list/ServicePackets";
import { useCardLeaders } from "@/components/song-list/SongLeaders";
import { SongLink, songRef } from "@/components/song-list/SongLink";
import { Card } from "@/components/ui/Card";
import { songListContent } from "@/content/song-list";
import { formatCountdown, formatShortDate, splitDateLabel } from "@/lib/service-time";
import { songHint, type PlayIndex } from "@/lib/song-history";
import { serviceSlots } from "@/lib/song-list";
import type { Service } from "@/types/song-list";

/**
 * The first thing on the page: the service in progress, or the next one to
 * start, with its songs in large type.
 *
 * While a service is under way it is shown as "Happening now", with the one
 * after it named underneath - so someone arriving mid-service sees what is
 * being sung, and anyone planning ahead sees what is next.
 *
 * On a phone it is sized to fit one screen under the site header: tighter
 * padding, the countdown on the same line as the time, and song rows a size
 * down. On a short phone (`short-phone`, globals.css) the padding and rows
 * tighten again, so the sheet music and the footer still fit on the screen.
 * From `sm` up it has room to breathe.
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
  // Signed in: who leads it (SongLeaders.tsx, cardLeaderView) - asked before anything returns early.
  const leaders = useCardLeaders(featured?.id ?? "", featured ? serviceSlots(featured) : []);

  if (!featured || !featured.startsAt) {
    return (
      <Card className="p-6 text-center sm:p-10">
        <h2 className="font-display text-2xl text-ink">{spotlight.noneTitle}</h2>
        <p className="mx-auto mt-2 max-w-md text-muted">{spotlight.noneBody}</p>
      </Card>
    );
  }

  const isNow = featured === current;
  const { weekday, day } = splitDateLabel(featured.dateLabel);
  const headingId = "spotlight-heading";

  return (
    <section aria-labelledby={headingId}>
      <Card className="relative overflow-hidden p-5 short-phone:p-4 sm:p-8 lg:p-10">
        {/* Gold rule across the top: the one strong accent on the page. */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gold" />

        <div className="grid grid-cols-1 gap-5 short-phone:gap-3 sm:gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
          <div>
            <p className="flex flex-wrap items-center gap-3">
              <StatusPill status={isNow ? "now" : "next"} />
              <span className="sr-only">{isNow ? spotlight.nowEyebrow : spotlight.nextEyebrow}: </span>
              <span className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-gold-dark sm:tracking-[0.18em]">
                {weekday ?? ""}
                {weekday && featured.serviceLabel ? " · " : ""}
                {featured.serviceLabel ?? ""}
              </span>
            </p>

            <h2
              id={headingId}
              className="mt-3 font-display text-3xl leading-tight text-ink short-phone:mt-2 sm:mt-4 sm:text-5xl"
            >
              {day ?? featured.dateLabel}
            </h2>
            {/* On a phone the countdown follows the time on the same line;
                from sm up it takes its own line beneath. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 short-phone:mt-1 sm:block">
              <p className="text-base text-ink-soft sm:text-lg">
                <ServiceTime startsAt={featured.startsAt} />
              </p>

              {!isNow ? (
                <p className="inline-flex items-center rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-ink sm:mt-5 sm:px-4 sm:py-1.5 sm:text-sm">
                  {capitalize(formatCountdown(featured.startsAt, now))}
                </p>
              ) : null}
            </div>
            {leaders?.service ? <ServiceLeaderLine leader={leaders.service} className="mt-3 sm:mt-4 sm:text-base" /> : null}

            {isNow && next?.startsAt ? (
              <div className="mt-4 border-t border-line pt-3 sm:mt-6 sm:pt-4">
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

          {/* The songs and, right under them, the sheet music for them. */}
          <div>
            <ol className="divide-y divide-line border-y border-line lg:border-t-0">
              {serviceSlots(featured).map((song, index) => {
                // Not one person for the whole service: each song carries its leader's tag, with
                // their photo, at the start of its second line; the viewer's own says "You", in gold.
                const leader = leaders && !leaders.service ? leaders.rows[index + 1] : undefined;
                const tag = leader !== undefined ? <LeaderTag leader={leader} /> : undefined;
                const row = "flex items-baseline gap-2.5 py-2.5 short-phone:py-1.5 sm:gap-4 sm:py-3.5";
                // A slot not filled in yet keeps its place among the songs.
                if (!song) {
                  return (
                    <li key={index} className={row}>
                      <span aria-hidden="true" className="w-7 shrink-0 sm:w-12" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base italic text-muted sm:text-xl">{songListContent.states.pendingSong}</span>
                        <SongMeta leader={tag} />
                      </span>
                    </li>
                  );
                }
                const hint =
                  plays && !isNow ? songHint(plays[songIdentity(song)], featured.startsAt!, now, { insert: song.insert }) : null;

                return (
                  <li key={index} className={row}>
                    <span className="tnum w-7 shrink-0 text-right font-display text-base text-gold-dark sm:w-12 sm:text-2xl">
                      {song.number ?? <span aria-hidden="true">·</span>}
                      {song.number ? null : <span className="sr-only">No number</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base leading-snug text-ink short-phone:text-[0.95rem] sm:text-xl"><SongLink {...songRef(song)} /></span>
                      {/* Who leads it (a tag), then "Last sung" (the song's) - never one sentence. */}
                      <SongMeta hint={hint ? <SongHintText hint={hint} now={now} inline /> : null} leader={tag} />
                    </span>
                    {song.key ? (
                      // One width for every key, so the leader tags beside them line up.
                      <span className="tnum min-w-8 shrink-0 rounded-md border border-line px-1.5 py-0.5 text-center text-xs font-medium text-ink-soft sm:min-w-9 sm:px-2 sm:text-sm">
                        <span className="sr-only">Key of </span>
                        {song.key}
                      </span>
                    ) : null}
                  </li>
                );
              })}
              {featured.songs.length === 0 && featured.pendingSongs === 0 ? (
                <li className="flex items-baseline gap-2.5 py-2.5 short-phone:py-1.5 sm:gap-4 sm:py-3.5">
                  <span aria-hidden="true" className="w-7 shrink-0 sm:w-12" />
                  <span className="text-base italic text-muted sm:text-xl">
                    {songListContent.states.notPosted}
                  </span>
                </li>
              ) : null}
              {featured.plannedInserts?.map((song) => (
                <li key={song.title} className="flex items-baseline gap-2.5 py-2.5 short-phone:py-1.5 sm:gap-4 sm:py-3.5">
                  <span aria-hidden="true" className="w-7 shrink-0 sm:w-12" />
                  <PlannedInsert song={song} className="min-w-0 flex-1" />
                </li>
              ))}
            </ol>
            <ServicePacketSlot
              serviceId={featured.id}
              label={[featured.dateLabel, featured.serviceLabel].filter(Boolean).join(" · ")}
              className="pt-3 short-phone:pt-2 sm:pt-5"
            />
            {/* The same footer as the service cards: its playlist (while it is still to come) and a report link. */}
            {featured.date && featured.songs.length > 0 ? (
              <div className="mt-3 flex items-center justify-between gap-3 short-phone:mt-1">
                {!isNow ? <ListenLink href={`/playlists/${featured.date.slice(0, 7)}/${featured.id}`} /> : <span />}
                <ReportLink entry="problem" refs={{ service: featured.id }}>
                  {supportContent.report.problem}
                </ReportLink>
              </div>
            ) : null}
          </div>
        </div>
      </Card>
    </section>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
