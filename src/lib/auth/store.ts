import "server-only";

import type { NeonQueryFunction } from "@neondatabase/serverless";

import { getSql } from "@/lib/db";
import type { SheetMusicType } from "@/lib/sheet-music-type";

import type { ClerkEnv } from "./clerk-env";
import { ADMIN_ROLE, DEFAULT_ROLES, type OverrideEffect, type PermissionOverride } from "./permissions";
import {
  DEFAULT_INSTRUMENTS,
  DEFAULT_TITLES,
  type LearningStyle,
  type Proficiency,
  type ServiceAvailability,
  type TheoryLevel,
  type VoicePart,
} from "./profile-options";
import type { RequestStatus } from "./request-status";
import { AUTH_SCHEMA } from "./schema.mjs";

/**
 * Reading and writing the account tables (see schema.mjs). Every function
 * takes the Clerk environment and filters on it - Local, Preview and
 * Production share one database.
 *
 * This module does no authorization of its own: callers go through
 * session.ts, which checks who is asking before anything here runs.
 */

type Sql = NeonQueryFunction<false, false>;

export class AccountsUnavailableError extends Error {
  constructor() {
    super("DATABASE_URL is not set");
    this.name = "AccountsUnavailableError";
  }
}

let schemaReady = false;
const seeded = new Set<ClerkEnv>();

/** The query function, with the tables created and the defaults seeded for `env`. */
async function db(env: ClerkEnv): Promise<Sql> {
  const sql = getSql();
  if (!sql) throw new AccountsUnavailableError();
  if (!schemaReady) {
    for (const statement of AUTH_SCHEMA) await sql.query(statement);
    schemaReady = true;
  }
  if (!seeded.has(env)) {
    await seedDefaults(sql, env);
    seeded.add(env);
  }
  return sql;
}

/**
 * Writes the starting roles, titles and instruments - once. A role's
 * permissions are only written when the role itself is new, and the lists only
 * when they are empty, so nothing an administrator has changed is ever put back.
 */
