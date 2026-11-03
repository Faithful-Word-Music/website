import { songIdentity } from "@/lib/song-identity";
import type { Metadata } from "next";
import Link from "next/link";

import { InstallAppCard } from "@/components/account/InstallApp";
import { ProfileStatusNotice } from "@/components/account/profile/ProfileStatusNotice";
import { PushCard } from "@/components/notifications/PushDevice";
import { AvailabilitySummary } from "@/components/dashboard/AvailabilitySummary";
import { ForYou } from "@/components/dashboard/ForYou";
import { LaterServices } from "@/components/dashboard/LaterServices";
import { Ministry } from "@/components/dashboard/Ministry";
import { QuarterGlance } from "@/components/dashboard/MusicSections";
import { NextServiceHero } from "@/components/dashboard/NextServiceHero";
import { HeroListen, Preparation } from "@/components/dashboard/Preparation";
import { ServicePacketsSeed, type Packets } from "@/components/song-list/ServicePackets";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { RehearsalMark } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { dashboardContent } from "@/content/dashboard";
import { requireViewer } from "@/lib/auth/session";
import { collectAttention } from "@/lib/dashboard/attention";
import { buildComingUp, servicePackets, servicePacketTypes } from "@/lib/dashboard/coming-up";
import { buildFocus, servesInMusic } from "@/lib/dashboard/focus";
import { leadershipAttention, myLeadingAttention } from "@/lib/dashboard/leadership";
import { loadDashboard } from "@/lib/dashboard/data";
import { newSheetMusic } from "@/lib/dashboard/new-sheet-music";
import { groupPeople, musiciansWithoutInstruments } from "@/lib/dashboard/people";
import {
  accountRequestAttention,
  availabilityAttention,
  instrumentAttention,
  invitationAttention,
  servicePlannerAttention,
  sheetGapAttention,
  sheetTypeAttention,
  supportAttention,
} from "@/lib/dashboard/providers";
import { brushUpSongs, quarterGlance } from "@/lib/dashboard/repertoire";
import { timed } from "@/lib/dashboard/timing";
import { findSheetGaps } from "@/lib/dashboard/sheet-gaps";
import {
  buildHero,
  buildLater,
  heroCoveredIds,
  splitForYou,
  teamAvailabilityRows,
  teamTools,
  type WorkspaceInput,
} from "@/lib/dashboard/workspace";
import { canAccessFile, MEMBER_VIEWER, PUBLIC_VIEWER } from "@/lib/sheet-music-access";
import { buildSongRecords } from "@/lib/song-history";

export const metadata: Metadata = {
  title: dashboardContent.eyebrow,
  robots: { index: false, follow: false },
};

/**
 * /dashboard - the signed-in home: what's coming up, what needs this person,
 * and what they can do next.
 *
 * One page for everyone, shaped by who they are (src/lib/dashboard/focus.ts):
 * permissions decide what may be shown and linked, roles and titles decide
 * what is most relevant, and current data decides what appears at all. An
 * area with nothing real to say is left out - no empty cards or zero counts.
 *
 *   Next service   everyone: the hero, with one main action (workspace.ts)
 *   For you        everyone: attention items (providers.ts), five at a time
 *   Preparation    playlists to listen ahead; brush up (people who play or
 *                  lead), new sheet music (files they may open)
 *   Later          the week's other services and their own song leading
 *   Your availability   view_availability
 *   Ministry       whoever looks after availability, people or sheet music
 *   This device    install and push prompts, where they apply
 *   Quarter        view_analytics
 *
 * Every read happens in one wave (data.ts); the playlists alone are not
 * waited for - their links stream in. Adding a feature: load its data
 * (failing soft), add an attention provider if it can need action, and
 * render it in the area it belongs to only when the data calls for it.
 */
