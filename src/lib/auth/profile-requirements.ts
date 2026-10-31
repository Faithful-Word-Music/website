/**
 * What each person must have on their profile, and by when
 * (docs/profile-requirements.md).
 *
 * One engine, used by the session gate, onboarding (/welcome), the Profile,
 * the Dashboard and Admin. It is pure: the database, Clerk and the clock are
 * all passed in, so every rule here is tested with a fixed `now`.
 *
 *   1. participation()          who someone is in the ministry, from their
 *                               roles and their permissions held on purpose
 *   2. applicableRequirements() the questions that follow from that
 *   3. missingRequirements()    the ones still unanswered
 *   4. planDeadlines()          the durable deadlines to record for any
 *                               requirement that has none yet
 *   5. profileStatus()          complete, advisory, grace or blocked
 *
 * An unanswered question is NULL, never a default: `false`, "none" and an
 * explicitly confirmed empty availability are all answers.
 */

import { MUSICIAN_ROLE, type Permission } from "./permissions";

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

/** Every requirement, in the order they are asked and listed. */
export const REQUIREMENT_KEYS = [
  "name",
  "instruments",
  "instrument_proficiency",
  "primary_instrument",
  "learning_style",
  "reads_sheet_music",
  "leading_experience",
  "leading_unfamiliar",
  "leading_unaccompanied",
  "availability_reviewed",
] as const;
export type RequirementKey = (typeof REQUIREMENT_KEYS)[number];

export function isRequirementKey(value: string): value is RequirementKey {
  return (REQUIREMENT_KEYS as readonly string[]).includes(value);
}

/** The permissions that decide participation, held on purpose (see holdsExplicitly). */
export const LEAD_SONGS: Permission = "lead_songs";
export const AVAILABILITY: Permission = "view_availability";

export interface Participation {
  /** Holds the Musician role. */
  musician: boolean;
  /**
   * Holds lead_songs on purpose - a role or an individual grant, not taken
   * away by a deny, and never the Administrator role's blanket permissions.
   * The same test as being offered as a leader (src/lib/leadership/load.ts).
   */
  songLeader: boolean;
  /**
   * A musician or song leader who is on the availability board, and so can
   * set (and is asked for) their normal services. Without view_availability
   * they could not reach the write path, so it is never required of them.
   */
  availability: boolean;
}

export function participation(input: {
  roleKeys: readonly string[];
  /** Permissions held on purpose: holdsExplicitly() for each one. */
  explicit: ReadonlySet<Permission>;
}): Participation {
  const musician = input.roleKeys.includes(MUSICIAN_ROLE);
  const songLeader = input.explicit.has(LEAD_SONGS);
  return { musician, songLeader, availability: (musician || songLeader) && input.explicit.has(AVAILABILITY) };
}

/**
 * The requirements that apply, once each: a question shared by two roles
 * (reading sheet music, availability) is one requirement, so someone who
 * both plays and leads is asked it once. A song leader is never asked about
 * instruments.
 */
export function applicableRequirements(who: Participation): RequirementKey[] {
  const keys = new Set<RequirementKey>(["name"]);
  if (who.musician) {
    for (const key of ["instruments", "instrument_proficiency", "primary_instrument", "learning_style"] as const) keys.add(key);
  }
  if (who.musician || who.songLeader) keys.add("reads_sheet_music");
  if (who.songLeader) {
    for (const key of ["leading_experience", "leading_unfamiliar", "leading_unaccompanied"] as const) keys.add(key);
  }
  if (who.availability) keys.add("availability_reviewed");
  return REQUIREMENT_KEYS.filter((key) => keys.has(key));
}

/** What the profile holds, as stored - NULL for unanswered. */
export interface RequirementFacts {
  firstName: string | null;
  lastName: string | null;
  instruments: ReadonlyArray<{ proficiency: string | null; isPrimary: boolean }>;
  learningStyle: number | null;
  readsSheetMusic: boolean | null;
  /** When normal availability was last saved on purpose (an empty list confirmed counts). */
  availabilityReviewedAt: string | null;
  leading: {
    experience: string | null;
    unfamiliarHymns: string | null;
    unaccompaniedLeading: string | null;
  };
}

