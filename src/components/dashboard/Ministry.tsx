import Link from "next/link";
import type { ReactNode } from "react";

import { ListRow } from "@/components/dashboard/DashboardSection";
import { ListDialogButton } from "@/components/dashboard/ExpandableList";
import { MusicList, sheetGapRows } from "@/components/dashboard/MusicSections";
import { cn } from "@/components/ui/cn";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { availabilityContent } from "@/content/availability";
import { dashboardContent } from "@/content/dashboard";
import { availabilityHref, serviceShort } from "@/lib/availability/format";
import type { PeopleGroups, Person } from "@/lib/dashboard/people";
import type { SongSheetGaps } from "@/lib/dashboard/sheet-gaps";
import type { TeamServiceRow, ToolLink } from "@/lib/dashboard/workspace";
import { plural } from "@/lib/plural";
import { formatCountdown } from "@/lib/service-time";

const copy = dashboardContent.team;
const people = dashboardContent.people;
const HEADING_ID = "dashboard-ministry";

const TOOL_ICONS: Record<ToolLink["key"], IconName> = {
  planner: "edit",
  availability: "calendar",
  people: "users",
  requests: "user",
  support: "info",
};

/**
 * Ministry: one panel for whoever looks after part of the ministry, holding
 * each part they look after - the team's availability at the next services,
 * who is in each group (names on request, in a dialog), the sheet music still
 * to finish - and the management pages they may open. Short on purpose: the
 * things to act on are in For you, and the work itself is done on those pages.
 */
