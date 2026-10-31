import "server-only";

import type { ClerkEnv } from "./clerk-env";
import type { PermissionOverride } from "./permissions";
import type { LeadingComfort, LeadingExperience } from "./profile-options";
import {
  isRequirementKey,
  parsePolicy,
  POLICY_VERSION,
  type Deadline,
  type RequirementKey,
  type RequirementPolicy,
} from "./profile-requirements";
import { db } from "./store";

/**
 * Reading and writing the profile-requirement tables (schema.mjs): the
 * policy, baselines, deadlines, song-leading answers and onboarding steps.
 * Like store.ts, no authorization here - callers have checked the viewer.
 */

export const POLICY_KEY = "profile_requirements";

const iso = (value: string | Date | null): string | null => (value === null ? null : new Date(value).toISOString());

// ---------------------------------------------------------------------------
// One person's record, in one round trip
// ---------------------------------------------------------------------------

export interface RequirementRecord {
  policy: RequirementPolicy | null;
  learningStyle: number | null;
  readsSheetMusic: boolean | null;
  availabilityReviewedAt: string | null;
  instruments: Array<{ proficiency: string | null; isPrimary: boolean }>;
  leading: SongLeading;
  deadlines: Map<RequirementKey, string>;
  hasBaseline: boolean;
}

export async function loadRequirementRecord(env: ClerkEnv, userId: string): Promise<RequirementRecord> {
  const sql = await db(env);
  const [row] = (await sql.query(
    `SELECT
       (SELECT json_build_object('learning_style', learning_style, 'reads_sheet_music', reads_sheet_music,
                                 'availability_reviewed_at', availability_reviewed_at)
          FROM user_profiles WHERE clerk_env = $1 AND clerk_user_id = $2) AS profile,
       COALESCE((SELECT json_agg(json_build_object('proficiency', ui.proficiency, 'is_primary', ui.is_primary))
                   FROM user_instruments ui JOIN instruments i ON i.id = ui.instrument_id AND i.clerk_env = ui.clerk_env
                  WHERE ui.clerk_env = $1 AND ui.clerk_user_id = $2), '[]') AS instruments,
       (SELECT json_build_object('experience', experience, 'unfamiliar_hymns', unfamiliar_hymns,
                                 'unaccompanied_leading', unaccompanied_leading)
          FROM user_song_leading WHERE clerk_env = $1 AND clerk_user_id = $2) AS leading,
       COALESCE((SELECT json_agg(json_build_object('requirement', requirement, 'due_at', due_at))
                   FROM profile_requirement_deadlines WHERE clerk_env = $1 AND clerk_user_id = $2), '[]') AS deadlines,
       EXISTS (SELECT 1 FROM profile_requirement_baselines WHERE clerk_env = $1 AND clerk_user_id = $2) AS has_baseline,
       (SELECT value FROM site_settings WHERE clerk_env = $1 AND key = $3) AS policy`,
    [env, userId, POLICY_KEY],
  )) as Array<{
    profile: { learning_style: number | null; reads_sheet_music: boolean | null; availability_reviewed_at: string | null } | null;
    instruments: Array<{ proficiency: string | null; is_primary: boolean }>;
    leading: { experience: string | null; unfamiliar_hymns: string | null; unaccompanied_leading: string | null } | null;
    deadlines: Array<{ requirement: string; due_at: string }>;
    has_baseline: boolean;
    policy: unknown;
  }>;
  const deadlines = new Map<RequirementKey, string>();
  for (const item of row.deadlines) {
    if (isRequirementKey(item.requirement)) deadlines.set(item.requirement, new Date(item.due_at).toISOString());
  }
  return {
    policy: parsePolicy(row.policy),
    learningStyle: row.profile?.learning_style ?? null,
    readsSheetMusic: row.profile?.reads_sheet_music ?? null,
    availabilityReviewedAt: iso(row.profile?.availability_reviewed_at ?? null),
    instruments: row.instruments.map((item) => ({ proficiency: item.proficiency, isPrimary: item.is_primary })),
    leading: {
      experience: (row.leading?.experience ?? null) as LeadingExperience | null,
      unfamiliarHymns: (row.leading?.unfamiliar_hymns ?? null) as LeadingComfort | null,
      unaccompaniedLeading: (row.leading?.unaccompanied_leading ?? null) as LeadingComfort | null,
    },
    deadlines,
    hasBaseline: row.has_baseline,
  };
}