export function isSatisfied(key: RequirementKey, facts: RequirementFacts): boolean {
  switch (key) {
    case "name":
      return Boolean(facts.firstName?.trim()) && Boolean(facts.lastName?.trim());
    case "instruments":
      return facts.instruments.length > 0;
    // With no instruments at all, only "instruments" is asked: these follow from it.
    case "instrument_proficiency":
      return facts.instruments.every((item) => item.proficiency !== null && item.proficiency !== "");
    case "primary_instrument":
      return facts.instruments.length === 0 || facts.instruments.filter((item) => item.isPrimary).length === 1;
    case "learning_style":
      return facts.learningStyle !== null;
    case "reads_sheet_music":
      return facts.readsSheetMusic !== null;
    case "leading_experience":
      return facts.leading.experience !== null;
    case "leading_unfamiliar":
      return facts.leading.unfamiliarHymns !== null;
    case "leading_unaccompanied":
      return facts.leading.unaccompaniedLeading !== null;
    case "availability_reviewed":
      return facts.availabilityReviewedAt !== null;
  }
}

export function missingRequirements(applicable: readonly RequirementKey[], facts: RequirementFacts): RequirementKey[] {
  return applicable.filter((key) => !isSatisfied(key, facts));
}

/** Which part of onboarding and the profile editor answers each requirement. */
export type RequirementSection = "about" | "music" | "leading" | "shared" | "availability";

export const REQUIREMENT_SECTION: Record<RequirementKey, RequirementSection> = {
  name: "about",
  instruments: "music",
  instrument_proficiency: "music",
  primary_instrument: "music",
  learning_style: "music",
  reads_sheet_music: "shared",
  leading_experience: "leading",
  leading_unfamiliar: "leading",
  leading_unaccompanied: "leading",
  availability_reviewed: "availability",
};

/**
 * The required answers one section of the profile form would leave
 * unanswered, for someone who must give them (`needs`). The server refuses
 * such a save, and the forms check the same before sending: a required
 * question can never be cleared, skipped or saved empty.
 */
export function missingInSection(
  section: "about" | "music" | "shared" | "leading",
  values: Partial<RequirementFacts>,
  needs: ReadonlySet<RequirementKey>,
): RequirementKey[] {
  const facts: RequirementFacts = {
    firstName: null,
    lastName: null,
    instruments: [],
    learningStyle: null,
    readsSheetMusic: null,
    availabilityReviewedAt: null,
    leading: { experience: null, unfamiliarHymns: null, unaccompaniedLeading: null },
    ...values,
  };
  return REQUIREMENT_KEYS.filter(
    (key) => REQUIREMENT_SECTION[key] === section && needs.has(key) && !isSatisfied(key, facts),
  );
}

// ---------------------------------------------------------------------------
// The policy and its deadlines
// ---------------------------------------------------------------------------

export const GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
export const POLICY_VERSION = 1;

/**
 * The requirements policy for one environment (site_settings
 * 'profile_requirements'). No row: not active, and nothing is ever blocked.
 *
 *   activatedAt   written once, by the first activation; never moved
 *   snapshot      "pending" until every account that existed at activation
 *                 has its baseline (activation.ts), then "complete". Nobody
 *                 is blocked while it is pending.
 *   pausedAt      set while paused: nobody is blocked; deadlines stand
 */
export interface RequirementPolicy {
  version: number;
  activatedAt: string;
  activatedBy: string | null;
  snapshot: "pending" | "complete";
  snapshotCompletedAt: string | null;
  snapshotAccounts: number | null;
  pausedAt: string | null;
}

/** Reads a stored policy defensively: anything malformed counts as no policy. */
export function parsePolicy(value: unknown): RequirementPolicy | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.activatedAt !== "string" || Number.isNaN(Date.parse(raw.activatedAt))) return null;
  const optionalDate = (field: unknown) => (typeof field === "string" && !Number.isNaN(Date.parse(field)) ? field : null);
  return {
    version: typeof raw.version === "number" ? raw.version : POLICY_VERSION,
    activatedAt: raw.activatedAt,
    activatedBy: typeof raw.activatedBy === "string" ? raw.activatedBy : null,
    snapshot: raw.snapshot === "complete" ? "complete" : "pending",
    snapshotCompletedAt: optionalDate(raw.snapshotCompletedAt),
    snapshotAccounts: typeof raw.snapshotAccounts === "number" ? raw.snapshotAccounts : null,
    pausedAt: optionalDate(raw.pausedAt),
  };
}

/** Whether the policy may block anyone right now. */
export function isEnforcing(policy: RequirementPolicy | null): boolean {
  return policy !== null && policy.snapshot === "complete" && policy.pausedAt === null;
}

export interface Deadline {
  key: RequirementKey;
  firstAppliedAt: string;
  dueAt: string;
}