async function seedDefaults(sql: Sql, env: ClerkEnv): Promise<void> {
  for (const [index, role] of DEFAULT_ROLES.entries()) {
    const inserted = (await sql.query(
      `INSERT INTO roles (clerk_env, key, label, description, is_system, created_at)
       VALUES ($1, $2, $3, $4, true, now() + ($5 || ' milliseconds')::interval)
       ON CONFLICT DO NOTHING RETURNING key`,
      [env, role.key, role.label, role.description, String(index)],
    )) as Array<{ key: string }>;
    if (inserted.length > 0 && role.key !== ADMIN_ROLE && role.permissions.length > 0) {
      await sql.query(
        `INSERT INTO role_permissions (clerk_env, role_key, permission)
         SELECT $1, $2, unnest($3::text[]) ON CONFLICT DO NOTHING`,
        [env, role.key, role.permissions],
      );
    }
  }
  for (const [table, labels] of [
    ["instruments", DEFAULT_INSTRUMENTS],
    ["titles", DEFAULT_TITLES],
  ] as const) {
    await sql.query(
      `INSERT INTO ${table} (clerk_env, label, sort_order)
       SELECT $1, t.label, t.ord FROM unnest($2::text[]) WITH ORDINALITY AS t(label, ord)
        WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE clerk_env = $1)
       ON CONFLICT DO NOTHING`,
      [env, labels],
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

// ---------------------------------------------------------------------------
// Roles and permissions
// ---------------------------------------------------------------------------

export interface RoleRow {
  key: string;
  label: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
}

export async function listRoles(env: ClerkEnv): Promise<RoleRow[]> {
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT r.key, r.label, r.description, r.is_system,
            COALESCE((SELECT array_agg(p.permission ORDER BY p.permission) FROM role_permissions p
                       WHERE p.clerk_env = r.clerk_env AND p.role_key = r.key), '{}') AS permissions,
            (SELECT count(*) FROM user_roles u WHERE u.clerk_env = r.clerk_env AND u.role_key = r.key)::int AS member_count
       FROM roles r
      WHERE r.clerk_env = $1
      ORDER BY r.is_system DESC, r.created_at, r.label`,
    [env],
  )) as Array<{ key: string; label: string; description: string; is_system: boolean; permissions: string[]; member_count: number }>;
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    description: row.description,
    isSystem: row.is_system,
    permissions: row.permissions,
    memberCount: row.member_count,
  }));
}

export async function getRole(env: ClerkEnv, key: string): Promise<RoleRow | null> {
  return (await listRoles(env)).find((role) => role.key === key) ?? null;
}

/** Everything needed to work out one person's permissions, in one round trip. */
export async function loadAuthorization(
  env: ClerkEnv,
  userId: string,
): Promise<{ roleKeys: string[]; rolePermissions: Map<string, string[]>; overrides: PermissionOverride[] }> {
  const sql = await db(env);
  const [row] = (await sql.query(
    `SELECT
       COALESCE((SELECT array_agg(role_key) FROM user_roles WHERE clerk_env = $1 AND clerk_user_id = $2), '{}') AS role_keys,
       COALESCE((SELECT json_agg(json_build_object('role', role_key, 'permission', permission))
                   FROM role_permissions WHERE clerk_env = $1), '[]') AS role_permissions,
       COALESCE((SELECT json_agg(json_build_object('permission', permission, 'effect', effect))
                   FROM user_permission_overrides WHERE clerk_env = $1 AND clerk_user_id = $2), '[]') AS overrides`,
    [env, userId],
  )) as Array<{
    role_keys: string[];
    role_permissions: Array<{ role: string; permission: string }>;
    overrides: PermissionOverride[];
  }>;

  const rolePermissions = new Map<string, string[]>();
  for (const { role, permission } of row.role_permissions) {
    rolePermissions.set(role, [...(rolePermissions.get(role) ?? []), permission]);
  }
  return { roleKeys: row.role_keys, rolePermissions, overrides: row.overrides };
}

/** Role keys for many users at once (for the user list). */
export async function rolesForUsers(env: ClerkEnv, userIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (userIds.length === 0) return result;
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT clerk_user_id, role_key FROM user_roles WHERE clerk_env = $1 AND clerk_user_id = ANY($2::text[])`,
    [env, userIds],
  )) as Array<{ clerk_user_id: string; role_key: string }>;
  for (const row of rows) result.set(row.clerk_user_id, [...(result.get(row.clerk_user_id) ?? []), row.role_key]);
  return result;
}

export async function userIdsWithRole(env: ClerkEnv, roleKey: string): Promise<string[]> {
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT clerk_user_id FROM user_roles WHERE clerk_env = $1 AND role_key = $2 ORDER BY granted_at`,
    [env, roleKey],
  )) as Array<{ clerk_user_id: string }>;
  return rows.map((row) => row.clerk_user_id);
}

export async function createRole(
  env: ClerkEnv,
  role: { key: string; label: string; description: string; permissions: string[] },
): Promise<"created" | "exists"> {
  const sql = await db(env);
  try {
    await sql.transaction((txn) => [
      txn.query(
        `INSERT INTO roles (clerk_env, key, label, description, is_system) VALUES ($1, $2, $3, $4, false)`,
        [env, role.key, role.label, role.description],
      ),
      txn.query(
        `INSERT INTO role_permissions (clerk_env, role_key, permission) SELECT $1, $2, unnest($3::text[])`,
        [env, role.key, role.permissions],
      ),
    ]);
    return "created";
  } catch (error) {
    if (isUniqueViolation(error)) return "exists";
    throw error;
  }
}

/** Renames a role and replaces its permissions. Never called for the administrator role. */
export async function updateRole(
  env: ClerkEnv,
  key: string,
  role: { label: string; description: string; permissions: string[] },
): Promise<void> {
  const sql = await db(env);
  await sql.transaction((txn) => [
    txn.query(`UPDATE roles SET label = $3, description = $4 WHERE clerk_env = $1 AND key = $2`, [
      env,
      key,
      role.label,
      role.description,
    ]),
    txn.query(`DELETE FROM role_permissions WHERE clerk_env = $1 AND role_key = $2`, [env, key]),
    txn.query(
      `INSERT INTO role_permissions (clerk_env, role_key, permission) SELECT $1, $2, unnest($3::text[])`,
      [env, key, role.permissions],
    ),
  ]);
}

/** Deletes a custom role; its assignments go with it (ON DELETE CASCADE). */
export async function deleteRole(env: ClerkEnv, key: string): Promise<void> {
  const sql = await db(env);
  await sql.query(`DELETE FROM roles WHERE clerk_env = $1 AND key = $2 AND is_system = false`, [env, key]);
}

export async function assignRole(env: ClerkEnv, userId: string, roleKey: string, grantedBy: string): Promise<void> {
  const sql = await db(env);
  await sql.query(
    `INSERT INTO user_roles (clerk_env, clerk_user_id, role_key, granted_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [env, userId, roleKey, grantedBy],
  );
}

/**
 * Removes a role. Removing the administrator role from the last administrator
 * is refused inside the same statement, so two admins demoting each other at
 * the same moment cannot leave the site with none.
 */
export async function removeRole(
  env: ClerkEnv,
  userId: string,
  roleKey: string,
): Promise<"removed" | "last-admin"> {
  const sql = await db(env);
  const rows = (await sql.query(
    `DELETE FROM user_roles
      WHERE clerk_env = $1 AND clerk_user_id = $2 AND role_key = $3
        AND ($3 <> $4 OR (SELECT count(*) FROM user_roles WHERE clerk_env = $1 AND role_key = $4) > 1)
      RETURNING role_key`,
    [env, userId, roleKey, ADMIN_ROLE],
  )) as Array<{ role_key: string }>;
  if (rows.length > 0) return "removed";
  return roleKey === ADMIN_ROLE ? "last-admin" : "removed";
}

export async function countAdmins(env: ClerkEnv): Promise<number> {
  return (await userIdsWithRole(env, ADMIN_ROLE)).length;
}

export interface OverrideRow extends PermissionOverride {
  note: string;
  setBy: string | null;
  setAt: string;
}

export async function listOverrides(env: ClerkEnv, userId: string): Promise<OverrideRow[]> {
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT permission, effect, note, set_by, set_at FROM user_permission_overrides
      WHERE clerk_env = $1 AND clerk_user_id = $2 ORDER BY permission`,
    [env, userId],
  )) as Array<{ permission: string; effect: OverrideEffect; note: string; set_by: string | null; set_at: Date | string }>;
  return rows.map((row) => ({
    permission: row.permission,
    effect: row.effect,
    note: row.note,
    setBy: row.set_by,
    setAt: new Date(row.set_at).toISOString(),
  }));
}

export async function setOverride(
  env: ClerkEnv,
  userId: string,
  override: { permission: string; effect: OverrideEffect; note: string },
  setBy: string,
): Promise<void> {
  const sql = await db(env);
  await sql.query(
    `INSERT INTO user_permission_overrides (clerk_env, clerk_user_id, permission, effect, note, set_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (clerk_env, clerk_user_id, permission)
     DO UPDATE SET effect = EXCLUDED.effect, note = EXCLUDED.note, set_by = EXCLUDED.set_by, set_at = now()`,
    [env, userId, override.permission, override.effect, override.note, setBy],
  );
}

export async function removeOverride(env: ClerkEnv, userId: string, permission: string): Promise<void> {
  const sql = await db(env);
  await sql.query(
    `DELETE FROM user_permission_overrides WHERE clerk_env = $1 AND clerk_user_id = $2 AND permission = $3`,
    [env, userId, permission],
  );
}

/** Everything the site holds about a person, for when their account is deleted. */
export async function deleteUserData(env: ClerkEnv, userId: string): Promise<void> {
  const sql = await db(env);
  await sql.transaction((txn) =>
    [
      "user_roles",
      "user_permission_overrides",
      "user_profiles",
      "user_instruments",
      "user_titles",
      "user_sheet_music",
    ].map((table) =>
      txn.query(`DELETE FROM ${table} WHERE clerk_env = $1 AND clerk_user_id = $2`, [env, userId]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Account requests
// ---------------------------------------------------------------------------

export interface AccountRequest {
  id: number;
  name: string;
  email: string;
  message: string;
  status: RequestStatus;
  clerkInvitationId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
}

interface RequestRowDb {
  id: number;
  name: string;
  email: string;
  message: string;
  status: RequestStatus;
  clerk_invitation_id: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  review_note: string;
  created_at: Date | string;
  updated_at: Date | string;
}

const REQUEST_COLUMNS = `id, name, email, message, status, clerk_invitation_id, reviewed_by, reviewed_at, review_note, created_at, updated_at`;

function toRequest(row: RequestRowDb): AccountRequest {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    message: row.message,
    status: row.status,
    clerkInvitationId: row.clerk_invitation_id,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    reviewNote: row.review_note,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** Records a request, or reports that an open one already exists for this address. */
export async function createRequest(
  env: ClerkEnv,
  request: { name: string; email: string; emailNormalized: string; message: string },
): Promise<{ created: true; id: number } | { created: false }> {
  const sql = await db(env);
  try {
    const rows = (await sql.query(
      `INSERT INTO account_requests (clerk_env, name, email, email_normalized, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [env, request.name, request.email, request.emailNormalized, request.message],
    )) as Array<{ id: number }>;
    return { created: true, id: rows[0].id };
  } catch (error) {
    if (isUniqueViolation(error)) return { created: false };
    throw error;
  }
}