/**
 * Records planned deadlines (and the baseline, the first time) in one
 * transaction. ON CONFLICT DO NOTHING throughout: two sessions planning at
 * once both arrive at the same rows, and an existing deadline is never moved.
 * Returns the person's deadlines as stored afterwards.
 */
export async function recordDeadlines(
  env: ClerkEnv,
  userId: string,
  deadlines: readonly Deadline[],
  baseline: "snapshot" | "first_seen" | null,
): Promise<Map<RequirementKey, string>> {
  const sql = await db(env);
  const writes = [];
  if (deadlines.length > 0) {
    writes.push(
      sql.query(
        `INSERT INTO profile_requirement_deadlines (clerk_env, clerk_user_id, requirement, first_applied_at, due_at)
         SELECT $1, $2, d.key, d.first, d.due
           FROM jsonb_to_recordset($3::jsonb) AS d(key text, first timestamptz, due timestamptz)
         ON CONFLICT DO NOTHING`,
        [env, userId, JSON.stringify(deadlines.map((item) => ({ key: item.key, first: item.firstAppliedAt, due: item.dueAt })))],
      ),
    );
  }
  if (baseline) {
    writes.push(
      sql.query(
        `INSERT INTO profile_requirement_baselines (clerk_env, clerk_user_id, source) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [env, userId, baseline],
      ),
    );
  }
  writes.push(
    sql.query(`SELECT requirement, due_at FROM profile_requirement_deadlines WHERE clerk_env = $1 AND clerk_user_id = $2`, [env, userId]),
  );
  const results = (await sql.transaction(writes)) as unknown[];
  const rows = results[results.length - 1] as Array<{ requirement: string; due_at: string | Date }>;
  const stored = new Map<RequirementKey, string>();
  for (const item of rows) if (isRequirementKey(item.requirement)) stored.set(item.requirement, new Date(item.due_at).toISOString());
  return stored;
}

/** Deadlines as stored, for a person's admin page. */
export async function listDeadlines(env: ClerkEnv, userId: string): Promise<Array<Deadline & { extendedBy: string | null }>> {
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT requirement, first_applied_at, due_at, extended_by FROM profile_requirement_deadlines
      WHERE clerk_env = $1 AND clerk_user_id = $2 ORDER BY due_at, requirement`,
    [env, userId],
  )) as Array<{ requirement: string; first_applied_at: string | Date; due_at: string | Date; extended_by: string | null }>;
  return rows
    .filter((row) => isRequirementKey(row.requirement))
    .map((row) => ({
      key: row.requirement as RequirementKey,
      firstAppliedAt: new Date(row.first_applied_at).toISOString(),
      dueAt: new Date(row.due_at).toISOString(),
      extendedBy: row.extended_by,
    }));
}

/**
 * An administrator's "give more time": every deadline of this person's moves
 * to `days` from now (or from where it already is, if that is later). The
 * only thing that ever moves a deadline.
 */
export async function extendDeadlines(env: ClerkEnv, userId: string, days: number, actor: string): Promise<number> {
  const sql = await db(env);
  const rows = (await sql.query(
    `UPDATE profile_requirement_deadlines
        SET due_at = GREATEST(due_at, now()) + make_interval(days => $3::int), extended_by = $4
      WHERE clerk_env = $1 AND clerk_user_id = $2
      RETURNING requirement`,
    [env, userId, days, actor],
  )) as Array<{ requirement: string }>;
  return rows.length;
}

// ---------------------------------------------------------------------------
// The policy
// ---------------------------------------------------------------------------

export async function getRequirementPolicy(env: ClerkEnv): Promise<RequirementPolicy | null> {
  const sql = await db(env);
  const rows = (await sql.query(`SELECT value FROM site_settings WHERE clerk_env = $1 AND key = $2`, [env, POLICY_KEY])) as Array<{
    value: unknown;
  }>;
  return parsePolicy(rows[0]?.value);
}

/**
 * Writes the policy the first time only, and returns the one stored. Two
 * administrators pressing Activate at once both get the same activatedAt:
 * the second insert does nothing and reads the first back.
 */
export async function createPolicyOnce(env: ClerkEnv, actor: string): Promise<RequirementPolicy> {
  const sql = await db(env);
  const value = {
    version: POLICY_VERSION,
    activatedBy: actor,
    snapshot: "pending",
    snapshotCompletedAt: null,
    snapshotAccounts: null,
    pausedAt: null,
  };
  await sql.query(
    `INSERT INTO site_settings (clerk_env, key, value, updated_by)
     VALUES ($1, $2, $3::jsonb || jsonb_build_object('activatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), $4)
     ON CONFLICT (clerk_env, key) DO NOTHING`,
    [env, POLICY_KEY, JSON.stringify(value), actor],
  );
  const policy = await getRequirementPolicy(env);
  if (!policy) throw new Error("The requirements policy could not be read back.");
  return policy;
}

/**
 * Changes fields of the stored policy other than activatedAt, which is never
 * rewritten (jsonb merge, then activatedAt put back as it was).
 */
export async function patchPolicy(
  env: ClerkEnv,
  patch: Partial<Pick<RequirementPolicy, "snapshot" | "snapshotCompletedAt" | "snapshotAccounts" | "pausedAt">>,
  actor: string,
): Promise<RequirementPolicy | null> {
  const sql = await db(env);
  await sql.query(
    `UPDATE site_settings
        SET value = (value || $3::jsonb) || jsonb_build_object('activatedAt', value->'activatedAt'),
            updated_by = $4, updated_at = now()
      WHERE clerk_env = $1 AND key = $2`,
    [env, POLICY_KEY, JSON.stringify(patch), actor],
  );
  return getRequirementPolicy(env);
}

// ---------------------------------------------------------------------------
// The activation snapshot
// ---------------------------------------------------------------------------

/** Everyone's roles and exceptions, and every role's permissions - one round trip. */
export async function loadAllAuthorization(env: ClerkEnv): Promise<{
  userRoles: Map<string, string[]>;
  rolePermissions: Map<string, string[]>;
  overrides: Map<string, PermissionOverride[]>;
}> {
  const sql = await db(env);
  const [row] = (await sql.query(
    `SELECT
       COALESCE((SELECT json_agg(json_build_object('user', clerk_user_id, 'role', role_key))
                   FROM user_roles WHERE clerk_env = $1), '[]') AS user_roles,
       COALESCE((SELECT json_agg(json_build_object('role', role_key, 'permission', permission))
                   FROM role_permissions WHERE clerk_env = $1), '[]') AS role_permissions,
       COALESCE((SELECT json_agg(json_build_object('user', clerk_user_id, 'permission', permission, 'effect', effect))
                   FROM user_permission_overrides WHERE clerk_env = $1), '[]') AS overrides`,
    [env],
  )) as Array<{
    user_roles: Array<{ user: string; role: string }>;
    role_permissions: Array<{ role: string; permission: string }>;
    overrides: Array<PermissionOverride & { user: string }>;
  }>;
  const userRoles = new Map<string, string[]>();
  for (const { user, role } of row.user_roles) userRoles.set(user, [...(userRoles.get(user) ?? []), role]);
  const rolePermissions = new Map<string, string[]>();
  for (const { role, permission } of row.role_permissions) rolePermissions.set(role, [...(rolePermissions.get(role) ?? []), permission]);
  const overrides = new Map<string, PermissionOverride[]>();
  for (const { user, permission, effect } of row.overrides) overrides.set(user, [...(overrides.get(user) ?? []), { permission, effect }]);
  return { userRoles, rolePermissions, overrides };
}

/**
 * Writes one page of the snapshot: each account's deadlines and its
 * baseline, all in one transaction, all ON CONFLICT DO NOTHING - so a retry,
 * or a person already seen on their own, changes nothing already there.
 */
export async function writeSnapshotPage(
  env: ClerkEnv,
  entries: ReadonlyArray<{ userId: string; deadlines: readonly Deadline[] }>,
): Promise<void> {
  if (entries.length === 0) return;
  const sql = await db(env);
  const deadlineRows = entries.flatMap((entry) =>
    entry.deadlines.map((item) => ({ user: entry.userId, key: item.key, first: item.firstAppliedAt, due: item.dueAt })),
  );
  await sql.transaction([
    sql.query(
      `INSERT INTO profile_requirement_deadlines (clerk_env, clerk_user_id, requirement, first_applied_at, due_at)
       SELECT $1, d.user, d.key, d.first, d.due
         FROM jsonb_to_recordset($2::jsonb) AS d("user" text, key text, first timestamptz, due timestamptz)
       ON CONFLICT DO NOTHING`,
      [env, JSON.stringify(deadlineRows)],
    ),
    sql.query(
      `INSERT INTO profile_requirement_baselines (clerk_env, clerk_user_id, source)
       SELECT $1, unnest($2::text[]), 'snapshot'
       ON CONFLICT DO NOTHING`,
      [env, entries.map((entry) => entry.userId)],
    ),
  ]);
}

/** How many of these people have a baseline: the snapshot's check that nobody was missed. */
export async function countBaselines(env: ClerkEnv, userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const sql = await db(env);
  const [row] = (await sql.query(
    `SELECT count(*)::int AS n FROM profile_requirement_baselines WHERE clerk_env = $1 AND clerk_user_id = ANY($2::text[])`,
    [env, [...userIds]],
  )) as Array<{ n: number }>;
  return row.n;
}

/** People's requirement states, for Admin -> People. */
export async function overdueUserIds(env: ClerkEnv): Promise<Set<string>> {
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT DISTINCT clerk_user_id FROM profile_requirement_deadlines WHERE clerk_env = $1 AND due_at <= now()`,
    [env],
  )) as Array<{ clerk_user_id: string }>;
  return new Set(rows.map((row) => row.clerk_user_id));
}

// ---------------------------------------------------------------------------
// Song leading
// ---------------------------------------------------------------------------

export interface SongLeading {
  experience: LeadingExperience | null;
  unfamiliarHymns: LeadingComfort | null;
  unaccompaniedLeading: LeadingComfort | null;
}

export const EMPTY_SONG_LEADING: SongLeading = { experience: null, unfamiliarHymns: null, unaccompaniedLeading: null };

export async function getSongLeading(env: ClerkEnv, userId: string): Promise<SongLeading> {
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT experience, unfamiliar_hymns, unaccompanied_leading FROM user_song_leading WHERE clerk_env = $1 AND clerk_user_id = $2`,
    [env, userId],
  )) as Array<{ experience: LeadingExperience | null; unfamiliar_hymns: LeadingComfort | null; unaccompanied_leading: LeadingComfort | null }>;
  const row = rows[0];
  if (!row) return EMPTY_SONG_LEADING;
  return { experience: row.experience, unfamiliarHymns: row.unfamiliar_hymns, unaccompaniedLeading: row.unaccompanied_leading };
}

