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
