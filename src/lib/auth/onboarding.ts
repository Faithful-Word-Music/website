/**
 * Onboarding (/welcome): which steps someone sees, which are done, and
 * where they pick up. Pure - built from their profile status and the
 * optional steps they have been through, so it resumes the same after a
 * reload, on another device, or a week later.
 *
 *   full       a new member, straight from accepting their invitation
 *              (or anyone replaying the introduction): every step that
 *              applies to them, in order
 *   focused    an existing member with something missing: only the steps
 *              holding it - nothing they have already done is replayed
 *   done       nothing required is missing and no walkthrough is open
 *
 * A required step is done only when its answers are saved (never because a
 * button was pressed). In the full walkthrough, About you and Your ministry
 * also wait for the person to continue past them, so the optional
 * questions are seen once - but continuing never stands in for an answer.
 */

import { REQUIREMENT_SECTION, type ProfileStatus, type RequirementKey } from "./profile-requirements";

export const ONBOARDING_STEPS = ["about", "ministry", "availability", "notifications", "intro"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Steps whose being seen is recorded (onboarding_progress). */
export const ACK_STEPS = ["about", "ministry", "notifications", "intro"] as const;
export type AckStep = (typeof ACK_STEPS)[number];
/** The walkthrough "Replay the introduction" starts again. */
export const OPTIONAL_STEPS = ["notifications", "intro"] as const satisfies readonly AckStep[];
export type OptionalStep = (typeof OPTIONAL_STEPS)[number];
/** Recorded when someone starts the full walkthrough (from sign-up, or a replay). */
export const STARTED = "started";

const STEP_SECTIONS: Record<OnboardingStep, ReadonlyArray<(typeof REQUIREMENT_SECTION)[RequirementKey]>> = {
  about: ["about"],
  ministry: ["music", "shared", "leading"],
  availability: ["availability"],
  notifications: [],
  intro: [],
};

export interface PlannedStep {
  key: OnboardingStep;
  /** Holds at least one required answer for this person. */
  required: boolean;
  /** Required answers still missing in this step. */
  missing: RequirementKey[];
  done: boolean;
}

export interface OnboardingPlan {
  mode: "full" | "focused" | "done";
  steps: PlannedStep[];
  /** Where to pick up: the first step not done (null when every step is). */
  current: OnboardingStep | null;
  /** Nothing required is missing: the Dashboard is open to them. */
  requiredDone: boolean;
}

export function stepOf(key: RequirementKey): OnboardingStep {
  const section = REQUIREMENT_SECTION[key];
  return (ONBOARDING_STEPS.find((step) => STEP_SECTIONS[step].includes(section)) ?? "about") as OnboardingStep;
}

export function onboardingPlan(input: {
  status: Pick<ProfileStatus, "applicable" | "missing" | "participation">;
  progress: ReadonlySet<string>;
}): OnboardingPlan {
  const { status, progress } = input;
  const missingKeys = status.missing.map((item) => item.key);
  const requiredDone = missingKeys.length === 0;
  const walkthroughOpen = progress.has(STARTED) && OPTIONAL_STEPS.some((step) => !progress.has(step));
  const plays = status.participation.musician || status.participation.songLeader;

  const all: PlannedStep[] = ONBOARDING_STEPS.map((key) => {
    const missing = missingKeys.filter((item) => stepOf(item) === key);
    const required = status.applicable.some((item) => stepOf(item) === key);
    const acknowledged = !(ACK_STEPS as readonly string[]).includes(key) || progress.has(key);
    return { key, required, missing, done: missing.length === 0 && (!walkthroughOpen || acknowledged) };
  });

  if (walkthroughOpen) {
    const steps = all.filter((step) => {
      if (step.key === "ministry") return plays || step.missing.length > 0;
      if (step.key === "availability") return status.participation.availability || step.missing.length > 0;
      return true;
    });
    return { mode: "full", steps, current: steps.find((step) => !step.done)?.key ?? null, requiredDone };
  }

  const steps = all.filter((step) => step.missing.length > 0);
  if (steps.length === 0) return { mode: "done", steps: [], current: null, requiredDone };
  return { mode: "focused", steps, current: steps[0].key, requiredDone };
}
