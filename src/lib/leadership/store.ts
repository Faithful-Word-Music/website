import "server-only";

import { randomUUID } from "node:crypto";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { isWriteConflict, plannerSql, type PendingQuery } from "@/lib/service-planner/store";
import type { ServiceSlot } from "@/types/song-list";

import type { Leadership, LeaderOverride, RosterSnapshot } from "./model";

/**
 * Reading and writing song leaders. The tables are the planner's
 * (src/lib/service-planner/store.ts creates them, on the same connection):
 *
 *   service_leadership          one row per service given leaders: its default
 *                               leader and a revision of its own - separate from
 *                               the songs', so assigning never touches them
 *   service_leader_overrides    one row per place that does not follow the default
 *   service_leadership_changes  what changed, for the record and for telling people
 *
 * Every table carries the Clerk environment. No authorization happens here:
 * the server actions check manage_service_plans first, and every reader
 * redacts through src/lib/leadership/access.ts.
 */

export interface ServiceKey {
  date: string;
  slot: ServiceSlot;
}

const keyOf = (service: ServiceKey) => `${service.date}|${service.slot}`;

interface LeadershipRow {
  date: string;
  slot: ServiceSlot;
  default_user_id: string | null;
  revision: number;
  overrides: Array<{ place: string; kind: LeaderOverride["kind"]; user: string | null }> | string | null;
}

function toLeadership(row: LeadershipRow): Leadership {
  const raw = typeof row.overrides === "string" ? JSON.parse(row.overrides) : (row.overrides ?? []);
  const overrides: Record<string, LeaderOverride> = {};
  for (const item of Array.isArray(raw) ? raw : []) {
    if (item.kind === "assigned" && typeof item.user === "string") overrides[item.place] = { kind: "assigned", userId: item.user };
    else if (item.kind === "unassigned") overrides[item.place] = { kind: "unassigned" };
  }
  return { defaultUserId: row.default_user_id, overrides, revision: row.revision };
}

const LEADERSHIP_SELECT = `SELECT to_char(l.service_date, 'YYYY-MM-DD') AS date, l.slot, l.default_user_id, l.revision,
         COALESCE((SELECT json_agg(json_build_object('place', o.place_id, 'kind', o.kind, 'user', o.user_id))
                     FROM service_leader_overrides o
                    WHERE o.clerk_env = l.clerk_env AND o.service_date = l.service_date AND o.slot = l.slot), '[]') AS overrides
    FROM service_leadership l`;

/** Every service's leaders from `from` to `to`, by "date|slot" - in one query. */
export async function listLeadership(env: ClerkEnv, range: { from: string; to: string }): Promise<Map<string, Leadership>> {
  const sql = await plannerSql();
  const rows = (await sql.query(
    `${LEADERSHIP_SELECT}
      WHERE l.clerk_env = $1 AND l.service_date BETWEEN $2::date AND $3::date`,
    [env, range.from, range.to],
  )) as LeadershipRow[];
  return new Map(rows.map((row) => [keyOf(row), toLeadership(row)]));
}

/** One service's leaders; NO_LEADERSHIP-shaped (revision 0) when none were ever set. */
export async function getLeadership(env: ClerkEnv, service: ServiceKey): Promise<Leadership> {
  const sql = await plannerSql();
  const rows = (await sql.query(`${LEADERSHIP_SELECT} WHERE l.clerk_env = $1 AND l.service_date = $2::date AND l.slot = $3`, [
    env,
    service.date,
    service.slot,
  ])) as LeadershipRow[];
  return rows[0] ? toLeadership(rows[0]) : { defaultUserId: null, overrides: {}, revision: 0 };
}

export function leadershipKey(service: ServiceKey): string {
  return keyOf(service);
}

// ---------------------------------------------------------------------------
// Writing - always inside a transaction, always against a revision
// ---------------------------------------------------------------------------

export type ChangeCause = "assignment" | "songs" | "status";

/** What a change did: who led what before and after, and (for a status change) the statuses. */
export interface ChangeDetails {
  before: RosterSnapshot;
  after: RosterSnapshot;
  status?: { from: string | null; to: string };
}

export interface ChangeWrite {
  cause: ChangeCause;
  details: ChangeDetails;
}