export async function listRequests(env: ClerkEnv, status?: RequestStatus): Promise<AccountRequest[]> {
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT ${REQUEST_COLUMNS} FROM account_requests
      WHERE clerk_env = $1 AND ($2::text IS NULL OR status = $2)
      ORDER BY (status = 'pending') DESC, created_at DESC
      LIMIT 200`,
    [env, status ?? null],
  )) as RequestRowDb[];
  return rows.map(toRequest);
}

export async function getRequest(env: ClerkEnv, id: number): Promise<AccountRequest | null> {
  const sql = await db(env);
  const rows = (await sql.query(`SELECT ${REQUEST_COLUMNS} FROM account_requests WHERE clerk_env = $1 AND id = $2`, [
    env,
    id,
  ])) as RequestRowDb[];
  return rows[0] ? toRequest(rows[0]) : null;
}

export async function countRequestsByStatus(env: ClerkEnv): Promise<Record<RequestStatus, number>> {
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT status, count(*)::int AS count FROM account_requests WHERE clerk_env = $1 GROUP BY status`,
    [env],
  )) as Array<{ status: RequestStatus; count: number }>;
  const counts = { pending: 0, invited: 0, active: 0, rejected: 0, revoked: 0, expired: 0 };
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

/**
 * Moves a pending request to "invited" before the invitation is sent. Only one
 * administrator can win this, so a request is never approved twice.
 */
