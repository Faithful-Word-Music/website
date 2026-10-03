import "server-only";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { getSql } from "@/lib/db";
import { toChurchIso } from "@/lib/service-time";
import { songKey } from "@/lib/song-list";
import type { ServiceSlot } from "@/types/song-list";

import type {
  InsertMode,
  InsertWeek,
  PlanSlots,
  PlanStatus,
  ServiceKind,
  SongChange,
  StoredPlan,
} from "./model";

/**
 * Reading and writing the Service Planner's tables. Every table carries the
 * Clerk environment (Local, Preview and Production share one database), so a
 * test plan made locally can never reach the live song list.
 *
 *   service_plans          one row per service someone has touched: its
 *                          places (jsonb, in order, null = empty), status,
 *                          and who created, changed and published it
 *   publications           one row per publish action - several services
 *                          published together share one, so a future
 *                          notification can announce them once
 *   service_plan_events    what happened to each service and what changed
 *                          (songs added, removed, moved, keys), for audit,
 *                          change history and future notifications
 *   insert_weeks           the insert chosen for each week
 *   catalog_songs          songs added in the planner, so a song can exist
 *                          before it has ever been sung
 *
 * No authorization happens here: the server actions in
 * src/app/service-planner/actions.ts check manage_service_plans first.
 */