export interface LeadershipStatements {
  /** The revision the change was worked out from. Anything else - someone saved since - undoes it all. */
  expectedRevision: number;
  /** The leaders to store: the whole set, replacing what is there. Null leaves them as they are. */
  write: Pick<Leadership, "defaultUserId" | "overrides"> | null;
  /** Places whose override goes because the place itself has gone (only when `write` is null). */
  dropped: readonly string[];
  actor: string;
  /** Recorded, with an ID for telling people, when anyone's part changed. */
  change: ChangeWrite | null;
  /**
   * saveLeadership() only: the place IDs the leaders were checked against (null for a service
   * not stored yet, whose "p1"... are fixed). Stored with the leaders - so a leaders-only save
   * never leaves them pointing at IDs that were only ever worked out, not kept (a service saved
   * before places had IDs, or whose IDs had to be given afresh).
   */
  places?: readonly string[] | null;
}

/**
 * The statements that change a service's leaders, for a transaction:
 *
 *   1. make sure its row exists (revision 0 when new)
 *   2. lock it, and undo the transaction unless its revision is still the
 *      one the change was worked out from
 *   3. replace the default and overrides (or drop the overrides of removed
 *      places), and bump the revision
 *   4. record the change, when anyone's part changed
 *
 * Returns the change's ID (when there is one) with the statements.
 */
export function leadershipStatements(
  sql: Awaited<ReturnType<typeof plannerSql>>,
  env: ClerkEnv,
  service: ServiceKey,
  input: LeadershipStatements,
): { statements: PendingQuery[]; changeId: string | null } {
  const where = [env, service.date, service.slot] as const;
  const statements: PendingQuery[] = [
    sql.query(
      `INSERT INTO service_leadership (clerk_env, service_date, slot) VALUES ($1, $2::date, $3)
       ON CONFLICT (clerk_env, service_date, slot) DO NOTHING`,
      [...where],
    ),
    sql.query(
      `SELECT fwm_require(
         (SELECT revision FROM service_leadership
           WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3 FOR UPDATE) = $4,
         'conflict')`,
      [...where, input.expectedRevision],
    ),
  ];

  if (input.write) {
    const overrides = Object.entries(input.write.overrides).map(([place, override]) => ({
      place_id: place,
      kind: override.kind,
      user_id: override.kind === "assigned" ? override.userId : null,
    }));
    statements.push(
      sql.query(
        `UPDATE service_leadership
            SET default_user_id = $4, revision = revision + 1, updated_by = $5, updated_at = now()
          WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3`,
        [...where, input.write.defaultUserId, input.actor],
      ),
      sql.query(`DELETE FROM service_leader_overrides WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3`, [...where]),
      sql.query(
        `INSERT INTO service_leader_overrides (clerk_env, service_date, slot, place_id, kind, user_id, updated_by)
         SELECT $1, $2::date, $3, item.place_id, item.kind, item.user_id, $5
           FROM jsonb_to_recordset($4::jsonb) AS item(place_id text, kind text, user_id text)`,
        [...where, JSON.stringify(overrides), input.actor],
      ),
    );
  } else if (input.dropped.length > 0) {
    statements.push(
      sql.query(
        `DELETE FROM service_leader_overrides
          WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3 AND place_id = ANY($4::text[])`,
        [...where, [...input.dropped]],
      ),
      sql.query(
        `UPDATE service_leadership SET revision = revision + 1, updated_by = $4, updated_at = now()
          WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3`,
        [...where, input.actor],
      ),
    );
  }

  const changeId = input.change ? randomUUID() : null;
  if (input.change) statements.push(changeQuery(sql, env, service, changeId!, input.change, input.actor));
  return { statements, changeId };
}

function changeQuery(
  sql: Awaited<ReturnType<typeof plannerSql>>,
  env: ClerkEnv,
  service: ServiceKey,
  id: string,
  change: ChangeWrite,
  actor: string,
): PendingQuery {
  return sql.query(
    `INSERT INTO service_leadership_changes (id, clerk_env, service_date, slot, cause, actor, details)
     VALUES ($1::uuid, $2, $3::date, $4, $5, $6, $7::jsonb)`,
    [id, env, service.date, service.slot, change.cause, actor, JSON.stringify(change.details)],
  );
}

/** Records a change on its own (a cancellation or restoration), returning its ID. */
export function changeStatement(
  sql: Awaited<ReturnType<typeof plannerSql>>,
  env: ClerkEnv,
  service: ServiceKey,
  change: ChangeWrite,
  actor: string,
): { statement: PendingQuery; changeId: string } {
  const changeId = randomUUID();
  return { statement: changeQuery(sql, env, service, changeId, change, actor), changeId };
}

export type LeadershipSave = { ok: true; revision: number; changeId: string | null } | { ok: false; reason: "conflict" };

/**
 * Saves a service's leaders on their own - its songs untouched. Undone, and
 * reported as a conflict, if the leaders OR the songs changed since they were
 * read (`planRevision`: 0 for a service not stored yet), since which places
 * exist is the songs' to say.
 */