export async function claimRequestForApproval(
  env: ClerkEnv,
  id: number,
  reviewer: string,
): Promise<AccountRequest | null> {
  const sql = await db(env);
  const rows = (await sql.query(
    `UPDATE account_requests
        SET status = 'invited', reviewed_by = $3, reviewed_at = now(), updated_at = now()
      WHERE clerk_env = $1 AND id = $2 AND status = 'pending'
      RETURNING ${REQUEST_COLUMNS}`,
    [env, id, reviewer],
  )) as RequestRowDb[];
  return rows[0] ? toRequest(rows[0]) : null;
}

/** Undoes claimRequestForApproval when the invitation could not be sent. */
export async function releaseRequestClaim(env: ClerkEnv, id: number): Promise<void> {
  const sql = await db(env);
  await sql.query(
    `UPDATE account_requests SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL, updated_at = now()
      WHERE clerk_env = $1 AND id = $2 AND status = 'invited' AND clerk_invitation_id IS NULL`,
    [env, id],
  );
}

export async function recordRequestInvitation(env: ClerkEnv, id: number, invitationId: string): Promise<void> {
  const sql = await db(env);
  await sql.query(
    `UPDATE account_requests SET clerk_invitation_id = $3, updated_at = now() WHERE clerk_env = $1 AND id = $2`,
    [env, id, invitationId],
  );
}

export async function rejectRequest(
  env: ClerkEnv,
  id: number,
  reviewer: string,
  note: string,
): Promise<boolean> {
  const sql = await db(env);
  const rows = (await sql.query(
    `UPDATE account_requests
        SET status = 'rejected', reviewed_by = $3, reviewed_at = now(), review_note = $4, updated_at = now()
      WHERE clerk_env = $1 AND id = $2 AND status = 'pending'
      RETURNING id`,
    [env, id, reviewer, note],
  )) as Array<{ id: number }>;
  return rows.length > 0;
}

/** Brings "invited" requests up to date. Only rows still "invited" are touched. */
export async function setRequestStatuses(
  env: ClerkEnv,
  updates: Array<{ id: number; status: RequestStatus }>,
): Promise<void> {
  if (updates.length === 0) return;
  const sql = await db(env);
  await sql.query(
    `UPDATE account_requests r SET status = u.status, updated_at = now()
       FROM jsonb_to_recordset($2::jsonb) AS u(id int, status text)
      WHERE r.clerk_env = $1 AND r.id = u.id AND r.status = 'invited'`,
    [env, JSON.stringify(updates)],
  );
}

