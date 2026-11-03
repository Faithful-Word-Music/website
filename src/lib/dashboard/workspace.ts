/**
 * The Dashboard's workspace: what each area shows, worked out from data the
 * page has already loaded and redacted for this viewer. Nothing here reads a
 * database or decides a permission - it only arranges what it is given:
 *
 *   hero       the next service: its readiness (readiness.ts), its leaders as
 *              the viewer may see them (leadership.ts), one primary action
 *   later      the services after it, and the viewer's own song leading
 *              further ahead, one compact row each
 *   for you    "Needs your attention" (attention.ts), five at a time
 *   team       short summaries for the people who look after the ministry
 *
 * One warning, one place: planning, leaders, support and accounts are For
 * You's to say. The hero and Later show readiness as a label that links to
 * the fix, and Team shows counts that are not attention items at all.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import { songListContent } from "@/content/song-list";
import type { TeamAvailability } from "@/lib/availability/summary";
import type { LeadershipProblem, MyAssignment } from "@/lib/leadership/board";
import { nextServiceListenHref } from "@/lib/search/next-service";
import type { PlaylistMonth } from "@/lib/recordings/playlist";

import type { AttentionItem } from "./attention";
import type { ComingUpService } from "./coming-up";
import type { DashboardFocus } from "./focus";
import { cardLeaders, laterAssignments, type CardLeaders, type Rosters } from "./leadership";
import type { PlannerWork } from "./providers";
import { serviceReadiness, type Readiness, type ReadinessState } from "./readiness";

// --- Readiness, as it looks ----------------------------------------------------

/**
 * A readiness state's badge tone. "unknown" is neutral on purpose: not being
 * able to check something is uncertainty, not a warning.
 */
export type ReadinessTone = "success" | "warning" | "danger" | "neutral";

export function readinessTone(state: ReadinessState): ReadinessTone {
  switch (state) {
    case "ready":
      return "success";
    case "attention":
      return "warning";
    case "blocked":
      return "danger";
    case "unknown":
      return "neutral";
  }
}

// --- The next service ----------------------------------------------------------

export type PrimaryAction =
  /** The service is still in the planner's queue: finish it. */
  | { kind: "plan"; href: string }
  /** Their sheet music for it, as one PDF (the ServiceSheetMusic button). */
  | { kind: "sheet-music" }
  /** They lead songs at a published service: their songs on the song list. */
  | { kind: "review-songs"; href: string }
  /** Anyone else: the service on the song list. */
  | { kind: "song-list"; href: string };

export interface SecondaryAction {
  kind: "plan" | "song-list";
  href: string;
}

export interface ActionContext {
  focus: Pick<DashboardFocus, "plansServices">;
  /** The planner's queue; null when it failed or is not theirs. */
  plannerWork: readonly PlannerWork[] | null;
  leaders: CardLeaders | null;
}

export const songListHref = (anchor: string) => `/song-list#${anchor}`;
export const plannerHref = (anchor: string) => `/service-planner/${anchor}`;

/** Whether the service is still waiting in the planner's queue. */
function inQueue(service: Pick<ComingUpService, "id">, work: readonly PlannerWork[] | null): boolean {
  return !!work?.some((entry) => entry.anchor === service.id);
}

/**
 * The one dominant action for the next service, first match wins:
 *   1. a planner whose service is unfinished  -> Continue planning
 *   2. someone with their sheet music for it  -> Sheet music
 *   3. a leader at a published service        -> Review your songs
 *   4. everyone else                          -> View on the song list
 * It only ever picks among things already allowed: the planner's queue is
 * loaded only for manage_service_plans, and the packet only exists for
 * someone with sheet music they may open.
 */
export function primaryAction(
  service: Pick<ComingUpService, "id" | "slots" | "packetHref">,
  context: ActionContext,
): PrimaryAction {
  if (context.focus.plansServices && inQueue(service, context.plannerWork)) {
    return { kind: "plan", href: plannerHref(service.id) };
  }
  if (service.packetHref) return { kind: "sheet-music" };
  if (service.slots.length > 0 && context.leaders && context.leaders.mine.length > 0) {
    return { kind: "review-songs", href: songListHref(service.id) };
  }
  return { kind: "song-list", href: songListHref(service.id) };
}