export default async function DashboardPage() {
  const viewer = await timed("requireViewer", () => requireViewer("/dashboard"));
  // Every read at once, each failing soft (src/lib/dashboard/data.ts).
  const {
    person,
    profile,
    instruments,
    titles,
    sheetTypes,
    profileStatus,
    music,
    capoRules,
    requests,
    people,
    invitations,
    availability,
    plannerWork,
    leading,
    support,
    preparation,
  } = await timed("loadDashboard", () => loadDashboard(viewer));
  const focus = buildFocus({ roleKeys: viewer.roleKeys, permissions: viewer.permissions, titles, instruments });
  const now = music.loadedAt;
  const { hymnalCollection } = siteConfig.sheetMusic;

  // --- What the data says, for this person ----------------------------------
  const comingUp = music.services
    ? buildComingUp(music.services, now, focus, { index: music.index, sheetTypes, anyType: focus.managesSheetMusic })
    : [];
  const brushUp = servesInMusic(focus) ? brushUpSongs(music.past, music.upcoming, now) : [];
  const gaps = focus.managesSheetMusic && music.index ? findSheetGaps(music.upcoming, music.index, hymnalCollection, capoRules) : null;
  const glance = focus.seesAnalytics ? quarterGlance(music.past, now) : null;

  const viewerKind = focus.opensMemberSheetMusic ? MEMBER_VIEWER : PUBLIC_VIEWER;
  // The song list's sheet music buttons, worked out here anyway - handed to
  // it so it opens complete (src/lib/service-packets.ts).
  // Someone who looks after the sheet music can print a service in any type.
  const packetTypes =
    focus.managesSheetMusic && music.services && music.index
      ? { types: servicePacketTypes(music.services, { index: music.index, viewer: viewerKind }) }
      : {};
  const packetSeed: Packets | null =
    sheetTypes.length === 0
      ? // Without the types' answer, leave what the song list has: it asks for itself.
        focus.managesSheetMusic && !("types" in packetTypes)
        ? null
        : { assigned: false, ...packetTypes }
      : music.services && music.index
        ? {
            assigned: true,
            packets: servicePackets(music.services, { index: music.index, sheetTypes, viewer: viewerKind }),
            ...packetTypes,
          }
        : null;
  const upcomingKeys = new Set(music.upcoming.flatMap((service) => service.songs.map((song) => songIdentity(song))));
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

  // --- The workspace (src/lib/dashboard/workspace.ts) ---------------------------
  const workspace: WorkspaceInput = { comingUp, now, focus, plannerWork, leading };
  const hero = buildHero(workspace);
  const later = buildLater(workspace);

  const attention = collectAttention(
    servicePlannerAttention(focus, plannerWork, now),
    leadershipAttention(focus, leading?.problems ?? null, now),
    myLeadingAttention(leading?.mine ?? null, now),
    supportAttention(support, viewer.can("manage_support_requests")),
    accountRequestAttention(focus, requests?.pending ?? null),
    invitationAttention(focus, invitations),
    sheetGapAttention(focus, gaps),
    sheetTypeAttention(focus, withoutSheetMusic),
    instrumentAttention(focus, withoutInstruments),
    // Normal services that are a profile requirement show in the profile notice instead, once.
    profileStatus.missing.some((item) => item.key === "availability_reviewed")
      ? []
      : availabilityAttention(focus, availability?.self?.normal ?? null, availability?.self?.reviewed),
  );
  // An empty list is an all-clear only when every source this person's items come from was read.
  const followsLeaders = focus.plansServices || viewer.can("lead_songs") || viewer.can("view_service_plans");
  const sendsSupport = viewer.can("manage_support_requests") || viewer.can("submit_support_requests");
  const attentionComplete = ![
    focus.plansServices && plannerWork === null,
    followsLeaders && leading === null,
    sendsSupport && support === null,
    focus.reviewsAccounts && (requests === null || invitations === null),
    focus.seesPeople && people === null,
    focus.tracksAvailability && availability === null,
    focus.managesSheetMusic && music.index === null,
  ].some(Boolean);
  const forYou = splitForYou(attention, { covered: heroCoveredIds(hero, plannerWork), complete: attentionComplete });

  // --- Ministry: only for whoever looks after part of it ----------------------------
  const teamAvailability = focus.managesAvailability ? teamAvailabilityRows(availability?.team) : null;
  const tools = teamTools(focus, viewer.can("manage_support_requests"));
  const showsMinistry = focus.managesAvailability || focus.seesPeople || focus.managesSheetMusic || tools.length > 0;

  const recordsBegan = music.past.reduce<string | null>(
    (earliest, service) => (earliest === null || service.startsAt < earliest ? service.startsAt : earliest),
    null,
  );
  const name = profile?.preferredName || person?.firstName;
  const copy = dashboardContent;

  return (
    <PageTransition>
      <Container size="wide" className="pb-16 pt-8 sm:pb-20 sm:pt-12">
        <header className="flex flex-col gap-1">
          <RehearsalMark>{copy.eyebrow}</RehearsalMark>
          <h1 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl">
            {name ? copy.greeting.replace("{name}", name) : copy.greetingFallback}
          </h1>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            {focus.titles.length > 0 ? <span className="text-ink-soft">{focus.titles.join(" · ")}</span> : null}
            <Link
              href="/profile"
              className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-gold"
            >
              {copy.profileLink}
            </Link>
          </p>
        </header>

        {/* Required profile details still missing: always first, and not dismissible while anything is missing. */}
        <ProfileStatusNotice status={profileStatus} className="mt-8" />

        {/*
          Two columns, each stacking at its own height so neither leaves a hole
          beside the other:
            main  the next service, Preparation, Ministry, this device, the quarter
            rail  For you, Later, your availability - what is the person's own
          A phone gets one column in the page's order: the next service, what
          to do, the rest of the week, their availability, then preparing and
          the wider picture. (The rail spans both rows of the grid; the extra
          height of the taller column only ever falls at the bottom.)
        */}
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-3 lg:grid-rows-[auto_1fr] lg:gap-6">
          <NextServiceHero
            hero={hero}
            unavailable={!music.services}
            now={now}
            listen={hero ? <HeroListen service={hero.service} playlists={preparation} /> : null}
            className="lg:col-span-2 lg:row-start-1"
          />

          <div className="grid min-w-0 items-start gap-5 md:grid-cols-2 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:grid-cols-1 lg:gap-6">
            <ForYou model={forYou} />
            <LaterServices rows={later} now={now} />
            {focus.tracksAvailability ? <AvailabilitySummary summary={availability} now={now} /> : null}
          </div>

          <div className="grid min-w-0 items-start gap-5 lg:col-span-2 lg:row-start-2 lg:gap-6">
            <Preparation
              services={comingUp}
              playlists={preparation}
              brushUp={brushUp}
              recordsBegan={recordsBegan}
              newSheet={recentSheets}
              now={now}
            />

            {showsMinistry ? (
              <Ministry
                availability={teamAvailability}
                availabilityFailed={focus.managesAvailability && !availability}
                groups={groups}
                peopleFailed={focus.seesPeople && !people}
                showSheetMusic={focus.managesSheetMusic}
                gaps={gaps}
                gapsFailed={focus.managesSheetMusic && !music.index}
                tools={tools}
                now={now}
              />
            ) : null}

            {/* Shown by the browser only where installing or push is possible, until put away. Nothing at all when neither shows. */}
            <section aria-labelledby="dashboard-device" className="hidden has-[[data-setup]>*]:block">
              <h2 id="dashboard-device" className="sr-only">
                {copy.setup.title}
              </h2>
              <div data-setup="" className="grid gap-3 md:grid-cols-2">
                <InstallAppCard />
                <PushCard />
              </div>
            </section>

            {glance ? <QuarterGlance glance={glance} /> : null}
          </div>
        </div>
        {packetSeed ? <ServicePacketsSeed userId={viewer.userId} packets={packetSeed} /> : null}
      </Container>
    </PageTransition>
  );
}