/** Marks the open request for any of these addresses active - called when someone signs in. */
export async function activateRequestsFor(env: ClerkEnv, emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  const sql = await db(env);
  await sql.query(
    `UPDATE account_requests SET status = 'active', updated_at = now()
      WHERE clerk_env = $1 AND status = 'invited' AND email_normalized = ANY($2::text[])`,
    [env, emails],
  );
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export interface ProfileData {
  middleName: string;
  preferredName: string;
  bio: string;
  phone: string;
  voicePart: VoicePart | null;
  serviceAvailability: ServiceAvailability[];
  learningStyle: LearningStyle | null;
  theoryLevel: TheoryLevel | null;
  readsSheetMusic: boolean | null;
}

export const EMPTY_PROFILE: ProfileData = {
  middleName: "",
  preferredName: "",
  bio: "",
  phone: "",
  voicePart: null,
  serviceAvailability: [],
  learningStyle: null,
  theoryLevel: null,
  readsSheetMusic: null,
};

export async function getProfile(env: ClerkEnv, userId: string): Promise<ProfileData & { updatedAt: string | null }> {
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT middle_name, preferred_name, bio, phone, voice_part, service_availability, learning_style,
            theory_level, reads_sheet_music, updated_at
       FROM user_profiles WHERE clerk_env = $1 AND clerk_user_id = $2`,
    [env, userId],
  )) as Array<{
    middle_name: string;
    preferred_name: string;
    bio: string;
    phone: string;
    voice_part: VoicePart | null;
    service_availability: ServiceAvailability[];
    learning_style: LearningStyle | null;
    theory_level: TheoryLevel | null;
    reads_sheet_music: boolean | null;
    updated_at: Date | string;
  }>;
  const row = rows[0];
  if (!row) return { ...EMPTY_PROFILE, updatedAt: null };
  return {
    middleName: row.middle_name,
    preferredName: row.preferred_name,
    bio: row.bio,
    phone: row.phone,
    voicePart: row.voice_part,
    serviceAvailability: row.service_availability,
    learningStyle: row.learning_style,
    theoryLevel: row.theory_level,
    readsSheetMusic: row.reads_sheet_music,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * Saves a profile and the person's instruments together, so a half-saved
 * profile never shows.
 */
export async function saveProfile(
  env: ClerkEnv,
  userId: string,
  profile: ProfileData,
  instruments: Array<{ instrumentId: number; proficiency: Proficiency; isPrimary: boolean }>,
): Promise<void> {
  const sql = await db(env);
  await sql.transaction((txn) => [
    txn.query(
      `INSERT INTO user_profiles (clerk_env, clerk_user_id, middle_name, preferred_name, bio, phone, voice_part,
                                  service_availability, learning_style, theory_level, reads_sheet_music)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11)
       ON CONFLICT (clerk_env, clerk_user_id) DO UPDATE SET
         middle_name = EXCLUDED.middle_name, preferred_name = EXCLUDED.preferred_name, bio = EXCLUDED.bio,
         phone = EXCLUDED.phone, voice_part = EXCLUDED.voice_part,
         service_availability = EXCLUDED.service_availability, learning_style = EXCLUDED.learning_style,
         theory_level = EXCLUDED.theory_level, reads_sheet_music = EXCLUDED.reads_sheet_music, updated_at = now()`,
      [
        env,
        userId,
        profile.middleName,
        profile.preferredName,
        profile.bio,
        profile.phone,
        profile.voicePart,
        profile.serviceAvailability,
        profile.learningStyle,
        profile.theoryLevel,
        profile.readsSheetMusic,
      ],
    ),
    txn.query(`DELETE FROM user_instruments WHERE clerk_env = $1 AND clerk_user_id = $2`, [env, userId]),
    // Only instruments that exist in this environment's list can be saved.
    txn.query(
      `INSERT INTO user_instruments (clerk_env, clerk_user_id, instrument_id, proficiency, is_primary)
       SELECT $1, $2, x.instrument_id, x.proficiency, x.is_primary
         FROM jsonb_to_recordset($3::jsonb) AS x(instrument_id int, proficiency text, is_primary boolean)
         JOIN instruments i ON i.id = x.instrument_id AND i.clerk_env = $1`,
      [
        env,
        userId,
        JSON.stringify(
          instruments.map((item) => ({
            instrument_id: item.instrumentId,
            proficiency: item.proficiency,
            is_primary: item.isPrimary,
          })),
        ),
      ],
    ),
  ]);
}

export interface UserInstrument {
  instrumentId: number;
  label: string;
  proficiency: Proficiency;
  isPrimary: boolean;
}

export async function getUserInstruments(env: ClerkEnv, userId: string): Promise<UserInstrument[]> {
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT ui.instrument_id, i.label, ui.proficiency, ui.is_primary
       FROM user_instruments ui JOIN instruments i ON i.id = ui.instrument_id
      WHERE ui.clerk_env = $1 AND ui.clerk_user_id = $2
      ORDER BY ui.is_primary DESC, i.sort_order, i.label`,
    [env, userId],
  )) as Array<{ instrument_id: number; label: string; proficiency: Proficiency; is_primary: boolean }>;
  return rows.map((row) => ({
    instrumentId: row.instrument_id,
    label: row.label,
    proficiency: row.proficiency,
    isPrimary: row.is_primary,
  }));
}