export async function saveSongLeading(env: ClerkEnv, userId: string, values: SongLeading): Promise<void> {
  const sql = await db(env);
  await sql.query(
    `INSERT INTO user_song_leading (clerk_env, clerk_user_id, experience, unfamiliar_hymns, unaccompanied_leading)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (clerk_env, clerk_user_id) DO UPDATE SET
       experience = EXCLUDED.experience, unfamiliar_hymns = EXCLUDED.unfamiliar_hymns,
       unaccompanied_leading = EXCLUDED.unaccompanied_leading, updated_at = now()`,
    [env, userId, values.experience, values.unfamiliarHymns, values.unaccompaniedLeading],
  );
}

// ---------------------------------------------------------------------------
// Onboarding's optional steps
// ---------------------------------------------------------------------------

export async function getOnboardingProgress(env: ClerkEnv, userId: string): Promise<Set<string>> {
  const sql = await db(env);
  const rows = (await sql.query(`SELECT step FROM onboarding_progress WHERE clerk_env = $1 AND clerk_user_id = $2`, [env, userId])) as Array<{
    step: string;
  }>;
  return new Set(rows.map((row) => row.step));
}

export async function markOnboardingStep(env: ClerkEnv, userId: string, step: string): Promise<void> {
  const sql = await db(env);
  await sql.query(
    `INSERT INTO onboarding_progress (clerk_env, clerk_user_id, step) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [env, userId, step],
  );
}

/** "Replay the introduction": forgets only the optional walkthrough steps. */
export async function resetOnboardingSteps(env: ClerkEnv, userId: string, steps: readonly string[]): Promise<void> {
  const sql = await db(env);
  await sql.query(`DELETE FROM onboarding_progress WHERE clerk_env = $1 AND clerk_user_id = $2 AND step = ANY($3::text[])`, [
    env,
    userId,
    [...steps],
  ]);
}
