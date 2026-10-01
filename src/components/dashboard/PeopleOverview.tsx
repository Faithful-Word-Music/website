import Link from "next/link";

import { DashboardGrid, ListCard, ListRow } from "@/components/dashboard/DashboardSection";
import { cn } from "@/components/ui/cn";
import { dashboardContent } from "@/content/dashboard";
import type { PeopleGroups, Person } from "@/lib/dashboard/people";

const copy = dashboardContent.people;

/**
 * The ministry's people at a glance, for those who may open the admin People
 * pages: musicians, song leaders (when there are any) and people with no role
 * beyond Member. Each name opens their page in the admin area.
 */
export function PeopleOverview({
  groups,
  showSheetMusic = false,
  className,
}: {
  groups: PeopleGroups;
  /** For whoever chooses sheet music: each musician's assigned type, in place of their title. */
  showSheetMusic?: boolean;
  className?: string;
}) {
  const columns = [
    { key: "musicians", title: copy.musicians, people: groups.musicians, lead: undefined, sheet: showSheetMusic },
    { key: "song-leaders", title: copy.songLeaders, people: groups.songLeaders, lead: undefined, sheet: false },
    { key: "members-only", title: copy.membersOnly, people: groups.membersOnly, lead: copy.membersOnlyNote, sheet: false },
  ].filter((column) => column.people.length > 0);

  if (columns.length === 0) return null;

  return (
    <section id="people" aria-labelledby="people-heading" className={cn("scroll-mt-24", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="people-heading" className="font-display text-2xl text-ink">
          {copy.title}
        </h2>
        <Link href="/admin/users" className="group inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
          {copy.all}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      </div>
      <DashboardGrid className="mt-4">
        {columns.map((column) => (
          <ListCard
            key={column.key}
            id={`people-${column.key}`}
            title={column.title}
            lead={column.lead}
            aside={<span className="tnum text-sm text-muted">{column.people.length}</span>}
            rows={column.people.map((person) => (
              <PersonRow key={person.id} person={person} showSheetMusic={column.sheet} />
            ))}
          />
        ))}
      </DashboardGrid>
    </section>
  );
}

function PersonRow({ person, showSheetMusic }: { person: Person; showSheetMusic: boolean }) {
  const detail = showSheetMusic ? (person.sheetMusic ?? copy.noSheetMusic) : (person.title ?? copy.noTitle);
  return (
    <ListRow
      main={
        <Link
          href={`/admin/users/${person.id}`}
          className="text-[0.95rem] text-ink transition-colors hover:text-gold-dark"
        >
          {person.name}
        </Link>
      }
      detail={
        <span className={cn(showSheetMusic && !person.sheetMusic && "text-gold-dark")}>
          {showSheetMusic ? `${copy.sheetMusicLabel}: ${detail}` : detail}
        </span>
      }
    />
  );
}