/**
 * The deadlines to record for requirements that apply but have none yet,
 * and whether this is the first time the person is seen under the policy
 * (their baseline). Existing deadlines are never moved.
 *
 * Whether an account is new is decided by when Clerk created it, compared
 * with when the policy was activated - never by what is or is not stored:
 *
 *   created before activation, no baseline yet
 *       everything that applies now applied at activation (the activation
 *       snapshot writes exactly this for every account): due activatedAt + 7
 *       days, however late they first sign in.
 *   created before activation, baseline recorded
 *       a requirement with no deadline is new since then (a role gained):
 *       due now + 7 days.
 *   created at or after activation, no baseline yet
 *       a new member: what applies when they are first seen is due now -
 *       they finish it in onboarding before using the site.
 *   created at or after activation, baseline recorded
 *       a role gained after joining: due now + 7 days.
 *
 * Unknown account age (Clerk unreachable) plans nothing: the caller treats
 * the person as not blocked for this request rather than guess.
 */
export function planDeadlines(input: {
  policy: RequirementPolicy | null;
  applicable: readonly RequirementKey[];
  existing: ReadonlyMap<RequirementKey, string>;
  hasBaseline: boolean;
  accountCreatedAt: number | null;
  now: number;
}): { deadlines: Deadline[]; establishBaseline: boolean } {
  const { policy, applicable, existing, hasBaseline, accountCreatedAt, now } = input;
  if (!policy) return { deadlines: [], establishBaseline: false };
  const activatedAt = Date.parse(policy.activatedAt);
  const unplanned = applicable.filter((key) => !existing.has(key));
  if (hasBaseline) {
    const due = new Date(now + GRACE_DAYS * DAY_MS).toISOString();
    const first = new Date(now).toISOString();
    return { deadlines: unplanned.map((key) => ({ key, firstAppliedAt: first, dueAt: due })), establishBaseline: false };
  }
  if (accountCreatedAt === null) return { deadlines: [], establishBaseline: false };
  const existedAtActivation = accountCreatedAt < activatedAt;
  const firstAppliedAt = existedAtActivation ? policy.activatedAt : new Date(now).toISOString();
  const dueAt = existedAtActivation ? new Date(activatedAt + GRACE_DAYS * DAY_MS).toISOString() : new Date(now).toISOString();
  return { deadlines: unplanned.map((key) => ({ key, firstAppliedAt, dueAt })), establishBaseline: true };
}

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

/**
 *   complete   nothing required is missing
 *   advisory   something is missing, but no policy is active (a gentle
 *              notice, as before)
 *   grace      something is missing and its deadline has not passed - or
 *              the policy cannot block yet (snapshot pending, paused)
 *   blocked    a missing requirement is past its deadline: normal pages send
 *              the person to /welcome until it is answered
 *   unknown    it could not be worked out (the database or Clerk was away):
 *              treated as not blocked - never a reason to lock anyone out
 */
export type ProfileState = "complete" | "advisory" | "grace" | "blocked" | "unknown";

export interface ProfileStatus {
  state: ProfileState;
  /** Missing requirements with their deadlines (null when none is recorded). */
  missing: Array<{ key: RequirementKey; dueAt: string | null }>;
  /** The earliest deadline among the missing ones. */
  dueAt: string | null;
  applicable: RequirementKey[];
  participation: Participation;
}

export function profileStatus(input: {
  policy: RequirementPolicy | null;
  participation: Participation;
  applicable: readonly RequirementKey[];
  missing: readonly RequirementKey[];
  deadlines: ReadonlyMap<RequirementKey, string>;
  now: number;
}): ProfileStatus {
  const { policy, missing, deadlines, now } = input;
  const withDue = missing.map((key) => ({ key, dueAt: policy ? (deadlines.get(key) ?? null) : null }));
  const dues = withDue.map((item) => item.dueAt).filter((due): due is string => due !== null).sort();
  const base = { missing: withDue, dueAt: dues[0] ?? null, applicable: [...input.applicable], participation: input.participation };
  if (missing.length === 0) return { ...base, state: "complete" };
  if (!policy) return { ...base, state: "advisory" };
  const overdue = withDue.some((item) => item.dueAt !== null && Date.parse(item.dueAt) <= now);
  return { ...base, state: overdue && isEnforcing(policy) ? "blocked" : "grace" };
}

/** A status that blocks nothing, for when it cannot be worked out (never a reason to lock someone out). */
export function unknownStatus(): ProfileStatus {
  return {
    state: "unknown",
    missing: [],
    dueAt: null,
    applicable: [],
    participation: { musician: false, songLeader: false, availability: false },
  };
}
