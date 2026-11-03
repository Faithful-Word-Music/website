/**
 * Is the next service ready? Worked out only from facts the site can check,
 * for the people those facts matter to:
 *
 *   songs posted          planners    published, or still a draft (blocked when it is close)
 *   songs chosen          planners    every place filled
 *   leaders               planners    every song led, by someone available who may lead
 *   your sheet music      anyone with assigned sheet music types
 *
 * Recordings are left out on purpose: a song without one is normal, and a
 * broken chosen recording is the planner's to see. So are new sheet music and
 * songs to brush up on - they are preparation, not readiness.
 *
 * A source that failed to load makes its signal "unknown", and the whole
 * service can then never read as ready: the Dashboard says some details
 * couldn't be checked rather than showing a green light it cannot back up.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import { dashboardContent } from "@/content/dashboard";
import type { LeadershipProblem } from "@/lib/leadership/board";
import { plural } from "@/lib/plural";

import type { ComingUpService } from "./coming-up";
import type { PlannerWork } from "./providers";

const copy = dashboardContent.readiness;

export type SignalState = "ok" | "attention" | "blocked" | "unknown";
export type ReadinessState = "ready" | "attention" | "blocked" | "unknown";

export interface ReadinessSignal {
  key: "songs-posted" | "songs-chosen" | "leaders" | "my-sheet-music";
  state: SignalState;
  label: string;
  /** Where it is fixed, when there is somewhere. */
  href?: string;
}

export interface Readiness {
  overall: ReadinessState;
  /** In the order above; each one only when it applies. */
  signals: ReadinessSignal[];
}

/** How close an unpublished service is before it blocks - the same three days as the planner's urgent items. */
export const BLOCKED_DAYS = 3;
/** How far ahead the leaders' problems are looked for (load.ts): beyond it, the leaders are not checked at all. */
export const LEADERSHIP_ATTENTION_DAYS = 14;

/** Worst first: what decides `overall`. */
const RANK: Record<SignalState, number> = { ok: 0, unknown: 1, attention: 2, blocked: 3 };
const OVERALL: Record<SignalState, ReadinessState> = { ok: "ready", unknown: "unknown", attention: "attention", blocked: "blocked" };

export interface ReadinessInput {
  service: Pick<ComingUpService, "id" | "startsAt" | "slots" | "sheetMusicChecked">;
  now: number;
  /**
   * For whoever plans services (manage_service_plans) only: the planner's
   * queue (null if it failed to load) and the leaders' problems (null if
   * they failed). Absent for everyone else - their readiness is their own
   * sheet music only.
   */
  planner?: { work: readonly PlannerWork[] | null; problems: readonly LeadershipProblem[] | null };
}

/** The service's readiness for this person, or null when nothing about it is theirs to check. */
export function serviceReadiness({ service, now, planner }: ReadinessInput): Readiness | null {
  const signals: ReadinessSignal[] = [];
  const posted = service.slots.length > 0;
  const plannerHref = `/service-planner/${service.id}`;

  if (planner) {
    signals.push(...plannerSignals(service, now, planner, posted, plannerHref));
  }

  if (service.sheetMusicChecked && posted) {
    const missing = service.slots.filter((song) => song?.sheet?.status === "missing").length;
    signals.push(
      missing === 0
        ? { key: "my-sheet-music", state: "ok", label: copy.sheet.ok }
        : { key: "my-sheet-music", state: "attention", label: plural(copy.sheet.missing, missing) },
    );
  }

  if (signals.length === 0) return null;
  const worst = signals.reduce<SignalState>((state, signal) => (RANK[signal.state] > RANK[state] ? signal.state : state), "ok");
  return { overall: OVERALL[worst], signals };
}

function plannerSignals(
  service: ReadinessInput["service"],
  now: number,
  planner: NonNullable<ReadinessInput["planner"]>,
  posted: boolean,
  href: string,
): ReadinessSignal[] {
  const signals: ReadinessSignal[] = [];
  // The planner's queue holds only the services still to plan: one not in it is published.
  const work = planner.work?.find((entry) => entry.anchor === service.id);
  const close = Date.parse(service.startsAt) - now < BLOCKED_DAYS * 86_400_000;

  if (planner.work === null) {
    signals.push({ key: "songs-posted", state: "unknown", label: copy.posted.unknown, href });
  } else if (work) {
    signals.push({ key: "songs-posted", state: close ? "blocked" : "attention", label: copy.posted.draft, href });
  } else if (posted) {
    signals.push({ key: "songs-posted", state: "ok", label: copy.posted.ok });
  } else {
    // Neither in the queue nor on the song list: beyond what the queue looks at. Nothing to say.
  }

  const filled = work ? work.filled : service.slots.filter((song) => song !== null).length;
  const target = work ? work.target : service.slots.length;
  if (target > 0) {
    const places = (template: string) => template.replace("{filled}", String(filled)).replace("{target}", String(target));
    signals.push(
      filled >= target
        ? { key: "songs-chosen", state: "ok", label: places(copy.places.ok) }
        : { key: "songs-chosen", state: "attention", label: places(copy.places.short), href },
    );
  }

  if (Date.parse(service.startsAt) - now > LEADERSHIP_ATTENTION_DAYS * 86_400_000) {
    // Beyond the window the problems cover: no claim either way.
  } else if (planner.problems === null) {
    signals.push({ key: "leaders", state: "unknown", label: copy.leaders.unknown, href });
  } else {
    const problem = planner.problems.find((entry) => entry.anchor === service.id);
    const issues = problem
      ? [
          ...(problem.unled > 0 ? [plural(copy.leaders.unled, problem.unled)] : []),
          ...problem.conflicts.map((conflict) => copy.leaders.away.replace("{name}", conflict.name)),
          ...problem.ineligible.map((gone) => copy.leaders.ineligible.replace("{name}", gone.name)),
        ]
      : [];
    signals.push(
      issues.length === 0
        ? { key: "leaders", state: "ok", label: copy.leaders.ok }
        : { key: "leaders", state: "attention", label: issues.join(" · "), href },
    );
  }

  return signals;
}