export async function saveLeadership(
  env: ClerkEnv,
  service: ServiceKey,
  planRevision: number,
  input: LeadershipStatements,
): Promise<LeadershipSave> {
  const sql = await plannerSql();
  const { statements, changeId } = leadershipStatements(sql, env, service, input);
  try {
    const results = (await sql.transaction([
      sql.query(
        `SELECT fwm_require(
           COALESCE((SELECT revision FROM service_plans
                      WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3 FOR SHARE), 0) = $4,
           'conflict')`,
        [env, service.date, service.slot, planRevision],
      ),
      // The songs are locked and unchanged (above): their IDs, as read, are stored as they are - the
      // songs' revision is not moved, since nothing anyone sees has changed.
      ...(input.places
        ? [
            sql.query(
              `UPDATE service_plans SET place_ids = $4::jsonb
                WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3
                  AND place_ids IS DISTINCT FROM $4::jsonb`,
              [env, service.date, service.slot, JSON.stringify(input.places)],
            ),
          ]
        : []),
      ...statements,
      sql.query(`SELECT revision FROM service_leadership WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3`, [
        env,
        service.date,
        service.slot,
      ]),
    ])) as unknown[][];
    const last = results.at(-1) as Array<{ revision: number }>;
    return { ok: true, revision: last[0]?.revision ?? 0, changeId };
  } catch (error) {
    if (isWriteConflict(error)) return { ok: false, reason: "conflict" };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Changes - the record, and who is still to be told
// ---------------------------------------------------------------------------

export interface StoredChange {
  id: string;
  date: string;
  slot: ServiceSlot;
  cause: ChangeCause;
  actor: string | null;
  at: string;
  details: ChangeDetails;
  notifiedAt: string | null;
}

interface ChangeRow {
  id: string;
  date: string;
  slot: ServiceSlot;
  cause: ChangeCause;
  actor: string | null;
  at: Date | string;
  details: ChangeDetails | string;
  notified_at: Date | string | null;
}

const CHANGE_COLUMNS = `id::text AS id, to_char(service_date, 'YYYY-MM-DD') AS date, slot, cause, actor, at, details, notified_at`;

const toChange = (row: ChangeRow): StoredChange => ({
  id: row.id,
  date: row.date,
  slot: row.slot,
  cause: row.cause,
  actor: row.actor,
  at: new Date(row.at).toISOString(),
  details: typeof row.details === "string" ? JSON.parse(row.details) : row.details,
  notifiedAt: row.notified_at ? new Date(row.notified_at).toISOString() : null,
});

export async function getChange(env: ClerkEnv, id: string): Promise<StoredChange | null> {
  const sql = await plannerSql();
  const rows = (await sql.query(`SELECT ${CHANGE_COLUMNS} FROM service_leadership_changes WHERE clerk_env = $1 AND id = $2::uuid`, [
    env,
    id,
  ])) as ChangeRow[];
  return rows[0] ? toChange(rows[0]) : null;
}

/** Changes nobody has been told of yet, made at least `olderThanMinutes` ago (so not one still being told). */
export async function listUnnotifiedChanges(env: ClerkEnv, olderThanMinutes: number, limit = 25): Promise<StoredChange[]> {
  const sql = await plannerSql();
  const rows = (await sql.query(
    `SELECT ${CHANGE_COLUMNS} FROM service_leadership_changes
      WHERE clerk_env = $1 AND notified_at IS NULL AND at <= now() - make_interval(mins => $2::int)
      ORDER BY at LIMIT $3`,
    [env, olderThanMinutes, limit],
  )) as ChangeRow[];
  return rows.map(toChange);
}

/** Marks a change as told. True when this call marked it (not already marked). */
export async function markChangeNotified(env: ClerkEnv, id: string): Promise<boolean> {
  const sql = await plannerSql();
  const rows = (await sql.query(
    `UPDATE service_leadership_changes SET notified_at = now()
      WHERE clerk_env = $1 AND id = $2::uuid AND notified_at IS NULL RETURNING id`,
    [env, id],
  )) as Array<{ id: string }>;
  return rows.length > 0;
}

/** A service's leader changes, newest first - the planner's history. */
export async function listServiceChanges(env: ClerkEnv, service: ServiceKey, limit = 20): Promise<StoredChange[]> {
  const sql = await plannerSql();
  const rows = (await sql.query(
    `SELECT ${CHANGE_COLUMNS} FROM service_leadership_changes
      WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3
      ORDER BY at DESC LIMIT $4`,
    [env, service.date, service.slot, limit],
  )) as ChangeRow[];
  return rows.map(toChange);
}
