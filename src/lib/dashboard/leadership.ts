/**
 * Song leaders on the Dashboard: who leads what on the Coming up cards, the
 * viewer's own next assignments, and the schedulers' "Needs your attention".
 * Pure - the page loads the board (src/lib/leadership/load.ts) and its
 * redacted views (src/lib/leadership/board.ts) and hands them in.
 *
 * Nothing here can show more than access.ts allows: a draft's songs never
 * reach it, and for a draft a leader sees only the positions they lead.
 */

import { dashboardContent } from "@/content/dashboard";
import { availabilityHref } from "@/lib/availability/format";
import type { VisibleLeadership } from "@/lib/leadership/access";
import {
  cardLeaderView,
  type CardLeaderView,
  type LeadershipProblem,
  type MyAssignment,
  type RosterPeople,
} from "@/lib/leadership/board";
import { positionsLabel } from "@/lib/leadership/model";
import { plural } from "@/lib/plural";
import { serviceHeadline } from "@/lib/service-planner/format";

import type { AttentionItem } from "./attention";
import type { ComingUpService } from "./coming-up";
import type { DashboardFocus } from "./focus";

const copy = dashboardContent.leading;

export type Rosters = ReadonlyMap<string, VisibleLeadership & RosterPeople>;
/** What a Coming up card shows of its leaders. */
export interface CardLeaders {
  /**
   * For a service the viewer may see in full (published): who leads it
   * (cardLeaderView: once for the service, or on each song). Null for one
   * they see only their own part of.
   */
  view: CardLeaderView | null;
  /** The positions (1-based) the viewer leads. */
  mine: number[];
}

export function cardLeaders(service: Pick<ComingUpService, "id">, rosters: Rosters): CardLeaders | null {
  const roster = rosters.get(service.id);
  if (!roster) return null;
  const mine = new Set(roster.mine);
  const view =
    roster.access === "own"
      ? null
      : cardLeaderView(
          roster.names.map((name, index) =>
            name ? { name, mine: mine.has(index + 1), imageUrl: roster.images?.[index] ?? null } : null,
          ),
        );
  if (!view && roster.mine.length === 0) return null;
  return { view, mine: roster.mine };
}

/** The viewer's own assignments not already on a Coming up card, soonest first. */
export function laterAssignments(mine: readonly MyAssignment[], shown: ReadonlySet<string>, limit = 4): MyAssignment[] {
  return mine.filter((assignment) => !shown.has(assignment.anchor)).slice(0, limit);
}

/** How soon a leader problem is urgent. */
const URGENT_DAYS = 3;

/**
 * For whoever plans the services: songs with no leader (one item for all of
 * them), leaders who are away (one per service and person), and leaders who
 * can no longer lead. Each links to the service in the planner, where it is
 * fixed - nothing is reassigned for anyone.
 */
export function leadershipAttention(
  focus: Pick<DashboardFocus, "plansServices">,
  problems: readonly LeadershipProblem[] | null,
  now: number,
): AttentionItem[] {
  if (!focus.plansServices || !problems || problems.length === 0) return [];
  const a = copy.attention;
  const soon = (startsAt: string) => Date.parse(startsAt) - now < URGENT_DAYS * 86_400_000;
  const items: AttentionItem[] = [];

  const unled = problems.filter((problem) => problem.unled > 0);
  if (unled.length > 0) {
    const [first] = unled;
    items.push({
      id: "leaders:unled",
      priority: soon(first.startsAt) ? "urgent" : "normal",
      title: plural(a.unled as unknown as readonly [string, string], unled.length),
      detail: a.unledDetail.replace("{service}", serviceHeadline(first)).replace("{count}", String(first.unled)),
      href: `/service-planner/${first.anchor}`,
      action: a.assign,
    });
  }
  for (const problem of problems) {
    for (const conflict of problem.conflicts) {
      items.push({
        id: `leaders:away:${problem.anchor}:${conflict.name}`,
        priority: soon(problem.startsAt) ? "urgent" : "normal",
        title: a.conflict
          .replace("{name}", conflict.name)
          .replace("{songs}", positionsLabel(conflict.positions))
          .replace("{service}", serviceHeadline(problem)),
        href: `/service-planner/${problem.anchor}`,
        action: a.resolve,
      });
    }
    for (const gone of problem.ineligible) {
      items.push({
        id: `leaders:ineligible:${problem.anchor}:${gone.name}`,
        priority: soon(problem.startsAt) ? "urgent" : "normal",
        title: a.ineligible
          .replace("{name}", gone.name)
          .replace("{songs}", positionsLabel(gone.positions))
          .replace("{service}", serviceHeadline(problem)),
        href: `/service-planner/${problem.anchor}`,
        action: a.resolve,
      });
    }
  }
  return items;
}

/** For a leader: a service they lead songs in but are marked unavailable for. */
export function myLeadingAttention(mine: readonly MyAssignment[] | null, now: number): AttentionItem[] {
  if (!mine) return [];
  const a = copy.attention;
  return mine
    .filter((assignment) => assignment.unavailable)
    .map((assignment): AttentionItem => ({
      id: `leaders:mine:${assignment.anchor}`,
      priority: Date.parse(assignment.startsAt) - now < URGENT_DAYS * 86_400_000 ? "urgent" : "normal",
      title: a.mine.replace("{songs}", positionsLabel(assignment.positions)).replace("{service}", serviceHeadline(assignment)),
      href: availabilityHref({ month: assignment.date.slice(0, 7), view: "me" }),
      action: a.mineAction,
    }));
}
