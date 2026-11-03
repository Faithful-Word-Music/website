import "server-only";

import { currentUser } from "@clerk/nextjs/server";

import { activateOwnRequests } from "@/lib/auth/activation";
import { summarize } from "@/lib/auth/clerk";
import type { ProfileStatus } from "@/lib/auth/profile-requirements";
import { viewerProfileStatus, type Viewer } from "@/lib/auth/session";
import {
  capoRulesOrNone,
  countRequestsByStatus,
  getProfile,
  getSheetMusicTypes,
  getUserInstruments,
  getUserTitles,
} from "@/lib/auth/store";
import { loadPlannerWork } from "@/lib/service-planner/load";

import { buildCapabilities, type DashboardCapabilities } from "./focus";
import {
  loadAvailabilitySummary,
  loadDashboardLeadership,
  loadInvitationFollowUps,
  loadMusicData,
  loadPeople,
  loadSupportCounts,
  type MusicData,
} from "./load";
import { timed } from "./timing";

/**
 * Everything the Dashboard reads, in ONE wave: every read starts as soon as
 * the viewer is known, and none waits for another. Which reads happen at all
 * is decided by permissions alone (buildCapabilities) - never by titles or
 * instruments, which arrive in the same wave.
 *
 * Every read fails soft: a source that is down comes back null (or empty),
 * its sections say so or stay out, and the page itself still renders.
 */

/** `work`, or `fallback` (logged) if it fails - so one source never takes the page down. */
export async function settle<T, F>(label: string, work: Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await timed(label, work);
  } catch (error) {
    console.error(`[dashboard] Could not load ${label}:`, error instanceof Error ? error.message : "unknown error");
    return fallback;
  }
}

function emptyMusic(): MusicData {
  return { services: null, past: [], upcoming: [], index: null, loadedAt: Date.now() };
}

export async function loadDashboard(viewer: Viewer) {
  const can = buildCapabilities(viewer.permissions);
  // Song leaders: for whoever plans them, leads, or prepares from the published song lists.
  const followsLeaders = can.plansServices || viewer.can("lead_songs") || viewer.can("view_service_plans");

  const user = settle("currentUser", currentUser(), null);
  // The first visit after accepting an invitation closes the request that led to it.
  const activation = user.then((found) =>
    found ? settle("activateOwnRequests", activateOwnRequests(viewer, summarize(found).emails), null) : null,
  );

  const [person, , profile, instruments, titles, sheetTypes, profileStatus, music, capoRules, requests, people, invitations, availability, plannerWork, leading, support] =
    await Promise.all([
      user.then((found) => (found ? summarize(found) : null)),
      activation,
      settle("profile", getProfile(viewer.env, viewer.userId), null),
      settle("instruments", getUserInstruments(viewer.env, viewer.userId), []),
      settle("titles", getUserTitles(viewer.env, viewer.userId), []),
      settle("sheetTypes", getSheetMusicTypes(viewer.env, viewer.userId), [] as number[]),
      // Worked out already by requireViewer() for the gate: cached for this request. Never throws.
      viewerProfileStatus(viewer) as Promise<ProfileStatus>,
      settle("music", loadMusicData(), emptyMusic()),
      can.managesSheetMusic ? settle("capoRules", capoRulesOrNone(viewer.env), undefined) : undefined,
      can.reviewsAccounts ? settle("requests", countRequestsByStatus(viewer.env), null) : null,
      can.seesPeople ? settle("people", loadPeople(viewer), null) : null,
      can.reviewsAccounts ? settle("invitations", loadInvitationFollowUps(), null) : null,
      can.tracksAvailability ? settle("availability", loadAvailabilitySummary(viewer), null) : null,
      can.plansServices ? settle("plannerWork", loadPlannerWork(viewer), null) : null,
      followsLeaders ? settle("leadership", loadDashboardLeadership(viewer), null) : null,
      settle("support", loadSupportCounts(viewer), null),
    ]);

  return {
    can: can satisfies DashboardCapabilities,
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
  };
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;
