import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * The archive database (Neon Postgres, connected through the Vercel
 * Marketplace, which sets DATABASE_URL).
 *
 * Created lazily on first use, never at import time: `next build` imports this
 * module, and a build must not fail just because the database is not
 * configured in that environment.
 */
let client: NeonQueryFunction<false, false> | null = null;

/** The query function, or null when DATABASE_URL is not set. */
export function getSql(): NeonQueryFunction<false, false> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  client ??= neon(url);
  return client;
}

/**
 * Runs a store's `CREATE … IF NOT EXISTS` statements, in order, as ONE
 * request: each server does this once, when a store is first used, and one
 * round trip instead of one per statement keeps that first request quick.
 * Every statement is idempotent; if one fails, none is kept and the caller
 * tries again next time, as it did before.
 *
 * `ready`, when given, is a query answering `ready = true` when everything the
 * statements make already exists. Then nothing runs. That matters: "IF NOT
 * EXISTS" still takes its locks - `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
 * locks the whole table even when the column is there - and every server (and,
 * in development, every route) runs this on its first use. Many at once
 * deadlock with each other and with ordinary queries. With the check, the
 * statements run once, ever.
 *
 * When they do run, they hold one database-wide lock (SCHEMA_LOCK) for the
 * transaction, so two stores - or two servers - never apply statements at the
 * same moment.
 */
export async function applySchema(
  sql: NeonQueryFunction<false, false>,
  statements: readonly string[],
  ready?: string,
): Promise<void> {
  if (statements.length === 0) return;
  if (ready) {
    const rows = (await sql.query(ready)) as Array<{ ready?: unknown }>;
    if (rows[0]?.ready === true) return;
  }
  await sql.transaction([
    sql.query(`SELECT pg_advisory_xact_lock(${SCHEMA_LOCK})`),
    ...statements.map((statement) => sql.query(statement)),
  ]);
}

/** The advisory lock every schema change in this site takes (applySchema). Any fixed number. */
export const SCHEMA_LOCK = 7_301_946_221;