const ENV = `clerk_env text NOT NULL CHECK (clerk_env IN ('development', 'production'))`;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS publications (
     id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
     ${ENV},
     published_by  text,
     published_at  timestamptz NOT NULL DEFAULT now(),
     service_count integer     NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS service_plans (
     id             serial PRIMARY KEY,
     ${ENV},
     service_date   date        NOT NULL,
     slot           text        NOT NULL CHECK (slot IN ('AM', 'PM')),
     kind           text        NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular', 'special')),
     label          text,
     starts_at      timestamptz NOT NULL,
     status         text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled')),
     insert_mode    text        NOT NULL DEFAULT 'week' CHECK (insert_mode IN ('week', 'custom')),
     slots          jsonb       NOT NULL DEFAULT '[]',
     revision       integer     NOT NULL DEFAULT 1,
     created_by     text,
     created_at     timestamptz NOT NULL DEFAULT now(),
     updated_by     text,
     updated_at     timestamptz NOT NULL DEFAULT now(),
     published_by   text,
     published_at   timestamptz,
     publication_id uuid REFERENCES publications (id),
     UNIQUE (clerk_env, service_date, slot)
   )`,
  `CREATE INDEX IF NOT EXISTS service_plans_status ON service_plans (clerk_env, status, service_date)`,
  `CREATE TABLE IF NOT EXISTS service_plan_events (
     id             bigserial PRIMARY KEY,
     ${ENV},
     plan_id        integer     NOT NULL REFERENCES service_plans (id) ON DELETE CASCADE,
     publication_id uuid REFERENCES publications (id),
     type           text        NOT NULL,
     status         text        NOT NULL,
     actor          text,
     at             timestamptz NOT NULL DEFAULT now(),
     details        jsonb       NOT NULL DEFAULT '{}'
   )`,
  `CREATE INDEX IF NOT EXISTS service_plan_events_plan ON service_plan_events (plan_id, at)`,
  `CREATE TABLE IF NOT EXISTS insert_weeks (
     ${ENV},
     week_start date        NOT NULL,
     title      text        NOT NULL,
     number     text,
     key        text,
     title_key  text        NOT NULL,
     updated_by text,
     updated_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, week_start)
   )`,
  `CREATE TABLE IF NOT EXISTS catalog_songs (
     ${ENV},
     title_key   text        NOT NULL,
     title       text        NOT NULL,
     number      text,
     collection  text,
     default_key text,
     created_by  text,
     created_at  timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, title_key)
   )`,
];

export class PlannerUnavailableError extends Error {
  constructor() {
    super("DATABASE_URL is not set");
    this.name = "PlannerUnavailableError";
  }
}

let schemaReady = false;

async function plannerSql() {
  const sql = getSql();
  if (!sql) throw new PlannerUnavailableError();
  if (!schemaReady) {
    for (const statement of SCHEMA) await sql.query(statement);
    schemaReady = true;
  }
  return sql;
}

/** Whether the planner's database is configured here at all. */
export function plannerConfigured(): boolean {
  return getSql() !== null;
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

interface PlanRow {
  id: number;
  date: string;
  slot: ServiceSlot;
  kind: ServiceKind;
  label: string | null;
  starts_at: Date | string;
  status: PlanStatus;
  insert_mode: InsertMode;
  slots: PlanSlots | string;
  revision: number;
  created_by: string | null;
  created_at: Date | string;
  updated_by: string | null;
  updated_at: Date | string;
  published_by: string | null;
  published_at: Date | string | null;
  publication_id: string | null;
}

const PLAN_COLUMNS = `id, to_char(service_date, 'YYYY-MM-DD') AS date, slot, kind, label, starts_at, status,
  insert_mode, slots, revision, created_by, created_at, updated_by, updated_at, published_by, published_at,
  publication_id`;

const iso = (value: Date | string) => new Date(value).toISOString();

/** Places from the database, made safe: anything malformed reads as an empty place. */
function readSlots(value: PlanSlots | string): PlanSlots {
  const raw: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (!item || typeof item !== "object" || typeof (item as { title?: unknown }).title !== "string") return null;
    const song = item as { title: string; number?: unknown; key?: unknown; insert?: unknown };
    return {
      title: song.title,
      number: typeof song.number === "string" && song.number !== "" ? song.number : null,
      key: typeof song.key === "string" && song.key !== "" ? song.key : null,
      insert: song.insert === true,
    };
  });
}

function toPlan(row: PlanRow): StoredPlan {
  return {
    id: row.id,
    date: row.date,
    slot: row.slot,
    kind: row.kind,
    label: row.label,
    startsAt: toChurchIso(new Date(row.starts_at).getTime()),
    status: row.status,
    insertMode: row.insert_mode,
    slots: readSlots(row.slots),
    revision: row.revision,
    created: { by: row.created_by, at: iso(row.created_at) },
    updated: { by: row.updated_by, at: iso(row.updated_at) },
    published: row.published_at ? { by: row.published_by, at: iso(row.published_at) } : null,
    publicationId: row.publication_id,
  };
}

/** Stored services, oldest first; optionally only a date range and/or some statuses. */
export async function listPlans(
  env: ClerkEnv,
  filter: { from?: string; to?: string; statuses?: PlanStatus[] } = {},
): Promise<StoredPlan[]> {
  const sql = await plannerSql();
  const rows = (await sql.query(
    `SELECT ${PLAN_COLUMNS} FROM service_plans
      WHERE clerk_env = $1
        AND ($2::date IS NULL OR service_date >= $2::date)
        AND ($3::date IS NULL OR service_date <= $3::date)
        AND ($4::text[] IS NULL OR status = ANY($4::text[]))
      ORDER BY starts_at`,
    [env, filter.from ?? null, filter.to ?? null, filter.statuses ?? null],
  )) as PlanRow[];
  return rows.map(toPlan);
}

/** One stored service, or null when nobody has touched it yet. */
export async function getPlan(env: ClerkEnv, date: string, slot: ServiceSlot): Promise<StoredPlan | null> {
  const sql = await plannerSql();
  const rows = (await sql.query(
    `SELECT ${PLAN_COLUMNS} FROM service_plans WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3`,
    [env, date, slot],
  )) as PlanRow[];
  return rows[0] ? toPlan(rows[0]) : null;
}

export interface PlanWrite {
  date: string;
  slot: ServiceSlot;
  kind: ServiceKind;
  label: string | null;
  startsAt: string;
  insertMode: InsertMode;
  slots: PlanSlots;
}

export type SaveOutcome = { ok: true; plan: StoredPlan } | { ok: false; reason: "conflict" };

/**
 * Saves a service's places (and its name and time).
 *
 *   expectedRevision null  -> the service is stored for the first time, as a draft
 *   a number               -> saved only if nobody else saved since that revision
 *
 * Either way the change is recorded as an event in the same statement, so the
 * record and the history can never disagree. A published service stays
 * published - its event says "published_edited", with what changed.
 */
export async function savePlan(
  env: ClerkEnv,
  write: PlanWrite,
  expectedRevision: number | null,
  actor: string,
  changes: SongChange[],
): Promise<SaveOutcome> {
  const sql = await plannerSql();
  const slots = JSON.stringify(write.slots);
  const details = JSON.stringify({ changes });

  const rows = (
    expectedRevision === null
      ? await sql.query(
          `WITH saved AS (
             INSERT INTO service_plans
               (clerk_env, service_date, slot, kind, label, starts_at, insert_mode, slots, created_by, updated_by)
             VALUES ($1, $2::date, $3, $4, $5, $6::timestamptz, $7, $8::jsonb, $9, $9)
             ON CONFLICT (clerk_env, service_date, slot) DO NOTHING
             RETURNING *
           ), logged AS (
             INSERT INTO service_plan_events (clerk_env, plan_id, type, status, actor, details)
             SELECT clerk_env, id, 'created', status, $9, $10::jsonb FROM saved
           )
           SELECT ${PLAN_COLUMNS} FROM saved`,
          [env, write.date, write.slot, write.kind, write.label, write.startsAt, write.insertMode, slots, actor, details],
        )
      : await sql.query(
          `WITH saved AS (
             UPDATE service_plans
                SET kind = $4, label = $5, starts_at = $6::timestamptz, insert_mode = $7, slots = $8::jsonb,
                    updated_by = $9, updated_at = now(), revision = revision + 1
              WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3 AND revision = $11
              RETURNING *
           ), logged AS (
             INSERT INTO service_plan_events (clerk_env, plan_id, type, status, actor, details)
             SELECT clerk_env, id, CASE WHEN status = 'published' THEN 'published_edited' ELSE 'edited' END,
                    status, $9, $10::jsonb
               FROM saved
           )
           SELECT ${PLAN_COLUMNS} FROM saved`,
          [
            env,
            write.date,
            write.slot,
            write.kind,
            write.label,
            write.startsAt,
            write.insertMode,
            slots,
            actor,
            details,
            expectedRevision,
          ],
        )
  ) as PlanRow[];

  return rows[0] ? { ok: true, plan: toPlan(rows[0]) } : { ok: false, reason: "conflict" };
}

/**
 * Publishes services together, as ONE publication: every service listed must
 * already be stored. Services already published are published again (their
 * publication becomes this one). Returns the publication's id.
 */
export async function publishPlans(
  env: ClerkEnv,
  services: ReadonlyArray<{ date: string; slot: ServiceSlot }>,
  actor: string,
): Promise<{ publicationId: string; count: number }> {
  const sql = await plannerSql();
  const rows = (await sql.query(
    `WITH targets AS (
       SELECT p.id FROM service_plans p
         JOIN unnest($2::date[], $3::text[]) AS t(service_date, slot)
           ON p.service_date = t.service_date AND p.slot = t.slot
        WHERE p.clerk_env = $1 AND p.status <> 'cancelled'
     ), publication AS (
       INSERT INTO publications (clerk_env, published_by, service_count)
       SELECT $1, $4, count(*) FROM targets
       RETURNING id
     ), published AS (
       UPDATE service_plans
          SET status = 'published', published_by = $4, published_at = now(),
              publication_id = (SELECT id FROM publication),
              updated_by = $4, updated_at = now(), revision = revision + 1
        WHERE id IN (SELECT id FROM targets)
        RETURNING id, clerk_env
     ), logged AS (
       INSERT INTO service_plan_events (clerk_env, plan_id, publication_id, type, status, actor, details)
       SELECT clerk_env, id, (SELECT id FROM publication), 'published', 'published', $4,
              jsonb_build_object('publicationSize', (SELECT count(*) FROM published))
         FROM published
     )
     SELECT (SELECT id FROM publication) AS publication_id, (SELECT count(*) FROM published)::int AS count`,
    [env, services.map((s) => s.date), services.map((s) => s.slot), actor],
  )) as Array<{ publication_id: string; count: number }>;
  return { publicationId: rows[0].publication_id, count: rows[0].count };
}

/**
 * Changes a stored service's status other than publishing: back to draft
 * (off the song list), cancelled, or restored from cancelled (as a draft).
 */
export async function setPlanStatus(
  env: ClerkEnv,
  service: { date: string; slot: ServiceSlot },
  status: "draft" | "cancelled",
  actor: string,
): Promise<StoredPlan | null> {
  const sql = await plannerSql();
  const rows = (await sql.query(
    `WITH before AS (
       SELECT id, status FROM service_plans WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3
     ), saved AS (
       UPDATE service_plans
          SET status = $4, updated_by = $5, updated_at = now(), revision = revision + 1,
              publication_id = CASE WHEN $4 = 'draft' THEN NULL ELSE publication_id END
        WHERE id = (SELECT id FROM before)
        RETURNING *
     ), logged AS (
       INSERT INTO service_plan_events (clerk_env, plan_id, type, status, actor, details)
       SELECT s.clerk_env, s.id,
              CASE WHEN $4 = 'cancelled' THEN 'cancelled'
                   WHEN b.status = 'cancelled' THEN 'restored'
                   ELSE 'unpublished' END,
              $4, $5, jsonb_build_object('from', b.status)
         FROM saved s, before b
     )
     SELECT ${PLAN_COLUMNS} FROM saved`,
    [env, service.date, service.slot, status, actor],
  )) as PlanRow[];
  return rows[0] ? toPlan(rows[0]) : null;
}

/** Stores a service with no songs yet, if it is not stored already (cancelling or publishing a virtual one). */
export async function ensurePlan(env: ClerkEnv, write: PlanWrite, actor: string): Promise<void> {
  const sql = await plannerSql();
  await sql.query(
    `WITH saved AS (
       INSERT INTO service_plans
         (clerk_env, service_date, slot, kind, label, starts_at, insert_mode, slots, created_by, updated_by)
       VALUES ($1, $2::date, $3, $4, $5, $6::timestamptz, $7, $8::jsonb, $9, $9)
       ON CONFLICT (clerk_env, service_date, slot) DO NOTHING
       RETURNING id, clerk_env, status
     )
     INSERT INTO service_plan_events (clerk_env, plan_id, type, status, actor, details)
     SELECT clerk_env, id, 'created', status, $9, '{}'::jsonb FROM saved`,
    [env, write.date, write.slot, write.kind, write.label, write.startsAt, write.insertMode, JSON.stringify(write.slots), actor],
  );
}

/** Deletes a special service that was never published. Regular services are cancelled instead. */
export async function deleteDraftSpecial(env: ClerkEnv, date: string, slot: ServiceSlot): Promise<boolean> {
  const sql = await plannerSql();
  const rows = (await sql.query(
    `DELETE FROM service_plans
      WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3
        AND kind = 'special' AND published_at IS NULL
      RETURNING id`,
    [env, date, slot],
  )) as Array<{ id: number }>;
  return rows.length > 0;
}

export interface PlanEvent {
  type: string;
  status: PlanStatus;
  actor: string | null;
  at: string;
  publicationId: string | null;
  changes: SongChange[];
}

/** What happened to a service, newest first. */
export async function listPlanEvents(env: ClerkEnv, planId: number, limit = 20): Promise<PlanEvent[]> {
  const sql = await plannerSql();
  const rows = (await sql.query(
    `SELECT type, status, actor, at, publication_id, details FROM service_plan_events
      WHERE clerk_env = $1 AND plan_id = $2 ORDER BY at DESC, id DESC LIMIT $3`,
    [env, planId, limit],
  )) as Array<{
    type: string;
    status: PlanStatus;
    actor: string | null;
    at: Date | string;
    publication_id: string | null;
    details: { changes?: SongChange[] } | string;
  }>;
  return rows.map((row) => {
    const details = typeof row.details === "string" ? JSON.parse(row.details) : row.details;
    return {
      type: row.type,
      status: row.status,
      actor: row.actor,
      at: iso(row.at),
      publicationId: row.publication_id,
      changes: Array.isArray(details?.changes) ? details.changes : [],
    };
  });
}

/**
 * The planner's services as the occurrence lists need them (special services,
 * names, times and cancellations) for Availability. Never throws: without the
 * database, only the regular services are known.
 */
export async function scheduledServices(
  env: ClerkEnv,
  range: { from: string; to: string },
): Promise<Array<{ date: string; slot: ServiceSlot; label: string | null; startsAt: string; cancelled: boolean }>> {
  try {
    if (!plannerConfigured()) return [];
    const plans = await listPlans(env, range);
    return plans.map((plan) => ({
      date: plan.date,
      slot: plan.slot,
      label: plan.label,
      startsAt: plan.startsAt,
      cancelled: plan.status === "cancelled",
    }));
  } catch (error) {
    console.error("[service-planner] Could not read services:", error instanceof Error ? error.message : "unknown error");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Inserts
// ---------------------------------------------------------------------------

export async function listInsertWeeks(env: ClerkEnv, from: string, to: string): Promise<InsertWeek[]> {
  const sql = await plannerSql();
  const rows = (await sql.query(
    `SELECT to_char(week_start, 'YYYY-MM-DD') AS week_start, title, number, key FROM insert_weeks
      WHERE clerk_env = $1 AND week_start BETWEEN $2::date AND $3::date ORDER BY week_start`,
    [env, from, to],
  )) as Array<{ week_start: string; title: string; number: string | null; key: string | null }>;
  return rows.map((row) => ({ weekStart: row.week_start, title: row.title, number: row.number, key: row.key }));
}

/** Sets (or, with null, clears) a week's insert. */
export async function setInsertWeek(
  env: ClerkEnv,
  weekStart: string,
  song: { title: string; number: string | null; key: string | null } | null,
  actor: string,
): Promise<void> {
  const sql = await plannerSql();
  if (!song) {
    await sql.query(`DELETE FROM insert_weeks WHERE clerk_env = $1 AND week_start = $2::date`, [env, weekStart]);
    return;
  }
  await sql.query(
    `INSERT INTO insert_weeks (clerk_env, week_start, title, number, key, title_key, updated_by)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7)
     ON CONFLICT (clerk_env, week_start)
     DO UPDATE SET title = EXCLUDED.title, number = EXCLUDED.number, key = EXCLUDED.key,
                   title_key = EXCLUDED.title_key, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [env, weekStart, song.title, song.number, song.key, songKey(song.title), actor],
  );
}

