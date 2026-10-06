import "server-only";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { getSql } from "@/lib/db";

import type { PhilosophyRevision, PhilosophyRevisionSummary, PhilosophySource } from "./revisions";

/**
 * The Service Planning Philosophy as the site keeps it: every version ever
 * applied, the latest being the one in force.
 *
 *   planning_philosophy_revisions   one row per applied change - the WHOLE
 *                                   document as it then stood, who applied it,
 *                                   how (by hand, from a proposal Conductor
 *                                   made, by restoring an earlier version, or
 *                                   the first copy taken from the repository's
 *                                   document), and which sections it changed
 *
 * Nothing is ever updated or deleted here: restoring an old version adds a
 * new row. Like every other table it is created on first use and every row
 * carries the Clerk environment, so a philosophy tried out locally is never
 * the one production plans by.
 *
 * No authorization happens here: service.ts checks manage_planning_philosophy
 * before anything is written.
 */

const ENV = `clerk_env text NOT NULL CHECK (clerk_env IN ('development', 'production'))`;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS planning_philosophy_revisions (
     id               bigserial   PRIMARY KEY,
     ${ENV},
     created_at       timestamptz NOT NULL DEFAULT now(),
     created_by       text,
     source           text        NOT NULL CHECK (source IN ('seed', 'manual', 'ai', 'restore')),
     restored_from    bigint,
     changed_sections text[]      NOT NULL DEFAULT '{}',
     note             text,
     markdown         text        NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS planning_philosophy_latest ON planning_philosophy_revisions (clerk_env, id DESC)`,
  // The first copy is taken once per environment, however many requests arrive together.
  `CREATE UNIQUE INDEX IF NOT EXISTS planning_philosophy_seed ON planning_philosophy_revisions (clerk_env) WHERE source = 'seed'`,
];

let schemaReady = false;

/** The query function, or null when there is no database here. */
async function philosophySql() {
  const sql = getSql();
  if (!sql) return null;
  if (!schemaReady) {
    for (const statement of SCHEMA) await sql.query(statement);
    schemaReady = true;
  }
  return sql;
}

/** Whether the philosophy can be kept in a database here at all. */
export function philosophyStoreConfigured(): boolean {
  return getSql() !== null;
}

interface RevisionRow {
  id: string | number;
  created_at: Date | string;
  created_by: string | null;
  source: PhilosophySource;
  restored_from: string | number | null;
  changed_sections: string[] | null;
  note: string | null;
  markdown?: string;
}

const SUMMARY_COLUMNS = `id, created_at, created_by, source, restored_from, changed_sections, note`;

const toSummary = (row: RevisionRow): PhilosophyRevisionSummary => ({
  id: Number(row.id),
  at: new Date(row.created_at).toISOString(),
  by: row.created_by,
  source: row.source,
  restoredFrom: row.restored_from === null ? null : Number(row.restored_from),
  changedSections: row.changed_sections ?? [],
  note: row.note,
});

const toRevision = (row: RevisionRow): PhilosophyRevision => ({ ...toSummary(row), markdown: row.markdown ?? "" });

/** The version in force, or null when none has been stored yet (or there is no database). */
export async function latestPhilosophyRevision(env: ClerkEnv): Promise<PhilosophyRevision | null> {
  const sql = await philosophySql();
  if (!sql) return null;
  const rows = (await sql.query(
    `SELECT ${SUMMARY_COLUMNS}, markdown FROM planning_philosophy_revisions WHERE clerk_env = $1 ORDER BY id DESC LIMIT 1`,
    [env],
  )) as RevisionRow[];
  return rows[0] ? toRevision(rows[0]) : null;
}

/** One version, whole. */
export async function getPhilosophyRevision(env: ClerkEnv, id: number): Promise<PhilosophyRevision | null> {
  const sql = await philosophySql();
  if (!sql) return null;
  const rows = (await sql.query(
    `SELECT ${SUMMARY_COLUMNS}, markdown FROM planning_philosophy_revisions WHERE clerk_env = $1 AND id = $2`,
    [env, id],
  )) as RevisionRow[];
  return rows[0] ? toRevision(rows[0]) : null;
}

/** The history, newest first, without the documents themselves. */
export async function listPhilosophyRevisions(env: ClerkEnv, limit = 50): Promise<PhilosophyRevisionSummary[]> {
  const sql = await philosophySql();
  if (!sql) return [];
  const rows = (await sql.query(
    `SELECT ${SUMMARY_COLUMNS} FROM planning_philosophy_revisions WHERE clerk_env = $1 ORDER BY id DESC LIMIT $2`,
    [env, limit],
  )) as RevisionRow[];
  return rows.map(toSummary);
}

/**
 * Takes the first copy for this environment, when there is none. Safe to call
 * from several requests at once: only one row is ever written.
 */
export async function seedPhilosophyRevision(env: ClerkEnv, markdown: string): Promise<void> {
  const sql = await philosophySql();
  if (!sql) return;
  await sql.query(
    `INSERT INTO planning_philosophy_revisions (clerk_env, source, markdown)
     SELECT $1, 'seed', $2
      WHERE NOT EXISTS (SELECT 1 FROM planning_philosophy_revisions WHERE clerk_env = $1)
     ON CONFLICT DO NOTHING`,
    [env, markdown],
  );
}

export interface PhilosophyWrite {
  markdown: string;
  source: Exclude<PhilosophySource, "seed">;
  restoredFrom: number | null;
  changedSections: string[];
  note: string | null;
  userId: string;
  /** The version this change was made from: it is applied only if that is still the latest. */
  baseRevisionId: number;
}

/**
 * Adds a version - but only on top of the one it was made from. Null when
 * someone else has applied a change in between: nothing is written.
 */
export async function appendPhilosophyRevision(env: ClerkEnv, write: PhilosophyWrite): Promise<PhilosophyRevision | null> {
  const sql = await philosophySql();
  if (!sql) return null;
  const rows = (await sql.query(
    `INSERT INTO planning_philosophy_revisions (clerk_env, created_by, source, restored_from, changed_sections, note, markdown)
     SELECT $1, $2, $3, $4, $5::text[], $6, $7
      WHERE (SELECT max(id) FROM planning_philosophy_revisions WHERE clerk_env = $1) = $8
     RETURNING ${SUMMARY_COLUMNS}, markdown`,
    [env, write.userId, write.source, write.restoredFrom, write.changedSections, write.note, write.markdown, write.baseRevisionId],
  )) as RevisionRow[];
  return rows[0] ? toRevision(rows[0]) : null;
}