/** At most two quieter actions beside it, never repeating it. */
export function secondaryActions(
  service: Pick<ComingUpService, "id" | "slots">,
  primary: PrimaryAction,
  context: ActionContext,
): SecondaryAction[] {
  const actions: SecondaryAction[] = [];
  if (context.focus.plansServices && primary.kind !== "plan") {
    actions.push({ kind: "plan", href: plannerHref(service.id) });
  }
  if (service.slots.length > 0 && primary.kind !== "song-list" && primary.kind !== "review-songs") {
    actions.push({ kind: "song-list", href: songListHref(service.id) });
  }
  return actions.slice(0, 2);
}

export interface HeroModel {
  service: ComingUpService;
  readiness: Readiness | null;
  leaders: CardLeaders | null;
  primary: PrimaryAction;
  secondary: SecondaryAction[];
}

export interface WorkspaceInput {
  comingUp: readonly ComingUpService[];
  now: number;
  focus: DashboardFocus;
  plannerWork: readonly PlannerWork[] | null;
  /** Null when the song leaders failed to load (or are not the viewer's to see). */
  leading: { rosters: Rosters; mine: readonly MyAssignment[]; problems: readonly LeadershipProblem[] } | null;
}

/** The readiness of one service for this viewer: planner signals only for a planner. */
function readinessFor(service: ComingUpService, input: WorkspaceInput): Readiness | null {
  return serviceReadiness({
    service,
    now: input.now,
    planner: input.focus.plansServices ? { work: input.plannerWork, problems: input.leading?.problems ?? null } : undefined,
  });
}

function leadersFor(service: ComingUpService, input: WorkspaceInput): CardLeaders | null {
  return input.leading ? cardLeaders(service, input.leading.rosters) : null;
}

export function buildHero(input: WorkspaceInput): HeroModel | null {
  const [service] = input.comingUp;
  if (!service) return null;
  const leaders = leadersFor(service, input);
  const context: ActionContext = { focus: input.focus, plannerWork: input.plannerWork, leaders };
  const primary = primaryAction(service, context);
  return {
    service,
    readiness: readinessFor(service, input),
    leaders,
    primary,
    secondary: secondaryActions(service, primary, context),
  };
}

// --- Later ---------------------------------------------------------------------

export interface LaterRow {
  anchor: string;
  startsAt: string;
  /** "Evening Service", or a special service's own name. */
  title: string;
  /** Published with its songs: it has a card on the song list. */
  published: boolean;
  readiness: Readiness | null;
  /** The viewer's own song leading at it. Songs only once published - never a draft's. */
  leading: { positions: number[]; songs: MyAssignment["songs"]; unavailable: boolean } | null;
  /** Their sheet music for it as one PDF. */
  packetHref: string | null;
  /** For a planner, when it is still in their queue. */
  planHref: string | null;
}

/** "Morning Service", "Evening Service" - or the service's own name. */
function serviceName(label: string | null, slot: ComingUpService["slot"]): string {
  return label ?? (slot ? songListContent.serviceMarkerLabels[slot] : songListContent.serviceMarkerLabels.AM);
}

/** How many of the viewer's own assignments beyond Coming up are listed. */
export const LATER_LEADING_LIMIT = 4;

/**
 * The services after the next one (still within the week Coming up covers),
 * and the viewer's own song leading further ahead - one row per service,
 * soonest first. A service in both is one row.
 */
