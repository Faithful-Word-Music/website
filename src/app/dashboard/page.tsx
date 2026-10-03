import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";

import { InstallAppCard } from "@/components/account/InstallApp";
import { AttentionList } from "@/components/dashboard/AttentionList";
import { AvailabilitySummary } from "@/components/dashboard/AvailabilitySummary";
import { ComingUp } from "@/components/dashboard/ComingUp";
import { DashboardGrid } from "@/components/dashboard/DashboardSection";
import { BrushUp, NewSheetMusic, QuarterGlance, SheetGaps } from "@/components/dashboard/MusicSections";
import { PeopleOverview } from "@/components/dashboard/PeopleOverview";
import { ServicePacketsSeed, type Packets } from "@/components/song-list/ServicePackets";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { dashboardContent } from "@/content/dashboard";
import { activateOwnRequests } from "@/lib/auth/activation";
import { summarize } from "@/lib/auth/clerk";
import { missingProfileItems } from "@/lib/auth/profile-completeness";
import { requireViewer } from "@/lib/auth/session";
import {
  countRequestsByStatus,
  getProfile,
  getSheetMusicTypes,
  getUserInstruments,
  getUserTitles,
} from "@/lib/auth/store";
import { collectAttention } from "@/lib/dashboard/attention";
import { buildComingUp, servicePackets } from "@/lib/dashboard/coming-up";
import { buildFocus, servesInMusic } from "@/lib/dashboard/focus";
import { loadAvailabilitySummary, loadInvitationFollowUps, loadMusicData, loadPeople } from "@/lib/dashboard/load";
import { loadPlannerWork } from "@/lib/service-planner/load";
import { newSheetMusic } from "@/lib/dashboard/new-sheet-music";
import { groupPeople, musiciansWithoutInstruments } from "@/lib/dashboard/people";
import {
  accountRequestAttention,
  availabilityAttention,
  instrumentAttention,
  invitationAttention,
  profileAttention,
  servicePlannerAttention,
  sheetGapAttention,
  sheetTypeAttention,
} from "@/lib/dashboard/providers";
import { brushUpSongs, quarterGlance } from "@/lib/dashboard/repertoire";
import { findSheetGaps } from "@/lib/dashboard/sheet-gaps";
import { canAccessFile, MEMBER_VIEWER, PUBLIC_VIEWER } from "@/lib/sheet-music-access";
import { buildSongRecords } from "@/lib/song-history";
import { songKey } from "@/lib/song-list";

export const metadata: Metadata = {
  title: dashboardContent.eyebrow,
  robots: { index: false, follow: false },
};

/**
 * /dashboard - the signed-in home: what this person needs to know and do.
 *
 * One page for everyone, shaped by who they are (src/lib/dashboard/focus.ts):
 * permissions decide what may be shown and linked, roles and titles decide
 * what is most relevant, and current data decides what appears at all. A
 * section with nothing real to say is left out - there are no empty cards,
 * zero counts or placeholders for features still to come.
 *
 *   everyone                 Coming up, New sheet music
 *   view_availability        Availability (always, even when nothing is
 *                            unusual), and "Set your normal services"
 *   assigned sheet types     each service's sheet music as one PDF, and under
 *                            each song the type it uses (their first choice
 *                            it has), their others it has, or "none yet"
 *   plays or leads singing   Songs to brush up on
 *   manage_service_plans     the next service to plan, and how many need planning
 *                            soon (links into the Service Planner)
 *   manage_sheet_music       Sheet music to finish, musicians with no sheet type
 *   view_analytics           the quarter at a glance
 *   manage_users             account requests, invitations to follow up
 *   view_profiles            musicians without instruments
 *   the People permissions   People (musicians, song leaders, members only)
 *
 * On a device that can install the site as an app, a dismissible "Install
 * Faithful Word Music" card sits under the greeting (src/lib/install.ts).
 *
 * Adding a feature here: load its data (failing soft, see load.ts), add an
 * attention provider if it can need action, and render its section only when
 * the focus and data call for it.
 */