// ---------------------------------------------------------------------------
// Assigned sheet music
// ---------------------------------------------------------------------------

/** The sheet music type assigned to each person. Anyone without one is absent from the map. */
export async function sheetMusicTypesForUsers(env: ClerkEnv, userIds: string[]): Promise<Map<string, SheetMusicType>> {
  const result = new Map<string, SheetMusicType>();
  if (userIds.length === 0) return result;
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT clerk_user_id, variant, instrument FROM user_sheet_music
      WHERE clerk_env = $1 AND clerk_user_id = ANY($2::text[])`,
    [env, userIds],
  )) as Array<{ clerk_user_id: string; variant: string; instrument: string | null }>;
  for (const row of rows) result.set(row.clerk_user_id, { variant: row.variant, instrument: row.instrument });
  return result;
}

export async function getSheetMusicType(env: ClerkEnv, userId: string): Promise<SheetMusicType | null> {
  return (await sheetMusicTypesForUsers(env, [userId])).get(userId) ?? null;
}

/** Assigns a person's sheet music type, or clears it (null). */
export async function setSheetMusicType(
  env: ClerkEnv,
  userId: string,
  type: SheetMusicType | null,
  assignedBy: string,
): Promise<void> {
  const sql = await db(env);
  if (!type) {
    await sql.query(`DELETE FROM user_sheet_music WHERE clerk_env = $1 AND clerk_user_id = $2`, [env, userId]);
    return;
  }
  await sql.query(
    `INSERT INTO user_sheet_music (clerk_env, clerk_user_id, variant, instrument, assigned_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (clerk_env, clerk_user_id) DO UPDATE SET
       variant = EXCLUDED.variant, instrument = EXCLUDED.instrument,
       assigned_by = EXCLUDED.assigned_by, assigned_at = now()`,
    [env, userId, type.variant, type.instrument, assignedBy],
  );
}

/** How many instruments each person lists. Anyone listing none is absent from the map. */
export async function instrumentCountsForUsers(env: ClerkEnv, userIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (userIds.length === 0) return result;
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT clerk_user_id, count(*)::int AS count FROM user_instruments
      WHERE clerk_env = $1 AND clerk_user_id = ANY($2::text[])
      GROUP BY clerk_user_id`,
    [env, userIds],
  )) as Array<{ clerk_user_id: string; count: number }>;
  for (const row of rows) result.set(row.clerk_user_id, row.count);
  return result;
}

export interface UserTitle {
  titleId: number;
  label: string;
  isPrimary: boolean;
}

export async function getUserTitles(env: ClerkEnv, userId: string): Promise<UserTitle[]> {
  return (await titlesForUsers(env, [userId])).get(userId) ?? [];
}

