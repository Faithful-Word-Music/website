import type { Metadata } from "next";

import { NoAccess, Notice } from "@/components/account/Notices";
import { AvailabilityCalendar } from "@/components/availability/AvailabilityCalendar";
import { AvailabilityControls } from "@/components/availability/Controls";
import { NormalServicesForm } from "@/components/availability/NormalServicesForm";
import { RangeButton } from "@/components/availability/RangeDialog";
import type { Subject } from "@/components/availability/ServiceDialog";
import { UpcomingChanges } from "@/components/availability/UpcomingChanges";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { availabilityContent } from "@/content/availability";
import { requireViewer } from "@/lib/auth/session";
import { LEADER_PERMISSION, PARTICIPANT_PERMISSION } from "@/lib/availability/access";
import { loadAvailabilityPage } from "@/lib/availability/load";

export const metadata: Metadata = {
  title: availabilityContent.title,
  robots: { index: false, follow: false },
};

/**
 * /availability - the music ministry's shared availability board.
 *
 * Normal services count every week on their own; this page shows the
 * services, who differs from normal, and lets each participant mark a whole
 * service (or a date range) Available, Unavailable or back to Normal.
 * Leaders (manage_availability) can do the same for anyone on the board.
 *
 * Everything shown is worked out in src/lib/availability/ - this page only
 * lays it out. Every change goes through the server actions beside it,
 * which check again who may change what.
 *
 *   ?month=2026-10      the month shown (this month by default)
 *   ?view=me            only the subject's own changes (Everyone by default)
 *   ?person=<user id>   a leader managing someone else
 */
export default async function AvailabilityPage(props: PageProps<"/availability">) {
  const viewer = await requireViewer("/availability");
  if (!viewer.can(PARTICIPANT_PERMISSION)) {
    return (
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <NoAccess />
      </Container>
    );
  }

  const params = await props.searchParams;
  const param = (name: string) => (typeof params[name] === "string" ? params[name] : null);
  const data = await loadAvailabilityPage(viewer, {
    month: param("month"),
    view: param("view"),
    person: param("person"),
  });

  const copy = availabilityContent;
  const subject: Subject | null = data.subject
    ? { id: data.subject.id, name: data.subject.name, isSelf: data.subject.id === viewer.userId }
    : null;
  const isLeader = viewer.can(LEADER_PERMISSION);

  return (
    <PageTransition>
      <Container size="wide" className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow={copy.eyebrow} title={copy.title}>
          <p className="text-base">{copy.lead}</p>
        </SectionHeading>

        {!subject ? <Notice className="mt-8">{copy.notOnBoard}</Notice> : null}
        {subject && !subject.isSelf ? (
          <Notice tone="success" className="mt-8">
            {copy.managing.banner.replace("{name}", subject.name)}
          </Notice>
        ) : null}

        <div className="mt-10">
          <AvailabilityControls
            month={data.month}
            thisMonth={data.thisMonth}
            view={data.view}
            person={data.managed?.id ?? null}
            meLabel={subject && !subject.isSelf ? subject.name : copy.views.me}
            people={isLeader ? data.roster.filter((person) => person.id !== viewer.userId) : []}
            selfOnBoard={Boolean(data.self)}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <AvailabilityCalendar
              month={data.month}
              services={data.services}
              today={data.today}
              view={data.view}
              subject={subject}
            />
          </div>

          <aside className="space-y-6">
            {subject ? <RangeButton occurrences={data.upcoming} today={data.today} now={data.now} subject={subject} /> : null}
            {subject && data.subject ? (
              <NormalServicesForm key={subject.id} subject={subject} initial={data.subject.normal} />
            ) : null}
            {data.view === "me" && subject ? (
              <UpcomingChanges
                title={subject.isSelf ? copy.upcoming.titleMine : copy.upcoming.titleOther.replace("{name}", subject.name)}
                empty={copy.upcoming.noneMine}
                changes={data.subjectChanges}
                removableFor={subject.id}
                showNames={false}
                managedId={subject.isSelf ? null : subject.id}
              />
            ) : (
              <UpcomingChanges
                title={copy.upcoming.titleEveryone}
                empty={copy.upcoming.noneEveryone}
                changes={data.everyoneChanges}
                removableFor={subject?.id ?? null}
                showNames
                managedId={subject && !subject.isSelf ? subject.id : null}
              />
            )}
          </aside>
        </div>
      </Container>
    </PageTransition>
  );
}
