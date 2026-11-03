import Link from "next/link";

import { ReadinessBadge } from "@/components/dashboard/Readiness";
import { ReportLink } from "@/components/support/ReportLink";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/Panel";
import { dashboardContent } from "@/content/dashboard";
import { siteConfig } from "@/config/site";
import { supportContent } from "@/content/support";
import type { LaterRow } from "@/lib/dashboard/workspace";
import { positionsLabel } from "@/lib/leadership/model";
import { serviceDate } from "@/lib/service-planner/format";
import { formatChurchTime, formatCountdown } from "@/lib/service-time";

const copy = dashboardContent.later;

const linkClass =
  "inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-xs font-medium text-ink transition-colors hover:border-gold";

/**
 * The services after the next one, and the viewer's own song leading further
 * ahead: one compact row each - when, whether it is ready (for a planner),
 * what is theirs in it, and one way in. Never the songs of every service:
 * the song list has those.
 */
export function LaterServices({ rows, now, className }: { rows: LaterRow[]; now: number; className?: string }) {
  if (rows.length === 0) return null;
  return (
    <Panel
      title={copy.title}
      description={copy.lead}
      bare
      className={className}
      footer={
        <Link href="/song-list" className="group inline-flex min-h-9 items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
          {copy.fullList}
          <Icon name="arrow-right" size={13} strokeWidth={1.6} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
      }
    >
      <ol className="divide-y divide-line border-t border-line">
        {rows.map((row) => (
          <li key={row.anchor} className="px-5 py-3.5">
            <LaterItem row={row} now={now} />
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function LaterItem({ row, now }: { row: LaterRow; now: number }) {
  const songs = row.leading?.songs?.length
    ? row.leading.songs.map((song) => [song.number, song.title].filter(Boolean).join(" ") + (song.key ? ` (${song.key})` : "")).join(" · ")
    : null;
  return (
    <div className="flex gap-3.5">
      <DateTile startsAt={row.startsAt} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 text-[0.95rem] font-medium leading-snug text-ink">{row.title}</p>
          {row.readiness ? <ReadinessBadge readiness={row.readiness} /> : null}
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {formatChurchTime(row.startsAt)} · {formatCountdown(row.startsAt, now)}
          {!row.published ? ` · ${copy.notPosted}` : null}
        </p>
        {row.leading ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="gold">{copy.youLead.replace("{songs}", positionsLabel(row.leading.positions))}</Badge>
            {row.leading.unavailable ? (
              <Badge tone="warning" icon={<Icon name="alert" size={12} strokeWidth={1.6} />}>
                {dashboardContent.leading.unavailable}
              </Badge>
            ) : null}
          </div>
        ) : null}
        {songs ? <p className="mt-1.5 truncate text-xs text-muted">{songs}</p> : null}
        <div className="mt-2.5 flex flex-wrap items-center gap-2 empty:hidden">
          {row.packetHref ? (
            <a href={row.packetHref} target="_blank" rel="noopener" className={linkClass}>
              <Icon name="file" size={13} />
              {copy.sheetMusic}
              <span className="sr-only"> {dashboardContent.comingUp.packet.newTab}</span>
            </a>
          ) : null}
          {row.planHref ? (
            <Link href={row.planHref} className={linkClass}>
              <Icon name="edit" size={13} />
              {copy.plan}
            </Link>
          ) : null}
          {row.published && !row.packetHref ? (
            <Link href={`/song-list#${row.anchor}`} className={cn(linkClass)}>
              {copy.view}
              <span className="sr-only"> {row.title}, {serviceDate(row.startsAt)}</span>
            </Link>
          ) : null}
          {row.leading ? (
            <ReportLink entry="problem" category="leader_assignment" refs={{ service: row.anchor, leading: 1 }} className="ml-auto">
              {supportContent.report.assignment}
            </ReportLink>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** "Nov / 8 / Sun": the day, set like a calendar leaf. */
function DateTile({ startsAt }: { startsAt: string }) {
  const [weekday, month, day] = serviceParts(startsAt);
  return (
    <span aria-hidden="true" className="flex w-11 shrink-0 flex-col items-center rounded-control border border-line bg-paper py-1.5 leading-none">
      <span className="text-[0.65rem] font-medium text-muted">{month}</span>
      <span className="tnum mt-1 font-display text-xl text-ink">{day}</span>
      <span className="mt-1 text-[0.65rem] text-muted">{weekday}</span>
    </span>
  );
}

const parts = new Intl.DateTimeFormat("en-US", { timeZone: siteConfig.songList.timeZone, weekday: "short", month: "short", day: "numeric" });

function serviceParts(startsAt: string): [string, string, string] {
  const found = Object.fromEntries(parts.formatToParts(new Date(startsAt)).map((part) => [part.type, part.value]));
  return [found.weekday ?? "", found.month ?? "", found.day ?? ""];
}