/** Titles for many users at once, primary first. */
export async function titlesForUsers(env: ClerkEnv, userIds: string[]): Promise<Map<string, UserTitle[]>> {
  const result = new Map<string, UserTitle[]>();
  if (userIds.length === 0) return result;
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT ut.clerk_user_id, ut.title_id, t.label, ut.is_primary
       FROM user_titles ut JOIN titles t ON t.id = ut.title_id
      WHERE ut.clerk_env = $1 AND ut.clerk_user_id = ANY($2::text[])
      ORDER BY ut.is_primary DESC, t.sort_order, t.label`,
    [env, userIds],
  )) as Array<{ clerk_user_id: string; title_id: number; label: string; is_primary: boolean }>;
  for (const row of rows) {
    const list = result.get(row.clerk_user_id) ?? [];
    list.push({ titleId: row.title_id, label: row.label, isPrimary: row.is_primary });
    result.set(row.clerk_user_id, list);
  }
  return result;
}

/** Replaces a person's titles. The primary one must be among them (or it falls to the first). */
export async function setUserTitles(
  env: ClerkEnv,
  userId: string,
  titleIds: number[],
  primaryId: number | null,
  assignedBy: string,
): Promise<void> {
  const sql = await db(env);
  const primary = primaryId !== null && titleIds.includes(primaryId) ? primaryId : (titleIds[0] ?? null);
  await sql.transaction((txn) => [
    txn.query(`DELETE FROM user_titles WHERE clerk_env = $1 AND clerk_user_id = $2`, [env, userId]),
    txn.query(
      `INSERT INTO user_titles (clerk_env, clerk_user_id, title_id, is_primary, assigned_by)
       SELECT $1, $2, t.id, t.id = $4, $5 FROM titles t WHERE t.clerk_env = $1 AND t.id = ANY($3::int[])`,
      [env, userId, titleIds, primary, assignedBy],
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Title and instrument lists
// ---------------------------------------------------------------------------

export type OptionList = "titles" | "instruments";

export interface OptionItem {
  id: number;
  label: string;
  sortOrder: number;
  archived: boolean;
  usage: number;
}

export async function listOptions(env: ClerkEnv, list: OptionList): Promise<OptionItem[]> {
  const sql = await db(env);
  const usageTable = list === "titles" ? "user_titles" : "user_instruments";
  const idColumn = list === "titles" ? "title_id" : "instrument_id";
  const rows = (await sql.query(
    `SELECT o.id, o.label, o.sort_order, o.archived,
            (SELECT count(*) FROM ${usageTable} u WHERE u.${idColumn} = o.id)::int AS usage
       FROM ${list} o WHERE o.clerk_env = $1 ORDER BY o.archived, o.sort_order, o.label`,
    [env],
  )) as Array<{ id: number; label: string; sort_order: number; archived: boolean; usage: number }>;
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
    archived: row.archived,
    usage: row.usage,
  }));
}

export async function addOption(env: ClerkEnv, list: OptionList, label: string): Promise<"added" | "exists"> {
  const sql = await db(env);
  try {
    await sql.query(
      `INSERT INTO ${list} (clerk_env, label, sort_order)
       VALUES ($1, $2, COALESCE((SELECT max(sort_order) + 1 FROM ${list} WHERE clerk_env = $1), 1))`,
      [env, label],
    );
    return "added";
  } catch (error) {
    if (isUniqueViolation(error)) return "exists";
    throw error;
  }
}

export async function renameOption(
  env: ClerkEnv,
  list: OptionList,
  id: number,
  label: string,
): Promise<"renamed" | "exists"> {
  const sql = await db(env);
  try {
    await sql.query(`UPDATE ${list} SET label = $3 WHERE clerk_env = $1 AND id = $2`, [env, id, label]);
    return "renamed";
  } catch (error) {
    if (isUniqueViolation(error)) return "exists";
    throw error;
  }
}

export async function setOptionArchived(env: ClerkEnv, list: OptionList, id: number, archived: boolean): Promise<void> {
  const sql = await db(env);
  await sql.query(`UPDATE ${list} SET archived = $3 WHERE clerk_env = $1 AND id = $2`, [env, id, archived]);
}

/** Swaps an item with its neighbour in the list. */
export async function moveOption(env: ClerkEnv, list: OptionList, id: number, direction: "up" | "down"): Promise<void> {
  const items = (await listOptions(env, list)).filter((item) => !item.archived);
  const index = items.findIndex((item) => item.id === id);
  const other = items[direction === "up" ? index - 1 : index + 1];
  if (index < 0 || !other) return;
  const sql = await db(env);
  // Renumber everything so equal sort orders (from older rows) cannot stall a move.
  const order = items.map((item) => item.id);
  [order[index], order[direction === "up" ? index - 1 : index + 1]] = [other.id, id];
  await sql.query(
    `UPDATE ${list} o SET sort_order = x.ord
       FROM unnest($2::int[]) WITH ORDINALITY AS x(id, ord)
      WHERE o.clerk_env = $1 AND o.id = x.id`,
    [env, order],
  );
}

/** An invitation revoked from /admin/invitations closes the request that led to it. */
export async function markInvitationRevoked(env: ClerkEnv, invitationId: string): Promise<void> {
  const sql = await db(env);
  await sql.query(
    `UPDATE account_requests SET status = 'revoked', updated_at = now()
      WHERE clerk_env = $1 AND clerk_invitation_id = $2 AND status = 'invited'`,
    [env, invitationId],
  );
}

// ---------------------------------------------------------------------------
// Roles chosen at invitation time
// ---------------------------------------------------------------------------

/**
 * Remembers the roles to give whoever accepts this invitation. Any earlier,
 * still-unused choice for the same address is replaced, so re-inviting
 * someone with different roles does what it looks like.
 */
export async function setInvitationRoles(
  env: ClerkEnv,
  invitationId: string,
  emailNormalized: string,
  roleKeys: string[],
  assignedBy: string,
): Promise<void> {
  if (roleKeys.length === 0) return;
  const sql = await db(env);
  await sql.transaction((txn) => [
    txn.query(
      `DELETE FROM invitation_roles WHERE clerk_env = $1 AND email_normalized = $2 AND applied_at IS NULL`,
      [env, emailNormalized],
    ),
    txn.query(
      `INSERT INTO invitation_roles (clerk_env, clerk_invitation_id, email_normalized, role_key, assigned_by)
       SELECT $1, $2, $3, r.key, $5 FROM roles r WHERE r.clerk_env = $1 AND r.key = ANY($4::text[])`,
      [env, invitationId, emailNormalized, roleKeys, assignedBy],
    ),
  ]);
}

/** Role keys chosen for each invitation not yet used, by invitation ID. */
export async function pendingInvitationRoles(env: ClerkEnv): Promise<Map<string, string[]>> {
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT clerk_invitation_id, role_key FROM invitation_roles WHERE clerk_env = $1 AND applied_at IS NULL`,
    [env],
  )) as Array<{ clerk_invitation_id: string; role_key: string }>;
  const result = new Map<string, string[]>();
  for (const row of rows) {
    result.set(row.clerk_invitation_id, [...(result.get(row.clerk_invitation_id) ?? []), row.role_key]);
  }
  return result;
}

