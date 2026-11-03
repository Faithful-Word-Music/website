import type { ReactNode } from "react";

import { Disclosure } from "@/components/dashboard/Disclosure";
import { ReadinessBadge, readinessReason, ReadinessSignals } from "@/components/dashboard/Readiness";
import { ServiceSheetMusic } from "@/components/dashboard/ServiceSheetMusic";
import { ServiceSongs } from "@/components/dashboard/ServiceSongs";
import { ServiceLeaderLine } from "@/components/song-list/LeaderCaption";
import { ServiceTime, StatusPill } from "@/components/song-list/ServiceBits";
import { NoServiceSheetMusic } from "@/components/song-list/ServicePackets";
import { ReportLink } from "@/components/support/ReportLink";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { dashboardContent } from "@/content/dashboard";
import { supportContent } from "@/content/support";
import type { HeroModel } from "@/lib/dashboard/workspace";
import { positionsLabel } from "@/lib/leadership/model";
import { plural } from "@/lib/plural";
import { formatCountdown, splitDateLabel } from "@/lib/service-time";

const copy = dashboardContent.hero;
const HEADING_ID = "dashboard-next-service";

/**
 * The next service: the page's centrepiece. Collapsed, it says when it is,
 * who leads, whether it is ready, and offers one main thing to do; its songs
 * and the readiness checks open underneath. With no service it says so - and
 * when the song list could not be read, it says that instead, never "none".
 *
 * `listen` is the playlist link, streamed in on its own (it waits for the
 * Preparation Playlists, which nothing else here does).
 */
export function NextServiceHero({
  hero,
  unavailable,
  now,
  listen,
  className,
}: {
  hero: HeroModel | null;
  /** The song list could not be read. */
  unavailable: boolean;
  now: number;
  listen?: ReactNode;
  className?: string;
}) {
  if (!hero) {
    const words = unavailable ? copy.unavailable : copy.none;
    return (
      <section aria-labelledby={HEADING_ID} className={className}>
        <h2 id={HEADING_ID} className="sr-only">
          {copy.label}
        </h2>
        <Notice
          tone="neutral"
          icon={unavailable ? "minus" : "calendar"}
          title={words.title}
          className="h-full"
          actions={
            <ButtonLink href="/song-list" variant="secondary">
              {copy.fullList}
            </ButtonLink>
          }
        >
          {words.body}
        </Notice>
      </section>
    );
  }

  const { service, readiness, leaders, primary, secondary } = hero;
  const { weekday, day } = splitDateLabel(service.dateLabel);
  const hasSongs = service.slots.length > 0;
  const chosen = service.slots.filter((song) => song !== null);
  const preview = chosen.slice(0, 3).map((song) => song.title).join(", ");
  const reason = readiness ? readinessReason(readiness) : null;
  const mine = leaders?.mine ?? [];
  const label = [weekday, service.serviceLabel, day].filter(Boolean).join(" · ");

  const primaryControl =
    primary.kind === "sheet-music" && service.packetHref ? (
      <div className="w-full sm:w-72">
        <ServiceSheetMusic
          href={service.packetHref}
          songs={service.packetSongs}
          showLabels={service.showLabels}
          label={label}
          types={service.packetTypes}
        />
      </div>
    ) : primary.kind !== "sheet-music" ? (
      <ButtonLink href={primary.href} className="w-full sm:w-auto">
        {primary.kind === "plan" ? copy.primary.plan : primary.kind === "review-songs" ? copy.primary.reviewSongs : copy.primary.songList}
        <Icon name="arrow-right" size={14} strokeWidth={1.6} />
      </ButtonLink>
    ) : null;

  return (
    <section
      aria-labelledby={HEADING_ID}
      className={cn("relative flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card", className)}
    >
      {/* The barline: the brand's mark for "this service", as on the song list's next card. */}
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-gold" />

      <div className="flex flex-1 flex-col px-5 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            {service.status === "now" || service.status === "next" ? <StatusPill status={service.status} /> : null}
            <span className="text-sm text-muted">
              {[weekday, service.serviceLabel].filter(Boolean).join(" · ")}
            </span>
          </p>
          {readiness ? <ReadinessBadge readiness={readiness} /> : null}
        </div>

        <h2 id={HEADING_ID} className="mt-3 font-display text-[2.25rem] leading-[1.05] tracking-tight text-ink sm:text-5xl">
          <span className="sr-only">{service.status === "now" ? copy.labelNow : copy.label}: </span>
          {day ?? service.dateLabel}
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[0.95rem] text-ink-soft">
          <Icon name="clock" size={15} className="text-muted" />
          <ServiceTime startsAt={service.startsAt} />
          {service.status !== "now" ? <span className="text-muted">· {formatCountdown(service.startsAt, now)}</span> : null}
        </p>

        <div className="mt-3 space-y-1.5 empty:hidden">
          {leaders?.view?.service ? <ServiceLeaderLine leader={leaders.view.service} /> : null}
          {mine.length > 0 && !leaders?.view?.service ? (
            <p className="text-sm font-medium text-gold-dark">
              {dashboardContent.leading.youLeadDraft.replace("{songs}", positionsLabel(mine))}
            </p>
          ) : null}
          {reason ? (
            <p className="flex items-start gap-1.5 text-sm text-ink-soft">
              <span className="sr-only">{dashboardContent.readiness.overall[readiness!.overall]}: </span>
              {reason}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-6 sm:gap-3">
          {primaryControl}
          {secondary.map((action) => (
            <ButtonLink key={action.kind} href={action.href} variant="secondary" className="grow sm:grow-0">
              {action.kind === "plan" ? copy.secondary.plan : copy.secondary.songList}
            </ButtonLink>
          ))}
          {listen}
        </div>
        {!service.packetHref && hasSongs && (service.sheetMusicChecked || service.packetTypes.length > 0) ? (
          <div className="mt-4 max-w-md">
            <NoServiceSheetMusic types={service.packetTypes} own={service.sheetMusicChecked} />
          </div>
        ) : null}
      </div>

      <Disclosure
        className="border-t border-line px-5 sm:px-7"
        showLabel={hasSongs ? copy.details.show : copy.details.showSongs}
        hideLabel={copy.details.hide}
        summary={hasSongs ? `${plural(copy.songs, chosen.length)}${preview ? ` · ${preview}` : ""}` : copy.notPosted}
      >
        <div className={cn("grid gap-6 pb-6 pt-1", readiness && "md:grid-cols-[minmax(0,1fr)_15rem]")}>
          <ServiceSongs service={service} leaders={leaders} className="border-y border-line" />
          {readiness ? (
            <div className="min-w-0">
              <h3 className="font-sans text-sm font-medium tracking-normal text-ink">{copy.readinessHeading}</h3>
              <ReadinessSignals readiness={readiness} className="mt-3" />
              <p className="mt-4 text-xs leading-relaxed text-muted">{copy.readinessNote}</p>
            </div>
          ) : null}
          {mine.length > 0 ? (
            <ReportLink entry="problem" category="leader_assignment" refs={{ service: service.id, leading: 1 }} className="-mt-3 self-start">
              {supportContent.report.assignment}
            </ReportLink>
          ) : null}
        </div>
      </Disclosure>
    </section>
  );
}
