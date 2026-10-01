import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";

import { AttentionList } from "@/components/dashboard/AttentionList";
import { ComingUp } from "@/components/dashboard/ComingUp";
import { DashboardGrid } from "@/components/dashboard/DashboardSection";
import { BrushUp, NewSheetMusic, QuarterGlance, SheetGaps } from "@/components/dashboard/MusicSections";
import { PeopleOverview } from "@/components/dashboard/PeopleOverview";
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
  getSheetMusicType,
  getUserInstruments,
  getUserTitles,
} from "@/lib/auth/store";
import { collectAttention } from "@/lib/dashboard/attention";
import { buildComingUp } from "@/lib/dashboard/coming-up";
import { buildFocus, servesInMusic } from "@/lib/dashboard/focus";
import { loadInvitationFollowUps, loadMusicData, loadPeople } from "@/lib/dashboard/load";
import { newSheetMusic } from "@/lib/dashboard/new-sheet-music";
import { groupPeople, musiciansWithoutInstruments } from "@/lib/dashboard/people";
import {
  accountRequestAttention,
  instrumentAttention,
  invitationAttention,
  profileAttention,
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
 *   an assigned sheet type   a "Sheet Music" link under each song that has it
 *   plays or leads singing   Songs to brush up on
 *   manage_sheet_music       Sheet music to finish, musicians with no sheet type
 *   view_analytics           the quarter at a glance
 *   manage_users             account requests, invitations to follow up
 *   view_profiles            musicians without instruments
 *   the People permissions   People (musicians, song leaders, members only)
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

  const [profile, instruments, titles, sheetType] = await Promise.all([
    getProfile(viewer.env, viewer.userId),
    getUserInstruments(viewer.env, viewer.userId),
    getUserTitles(viewer.env, viewer.userId),
    getSheetMusicType(viewer.env, viewer.userId),
  ]);
  const focus = buildFocus({ roleKeys: viewer.roleKeys, permissions: viewer.permissions, titles, instruments });

  const [music, requests, people, invitations] = await Promise.all([
    loadMusicData(),
    focus.reviewsAccounts ? countRequestsByStatus(viewer.env).catch(() => null) : null,
    focus.seesPeople ? loadPeople(viewer) : null,
    focus.reviewsAccounts ? loadInvitationFollowUps() : null,
  ]);
  const now = music.loadedAt;
  const { hymnalCollection } = siteConfig.sheetMusic;

  // --- What the data says, for this person ----------------------------------
  const comingUp = music.services
    ? buildComingUp(music.services, now, focus, { index: music.index, sheetType })
    : [];
  const brushUp = servesInMusic(focus) ? brushUpSongs(music.past, music.upcoming, now) : [];
  const gaps = focus.managesSheetMusic && music.index ? findSheetGaps(music.upcoming, music.index, hymnalCollection) : null;
  const glance = focus.seesAnalytics ? quarterGlance(music.past, now) : null;

  const viewerKind = focus.opensMemberSheetMusic ? MEMBER_VIEWER : PUBLIC_VIEWER;
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
    accountRequestAttention(focus, requests?.pending ?? null),
    invitationAttention(focus, invitations),
    sheetGapAttention(focus, gaps),
    sheetTypeAttention(focus, withoutSheetMusic),
    instrumentAttention(focus, withoutInstruments),
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
            3. Brush up / to finish   - preparing for those services
            4. New sheet music        - what changed
            5. People, the quarter    - the wider picture
        */}
        {attention.length > 0 ? <AttentionList items={attention} className="mt-10" /> : null}

        <ComingUp services={comingUp} unavailable={!music.services} now={now} className="mt-10" />

        {hasSideSections ? (
          // The same grid as Coming up, so these cards line up under its
          // service cards; each shows five rows and keeps the rest inside.
          <DashboardGrid className="mt-12">
            {brushUp.length > 0 ? <BrushUp songs={brushUp} recordsBegan={recordsBegan} /> : null}
            {gaps && gaps.length > 0 ? <SheetGaps songs={gaps} /> : null}
            {recentSheets.length > 0 ? <NewSheetMusic songs={recentSheets} now={now} /> : null}
          </DashboardGrid>
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