export function Ministry({
  availability,
  availabilityFailed,
  groups,
  peopleFailed,
  showSheetMusic,
  gaps,
  gapsFailed,
  tools,
  now,
  className,
}: {
  availability: { rows: TeamServiceRow[]; size: number; unset: Array<{ id: string; name: string }> } | null;
  /** The viewer looks after availability but it could not be read. */
  availabilityFailed: boolean;
  groups: PeopleGroups | null;
  peopleFailed: boolean;
  /** Name each musician's sheet music type (manage_sheet_music). */
  showSheetMusic: boolean;
  /** Upcoming songs with sheet music gaps; null when not theirs to see. */
  gaps: SongSheetGaps[] | null;
  /** They look after sheet music but the Index could not be read. */
  gapsFailed: boolean;
  tools: ToolLink[];
  now: number;
  className?: string;
}) {
  const columns = groups
    ? [
        { key: "musicians", title: people.musicians, people: groups.musicians, lead: undefined, sheet: showSheetMusic },
        { key: "song-leaders", title: people.songLeaders, people: groups.songLeaders, lead: undefined, sheet: false },
        { key: "members-only", title: people.membersOnly, people: groups.membersOnly, lead: people.membersOnlyNote, sheet: false },
      ].filter((column) => column.people.length > 0)
    : [];
  const showsAvailability = !!availability || availabilityFailed;
  const showsPeople = columns.length > 0 || peopleFailed;
  const showsGaps = (gaps?.length ?? 0) > 0 || gapsFailed;

  if (!showsAvailability && !showsPeople && !showsGaps && tools.length === 0) return null;

  return (
    <section
      aria-labelledby={HEADING_ID}
      className={cn("flex min-w-0 flex-col rounded-card border border-line bg-surface shadow-card", className)}
    >
      <header className="px-5 pb-3 pt-4">
        <h2 id={HEADING_ID} className="font-display text-xl text-ink">
          {copy.title}
        </h2>
        <p className="mt-1 text-sm text-muted">{copy.lead}</p>
      </header>

      {showsAvailability || showsPeople ? (
        <div
          className={cn(
            "grid border-t border-line",
            showsAvailability && showsPeople && "divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0",
          )}
        >
          {showsAvailability ? (
            <Part title={copy.availability}>
              {availability ? (
                <TeamAvailability availability={availability} now={now} />
              ) : (
                <Notice compact tone="neutral" title={availabilityContent.dashboard.unavailable} className="shadow-none" />
              )}
            </Part>
          ) : null}

          {showsPeople ? (
            <Part id="people" title={copy.peopleTitle}>
              {columns.length > 0 ? (
                <ul className="-my-1 divide-y divide-line">
                  {columns.map((column) => (
                    <li key={column.key}>
                      <ListDialogButton
                        title={column.title}
                        lead={column.lead}
                        rows={column.people.map((person) => (
                          <PersonRow key={person.id} person={person} showSheetMusic={column.sheet} />
                        ))}
                        className="group flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm text-ink transition-colors hover:text-gold-dark"
                      >
                        <span>{column.title}</span>
                        <span className="flex items-center gap-2 text-muted">
                          <span className="tnum">{column.people.length}</span>
                          <Icon name="chevron-right" size={14} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                        </span>
                      </ListDialogButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <Notice compact tone="neutral" title={people.unavailable} className="shadow-none" />
              )}
            </Part>
          ) : null}
        </div>
      ) : null}

      {showsGaps ? (
        <div id="sheet-music-gaps" className="scroll-mt-24 border-t border-line">
          <div className="flex items-baseline justify-between gap-3 px-5 pb-2 pt-4">
            <h3 className="font-sans text-xs font-medium tracking-normal text-muted">
              {dashboardContent.sheetGaps.title}
              {gaps && gaps.length > 0 ? <span className="tnum ml-2 text-ink-soft">{gaps.length}</span> : null}
            </h3>
            <span className="text-xs text-muted">{dashboardContent.sheetGaps.lead}</span>
          </div>
          {gaps && gaps.length > 0 ? (
            <MusicList rows={sheetGapRows(gaps)} title={dashboardContent.sheetGaps.title} lead={dashboardContent.sheetGaps.lead} />
          ) : (
            <div className="px-5 pb-4">
              <Notice compact tone="neutral" title={dashboardContent.sheetGaps.unavailable} className="shadow-none" />
            </div>
          )}
        </div>
      ) : null}

      {tools.length > 0 ? (
        <footer className="mt-auto border-t border-line px-4 py-3">
          <ul className="flex flex-wrap gap-1.5">
            {tools.map((tool) => (
              <li key={tool.key}>
                <Link
                  href={tool.href}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-ink transition-colors hover:border-gold"
                >
                  <Icon name={TOOL_ICONS[tool.key]} size={13} className="text-muted" />
                  {copy.tools[tool.key]}
                </Link>
              </li>
            ))}
          </ul>
        </footer>
      ) : null}
    </section>
  );
}

/** One part of the panel: a small heading, its content. */
function Part({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="min-w-0 scroll-mt-24 px-5 py-4">
      <h3 className="mb-2 font-sans text-xs font-medium tracking-normal text-muted">{title}</h3>
      {children}
    </div>
  );
}

function TeamAvailability({
  availability,
  now,
}: {
  availability: { rows: TeamServiceRow[]; size: number; unset: Array<{ id: string; name: string }> };
  now: number;
}) {
  return (
    <>
      {availability.rows.length === 0 ? (
        <p className="text-sm text-muted">{availabilityContent.dashboard.team.noServices}</p>
      ) : (
        <ul className="space-y-2.5">
          {availability.rows.map((row) => (
            <li key={row.key} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium text-ink">{serviceShort(row)}</span>
                <span className="shrink-0 text-xs text-muted">{formatCountdown(row.startsAt, now)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                <span className="tnum text-ink-soft">
                  {copy.expected.replace("{count}", String(row.expected)).replace("{total}", String(availability.size))}
                </span>
                {" · "}
                {row.away.length > 0 ? (
                  <span className="text-warning">
                    {plural(copy.away, row.away.length)}: {row.away.join(", ")}
                  </span>
                ) : (
                  copy.allThere
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      {availability.unset.length > 0 ? (
        <p className="mt-3 text-xs text-muted">
          {plural(copy.unset, availability.unset.length)}:{" "}
          {availability.unset.map((person, index) => (
            <span key={person.id}>
              {index > 0 ? ", " : ""}
              <Link
                href={availabilityHref({ person: person.id })}
                aria-label={availabilityContent.dashboard.team.manage.replace("{name}", person.name)}
                className="text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-gold"
              >
                {person.name}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </>
  );
}

function PersonRow({ person, showSheetMusic }: { person: Person; showSheetMusic: boolean }) {
  const detail = showSheetMusic ? (person.sheetMusic ?? people.noSheetMusic) : (person.title ?? people.noTitle);
  return (
    <ListRow
      main={
        <Link href={`/admin/users/${person.id}`} className="text-[0.95rem] text-ink transition-colors hover:text-gold-dark">
          {person.name}
        </Link>
      }
      detail={
        <span className={cn(showSheetMusic && !person.sheetMusic && "text-gold-dark")}>
          {showSheetMusic ? `${people.sheetMusicLabel}: ${detail}` : detail}
        </span>
      }
    />
  );
}