export function buildLater(input: WorkspaceInput): LaterRow[] {
  const rows = new Map<string, LaterRow>();
  const mine = input.leading?.mine ?? [];
  const mineByAnchor = new Map(mine.map((assignment) => [assignment.anchor, assignment]));

  for (const service of input.comingUp.slice(1)) {
    const assignment = mineByAnchor.get(service.id);
    rows.set(service.id, {
      anchor: service.id,
      startsAt: service.startsAt,
      title: serviceName(service.serviceLabel, service.slot),
      published: service.slots.length > 0,
      readiness: readinessFor(service, input),
      leading: assignment ? toLeading(assignment) : leadingFromRoster(leadersFor(service, input)),
      packetHref: service.packetHref,
      planHref: input.focus.plansServices && inQueue(service, input.plannerWork) ? plannerHref(service.id) : null,
    });
  }

  const shown = new Set(input.comingUp.map((service) => service.id));
  for (const assignment of laterAssignments(mine, shown, LATER_LEADING_LIMIT)) {
    rows.set(assignment.anchor, {
      anchor: assignment.anchor,
      startsAt: assignment.startsAt,
      title: serviceName(assignment.label, assignment.slot),
      published: assignment.published,
      readiness: null,
      leading: toLeading(assignment),
      packetHref: null,
      planHref:
        input.focus.plansServices && input.plannerWork?.some((entry) => entry.anchor === assignment.anchor)
          ? plannerHref(assignment.anchor)
          : null,
    });
  }

  return [...rows.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

function toLeading(assignment: MyAssignment): NonNullable<LaterRow["leading"]> {
  // A draft's songs are not the leader's to see: positions only (myAssignments already holds null).
  return { positions: assignment.positions, songs: assignment.published ? assignment.songs : null, unavailable: assignment.unavailable };
}

function leadingFromRoster(leaders: CardLeaders | null): LaterRow["leading"] {
  return leaders && leaders.mine.length > 0 ? { positions: leaders.mine, songs: null, unavailable: false } : null;
}

// --- For You -------------------------------------------------------------------

/** Actions shown before "See all". */
export const FOR_YOU_LIMIT = 5;

export interface ForYouModel {
  shown: AttentionItem[];
  rest: AttentionItem[];
  /**
   * Whether every source the viewer's items come from was read. When one
   * failed, an empty list is not an all-clear - the panel says so instead.
   */
  complete: boolean;
}

/**
 * The attention items, most pressing first (collectAttention's order, kept),
 * split at `limit`. `covered` are ids the hero already offers as its primary
 * action - one thing, one place - and are left out.
 */
export function splitForYou(
  items: readonly AttentionItem[],
  options: { limit?: number; covered?: ReadonlySet<string>; complete: boolean },
): ForYouModel {
  const { limit = FOR_YOU_LIMIT, covered = new Set<string>(), complete } = options;
  const kept = items.filter((item) => !covered.has(item.id));
  return { shown: kept.slice(0, limit), rest: kept.slice(limit), complete };
}

/**
 * The attention ids the hero makes redundant: the planner's "next service to
 * plan" item, when the hero's primary action is already Continue planning for
 * that same service.
 */
export function heroCoveredIds(hero: HeroModel | null, plannerWork: readonly PlannerWork[] | null): Set<string> {
  const covered = new Set<string>();
  if (hero?.primary.kind === "plan" && plannerWork?.[0]?.anchor === hero.service.id) covered.add("planner:next");
  return covered;
}

// --- Preparation ---------------------------------------------------------------

/**
 * Where to listen to a coming service before it: its Preparation Playlist,
 * by the same rule the Song List and the search palette use
 * (nextServiceListenHref) - or null, never a link to a page without it.
 */
export function servicePlaylistHref(
  service: Pick<ComingUpService, "id" | "date" | "status" | "slots">,
  preparation: { ok: boolean; months: readonly PlaylistMonth[] } | null,
): string | null {
  // A posted service's slots are its songs; one not posted yet has none, and no playlist.
  return nextServiceListenHref({ id: service.id, date: service.date, songs: service.slots }, service.status, preparation);
}

// --- Team ----------------------------------------------------------------------

export interface TeamServiceRow {
  key: string;
  startsAt: string;
  slot: TeamAvailability["services"][number]["slot"];
  expected: number;
  /** The names of those normally there but away. */
  away: string[];
}

/** The team's availability, condensed: one line per service, never everyone's names. */
export function teamAvailabilityRows(team: TeamAvailability | null | undefined): { rows: TeamServiceRow[]; size: number; unset: TeamAvailability["unset"] } | null {
  if (!team) return null;
  return {
    rows: team.services.map((service) => ({
      key: `${service.date}|${service.slot}`,
      startsAt: service.startsAt,
      slot: service.slot,
      expected: service.expected.length,
      away: service.away.map((person) => person.name),
    })),
    size: team.size,
    unset: team.unset,
  };
}

export interface ToolLink {
  key: "availability" | "people" | "planner" | "support" | "requests";
  href: string;
}

/** The management pages this viewer may open, for the Team area's footer. */
export function teamTools(
  focus: Pick<DashboardFocus, "managesAvailability" | "seesPeople" | "plansServices" | "reviewsAccounts">,
  managesSupport: boolean,
): ToolLink[] {
  return [
    focus.plansServices ? { key: "planner" as const, href: "/service-planner" } : null,
    focus.managesAvailability ? { key: "availability" as const, href: "/availability" } : null,
    focus.seesPeople ? { key: "people" as const, href: "/admin/users" } : null,
    focus.reviewsAccounts ? { key: "requests" as const, href: "/admin/requests?status=pending" } : null,
    managesSupport ? { key: "support" as const, href: "/contact?view=manage" } : null,
  ].filter((tool): tool is ToolLink => tool !== null);
}
