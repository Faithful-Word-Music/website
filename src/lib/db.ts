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
 */
export async function applySchema(
  sql: NeonQueryFunction<false, false>,
  statements: readonly string[],
): Promise<void> {
  if (statements.length === 0) return;
  await sql.transaction(statements.map((statement) => sql.query(statement)));
}