// ---------------------------------------------------------------------------
// Catalog songs
// ---------------------------------------------------------------------------

export interface CatalogSong {
  title: string;
  number: string | null;
  collection: string | null;
  defaultKey: string | null;
}

export async function listCatalogSongs(env: ClerkEnv): Promise<CatalogSong[]> {
  const sql = await plannerSql();
  const rows = (await sql.query(
    `SELECT title, number, collection, default_key FROM catalog_songs WHERE clerk_env = $1 ORDER BY title_key`,
    [env],
  )) as Array<{ title: string; number: string | null; collection: string | null; default_key: string | null }>;
  return rows.map((row) => ({
    title: row.title,
    number: row.number,
    collection: row.collection,
    defaultKey: row.default_key,
  }));
}

/** Adds a song to the catalog; false when a song with that title is already there. */
export async function createCatalogSong(env: ClerkEnv, song: CatalogSong, actor: string): Promise<boolean> {
  const sql = await plannerSql();
  const rows = (await sql.query(
    `INSERT INTO catalog_songs (clerk_env, title_key, title, number, collection, default_key, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (clerk_env, title_key) DO NOTHING
     RETURNING title_key`,
    [env, songKey(song.title), song.title, song.number, song.collection, song.defaultKey, actor],
  )) as Array<{ title_key: string }>;
  return rows.length > 0;
}
