import "server-only";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import type { PermissionOverride } from "@/lib/auth/permissions";
import type { ServiceAvailability } from "@/lib/auth/profile-options";
import { db } from "@/lib/auth/store";
import type { ServiceSlot } from "@/types/song-list";

import { availabilityRosterIds } from "./access";
import type { ExceptionRecord } from "./board";
import type { ExceptionStatus } from "./effective";

/**
 * Reading and writing availability: normal services (the existing
 * user_profiles.service_availability column) and dated exceptions
 * (availability_exceptions). Shares the account tables' connection, schema
 * and Clerk-environment filtering (db() in src/lib/auth/store.ts).
 *
 * No authorization happens here: the server actions in
 * src/app/availability/actions.ts decide who may change what first.
 */

interface ExceptionRowDb {
  clerk_user_id: string;
  service_date: string;
  slot: ServiceSlot;
  status: ExceptionStatus;
  note: string | null;
}

const toRecord = (row: ExceptionRowDb): ExceptionRecord => ({
  userId: row.clerk_user_id,
  date: row.service_date,
  slot: row.slot,
  status: row.status,
  note: row.note,
});

/** Every exception for services from `from` to `to` (both included). */
export async function listExceptions(env: ClerkEnv, from: string, to: string): Promise<ExceptionRecord[]> {
  const sql = await db(env);
  const rows = (await sql.query(
    `SELECT clerk_user_id, to_char(service_date, 'YYYY-MM-DD') AS service_date, slot, status, note
       FROM availability_exceptions
      WHERE clerk_env = $1 AND service_date BETWEEN $2::date AND $3::date
      ORDER BY service_date, slot`,
    [env, from, to],
  )) as ExceptionRowDb[];
  return rows.map(toRecord);
}

/** Records (or replaces) one person's exceptions, one per service. */
export async function upsertExceptions(
  env: ClerkEnv,
  userId: string,
  rows: ReadonlyArray<{ date: string; slot: ServiceSlot; status: ExceptionStatus; note: string | null }>,
  actorId: string,
): Promise<void> {
  if (rows.length === 0) return;
  const sql = await db(env);
  await sql.query(
    `INSERT INTO availability_exceptions
       (clerk_env, clerk_user_id, service_date, slot, status, note, created_by, updated_by)
     SELECT $1, $2, x.service_date, x.slot, x.status, x.note, $4, $4
       FROM jsonb_to_recordset($3::jsonb) AS x(service_date date, slot text, status text, note text)
     ON CONFLICT (clerk_env, clerk_user_id, service_date, slot) DO UPDATE SET
       status = EXCLUDED.status, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [
      env,
      userId,
      JSON.stringify(rows.map((row) => ({ service_date: row.date, slot: row.slot, status: row.status, note: row.note }))),
      actorId,
    ],
  );
}

/** Removes one person's exceptions for these services - back to normal. */
export async function deleteExceptions(
  env: ClerkEnv,
  userId: string,
  services: ReadonlyArray<{ date: string; slot: ServiceSlot }>,
): Promise<void> {
  if (services.length === 0) return;
  const sql = await db(env);
  await sql.query(
    `DELETE FROM availability_exceptions e
      USING jsonb_to_recordset($3::jsonb) AS x(service_date date, slot text)
      WHERE e.clerk_env = $1 AND e.clerk_user_id = $2 AND e.service_date = x.service_date AND e.slot = x.slot`,
    [env, userId, JSON.stringify(services.map((service) => ({ service_date: service.date, slot: service.slot })))],
  );
}

/**
 * Sets someone's normal services. Only that column is written (a profile
 * row is created if they have none), so nothing else on their profile changes.
 */
export async function setNormalAvailability(
  env: ClerkEnv,
  userId: string,
  services: readonly ServiceAvailability[],
): Promise<void> {
  const sql = await db(env);
  await sql.query(
    `INSERT INTO user_profiles (clerk_env, clerk_user_id, service_availability) VALUES ($1, $2, $3::text[])
     ON CONFLICT (clerk_env, clerk_user_id) DO UPDATE SET
       service_availability = EXCLUDED.service_availability, updated_at = now()`,
    [env, userId, services],
  );
}

export interface RosterRecord {
  id: string;
  normal: ServiceAvailability[];
  preferredName: string;
}

/**
 * Everyone on the availability board (see availabilityRosterIds), with their
 * normal services - in one round trip for the permissions, one for profiles.
 * Names are not here: they belong to Clerk.
 */
export async function loadRosterRecords(env: ClerkEnv): Promise<RosterRecord[]> {
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
  for (const { role, permission } of row.role_permissions) {
    rolePermissions.set(role, [...(rolePermissions.get(role) ?? []), permission]);
  }
  const overrides = new Map<string, PermissionOverride[]>();
  for (const { user, permission, effect } of row.overrides) {
    overrides.set(user, [...(overrides.get(user) ?? []), { permission, effect }]);
  }

  const ids = availabilityRosterIds(userRoles, rolePermissions, overrides);
  if (ids.length === 0) return [];
  const profiles = (await sql.query(
    `SELECT clerk_user_id, service_availability, preferred_name FROM user_profiles
      WHERE clerk_env = $1 AND clerk_user_id = ANY($2::text[])`,
    [env, ids],
  )) as Array<{ clerk_user_id: string; service_availability: ServiceAvailability[]; preferred_name: string }>;
  const byId = new Map(profiles.map((profile) => [profile.clerk_user_id, profile]));

  return ids.map((id) => ({
    id,
    normal: byId.get(id)?.service_availability ?? [],
    preferredName: byId.get(id)?.preferred_name ?? "",
  }));
}
