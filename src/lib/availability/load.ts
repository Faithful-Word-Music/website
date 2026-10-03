import "server-only";

import { listAccounts } from "@/lib/auth/clerk";
import type { ClerkEnv } from "@/lib/auth/clerk-env";
import type { Viewer } from "@/lib/auth/session";
import { scheduledServices } from "@/lib/service-planner/store";

import { isEditable, LEADER_PERMISSION } from "./access";
import { buildBoard, upcomingChanges, type BoardService, type BoardView, type RosterPerson, type UpcomingChange } from "./board";
import { addDays, churchDate, isMonthString, monthRange, serviceOccurrences, type Occurrence } from "./occurrences";
import { listExceptions, loadRosterRecords } from "./store";

/**
 * The reads availability pages share: the board's people, named from Clerk
 * (the one source of names), and the Service Planner's services, which is
 * where special services (and cancelled regular ones) come from.
 */

/**
 * Everyone on the board with their name. If Clerk cannot be reached the
 * board still works - each person is then shown by their preferred name, or
 * as "A musician".
 */
export async function loadRoster(env: ClerkEnv): Promise<RosterPerson[]> {
  const records = await loadRosterRecords(env);
  if (records.length === 0) return [];

  const accounts = await listAccounts({ userIds: records.map((record) => record.id), limit: 500, offset: 0 });
  const byId = accounts.ok ? new Map(accounts.value.accounts.map((account) => [account.id, account])) : null;

  return records
    // An account deleted in Clerk is no longer on the board.
    .filter((record) => !byId || byId.has(record.id))
    .map((record) => {
      const account = byId?.get(record.id);
      const first = record.preferredName || account?.firstName || "";
      const name = [first, account?.lastName ?? ""].filter(Boolean).join(" ") || account?.fullName || "A musician";
      return { id: record.id, name, normal: record.normal };
    });
}

/**
 * The planner's services from `from` to `to` - special services as soon as
 * they are created (drafts too: people need to say whether they can come),
 * plus names, times and cancellations of regular ones. Empty if the planner
 * cannot be read, leaving the regular services.
 */
export async function loadPlannedServices(env: ClerkEnv, from: string, to: string) {
  return scheduledServices(env, { from, to });
}

/** How far ahead the page's upcoming lists and the date-range preview look. */
const UPCOMING_DAYS = 365;
/** Ministry-wide changes listed under Everyone. */
const EVERYONE_LIMIT = 8;

export interface AvailabilityPageData {
  now: number;
  today: string;
  thisMonth: string;
  month: string;
  view: BoardView;
  roster: RosterPerson[];
  /** The viewer, when they are on the board. */
  self: RosterPerson | null;
  /** The person a leader has chosen to manage, when not themself. */
  managed: RosterPerson | null;
  /** Whose availability is shown and changed: `managed`, else `self`. */
  subject: RosterPerson | null;
  services: Array<BoardService & { editable: boolean }>;
  /** Services from today on that can still be changed. */
  upcoming: Occurrence[];
  subjectChanges: UpcomingChange[];
  everyoneChanges: UpcomingChange[];
}

/**
 * Everything /availability shows, for one viewer and the view in the
 * address. `person` is honoured only for a leader, and only for someone on
 * the board - anyone else always sees their own.
 */
export async function loadAvailabilityPage(
  viewer: Viewer,
  request: { month: string | null; view: string | null; person: string | null },
): Promise<AvailabilityPageData> {
  const now = Date.now();
  const today = churchDate(now);
  const thisMonth = today.slice(0, 7);
  const month = request.month && isMonthString(request.month) ? request.month : thisMonth;
  const view: BoardView = request.view === "me" ? "me" : "everyone";

  const { from, to } = monthRange(month);
  const upcomingTo = addDays(today, UPCOMING_DAYS);
  const [roster, songList] = await Promise.all([
    loadRoster(viewer.env),
    loadPlannedServices(viewer.env, from < today ? from : today, to > upcomingTo ? to : upcomingTo),
  ]);
  const self = roster.find((person) => person.id === viewer.userId) ?? null;
  const requested = viewer.can(LEADER_PERMISSION) && request.person !== viewer.userId ? request.person : null;
  const managed = requested ? (roster.find((person) => person.id === requested) ?? null) : null;
  const subject = managed ?? self;

  const exceptions = await listExceptions(viewer.env, from < today ? from : today, to > upcomingTo ? to : upcomingTo);

  const services = buildBoard({
    occurrences: serviceOccurrences(from, to, songList),
    roster,
    exceptions,
    subjectId: subject?.id ?? null,
    view,
  }).map((service) => ({ ...service, editable: isEditable(service, now) }));

  const upcoming = serviceOccurrences(today, upcomingTo, songList).filter((occ) => isEditable(occ, now));

  return {
    now,
    today,
    thisMonth,
    month,
    view,
    roster,
    self,
    managed,
    subject,
    services,
    upcoming,
    subjectChanges: subject ? upcomingChanges(upcoming, roster, exceptions, subject.id) : [],
    everyoneChanges: upcomingChanges(upcoming, roster, exceptions).slice(0, EVERYONE_LIMIT),
  };
}