export default async function DashboardPage() {
  const viewer = await requireViewer("/dashboard");
  const user = await currentUser();
  if (!user) return null;
  const person = summarize(user);

  // The first visit after accepting an invitation closes the request that led to it.
  await activateOwnRequests(viewer, person.emails);

  const [profile, instruments, titles, sheetTypes] = await Promise.all([
    getProfile(viewer.env, viewer.userId),
    getUserInstruments(viewer.env, viewer.userId),
    getUserTitles(viewer.env, viewer.userId),
    getSheetMusicTypes(viewer.env, viewer.userId),
  ]);
  const focus = buildFocus({ roleKeys: viewer.roleKeys, permissions: viewer.permissions, titles, instruments });

  const [music, requests, people, invitations, availability, plannerWork] = await Promise.all([
    loadMusicData(),
    focus.reviewsAccounts ? countRequestsByStatus(viewer.env).catch(() => null) : null,
    focus.seesPeople ? loadPeople(viewer) : null,
    focus.reviewsAccounts ? loadInvitationFollowUps() : null,
    focus.tracksAvailability ? loadAvailabilitySummary(viewer) : null,
    focus.plansServices ? loadPlannerWork(viewer) : null,
  ]);
  const now = music.loadedAt;
  const { hymnalCollection } = siteConfig.sheetMusic;

  // --- What the data says, for this person ----------------------------------
  const comingUp = music.services
    ? buildComingUp(music.services, now, focus, { index: music.index, sheetTypes })
    : [];
  const brushUp = servesInMusic(focus) ? brushUpSongs(music.past, music.upcoming, now) : [];
  const gaps = focus.managesSheetMusic && music.index ? findSheetGaps(music.upcoming, music.index, hymnalCollection) : null;
  const glance = focus.seesAnalytics ? quarterGlance(music.past, now) : null;

  const viewerKind = focus.opensMemberSheetMusic ? MEMBER_VIEWER : PUBLIC_VIEWER;
  // The song list's sheet music buttons, worked out here anyway - handed to
  // it so it opens complete (src/lib/service-packets.ts).
  const packetSeed: Packets | null =
    sheetTypes.length === 0
      ? { assigned: false }
      : music.services && music.index
        ? { assigned: true, packets: servicePackets(music.services, { index: music.index, sheetTypes, viewer: viewerKind }) }
        : null;
  const upcomingKeys = new Set(music.upcoming.flatMap((service) => service.songs.map((song) => songKey(song.title))));
  const recentSheets = music.index
    ? newSheetMusic(
        [...music.upcoming.flatMap((service) => service.songs), ...buildSongRecords(music.past)],
        upcomingKeys,
        music.index,
        hymnalCollection,
        (song, file) => canAccessFile(song, file, viewerKind),
        now,
      )
    : [];

  const groups = people ? groupPeople(people.people) : null;
  const withoutInstruments =
    people && groups ? musiciansWithoutInstruments(groups.musicians, people.instrumentCounts) : null;
  const withoutSheetMusic = groups ? groups.musicians.filter((musician) => !musician.sheetMusic) : null;

  const attention = collectAttention(
    servicePlannerAttention(focus, plannerWork, now),
    accountRequestAttention(focus, requests?.pending ?? null),
    invitationAttention(focus, invitations),
    sheetGapAttention(focus, gaps),
    sheetTypeAttention(focus, withoutSheetMusic),
    instrumentAttention(focus, withoutInstruments),
    availabilityAttention(focus, availability?.self?.normal ?? null),
    profileAttention(
      missingProfileItems({
        roleKeys: viewer.roleKeys,
        hasName: Boolean(person.firstName && person.lastName),
        hasImage: person.hasImage,
        instrumentCount: instruments.length,
        learningStyle: profile.learningStyle,
        theoryLevel: profile.theoryLevel,
        readsSheetMusic: profile.readsSheetMusic,
      }),
    ),
  );

  const recordsBegan = music.past.reduce<string | null>(
    (earliest, service) => (earliest === null || service.startsAt < earliest ? service.startsAt : earliest),
    null,
  );
  const name = profile.preferredName || person.firstName;
  const copy = dashboardContent;
  const hasSideSections = brushUp.length > 0 || recentSheets.length > 0 || (gaps?.length ?? 0) > 0;

  return (
    <PageTransition>
      <Container size="wide" className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading
          as="h1"
          eyebrow={copy.eyebrow}
          title={name ? copy.greeting.replace("{name}", name) : copy.greetingFallback}
        >
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-base">
            {focus.titles.length > 0 ? <span className="text-ink-soft">{focus.titles.join(" · ")}</span> : null}
            <Link
              href="/profile"
              className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-gold"
            >
              {copy.profileLink}
            </Link>
          </p>
        </SectionHeading>

        {/*
          The order is fixed by how soon something matters, the same for
          everyone (sections they don't get are simply absent):
            1. Needs your attention   - things to do
            2. Coming up              - this week's services
            3. Availability           - always, for those it applies to
            4. Getting ready          - work first: sheet music to finish,
                                        then new sheet music, then brush up
            5. People, the quarter    - the wider picture
        */}
        {/* Shown by the browser only where installing is possible, until dismissed. */}
        <InstallAppCard className="mt-10" />

        {attention.length > 0 ? <AttentionList items={attention} className="mt-10" /> : null}

        <ComingUp services={comingUp} unavailable={!music.services} now={now} className="mt-10" />
        {packetSeed ? <ServicePacketsSeed userId={viewer.userId} packets={packetSeed} /> : null}

        {focus.tracksAvailability ? <AvailabilitySummary summary={availability} now={now} className="mt-14" /> : null}

        {hasSideSections ? (
          // Its own heading, so it reads as a section of its own rather than
          // more of Coming up. The same grid as Coming up, so these cards
          // line up under its service cards; each shows five rows and keeps
          // the rest inside.
          <section aria-labelledby="dashboard-getting-ready" className="mt-14">
            <h2 id="dashboard-getting-ready" className="font-display text-2xl text-ink">
              {copy.gettingReady.title}
            </h2>
            <DashboardGrid className="mt-4">
              {gaps && gaps.length > 0 ? <SheetGaps songs={gaps} /> : null}
              {recentSheets.length > 0 ? <NewSheetMusic songs={recentSheets} now={now} /> : null}
              {brushUp.length > 0 ? <BrushUp songs={brushUp} recordsBegan={recordsBegan} /> : null}
            </DashboardGrid>
          </section>
        ) : null}

        {focus.managesSheetMusic && !music.index ? (
          <p className="mt-10 text-sm text-muted">{copy.sheetGaps.unavailable}</p>
        ) : null}

        {groups ? (
          <PeopleOverview groups={groups} showSheetMusic={focus.managesSheetMusic} className="mt-12" />
        ) : null}
        {focus.seesPeople && !people ? <p className="mt-10 text-sm text-muted">{copy.people.unavailable}</p> : null}

        {glance ? <QuarterGlance glance={glance} className="mt-12" /> : null}
      </Container>
    </PageTransition>
  );
}