export async function deleteInvitationRoles(env: ClerkEnv, invitationId: string): Promise<void> {
  const sql = await db(env);
  await sql.query(`DELETE FROM invitation_roles WHERE clerk_env = $1 AND clerk_invitation_id = $2`, [env, invitationId]);
}

/** Cheap check before looking up anyone's email: is any invitation waiting to hand out roles? */
export async function hasPendingInvitationRoles(env: ClerkEnv): Promise<boolean> {
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT 1 FROM invitation_roles WHERE clerk_env = $1 AND applied_at IS NULL LIMIT 1`,
    [env],
  )) as unknown[];
  return rows.length > 0;
}

/**
 * Gives a newly joined person the roles chosen when they were invited.
 * Accounts can only be created through an invitation (Clerk's Access mode is
 * Invite-only), and Clerk only lets someone accept an invitation sent to an
 * address they control, so matching on their verified email is safe. Returns
 * how many roles were given.
 */
export async function applyInvitationRoles(env: ClerkEnv, userId: string, emailsNormalized: string[]): Promise<number> {
  if (emailsNormalized.length === 0) return 0;
  const sql = await db(env);
  const [inserted] = await sql.transaction((txn) => [
    txn.query(
      `INSERT INTO user_roles (clerk_env, clerk_user_id, role_key, granted_by)
       SELECT clerk_env, $2, role_key, assigned_by FROM invitation_roles
        WHERE clerk_env = $1 AND email_normalized = ANY($3::text[]) AND applied_at IS NULL
       ON CONFLICT DO NOTHING
       RETURNING role_key`,
      [env, userId, emailsNormalized],
    ),
    txn.query(
      `UPDATE invitation_roles SET applied_at = now()
        WHERE clerk_env = $1 AND email_normalized = ANY($2::text[]) AND applied_at IS NULL`,
      [env, emailsNormalized],
    ),
  ]);
  return (inserted as unknown[]).length;
}
