import "server-only";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { getSql } from "@/lib/db";

import type { Memory, MemoryScope } from "./memory";
import type { MemoryDeps } from "./service";

/**
 * Where AI memory is kept.
 *
 *   ai_memories   one row per memory: its scope (personal or global), whose
 *                 it is when personal, its text, an optional category, and
 *                 who saved and last changed it
 *
 * Created on first use; every row carries the Clerk environment, so memories
 * saved while testing locally are never used in production.
 *
 * A personal memory is only ever read through its owner: every query that
 * takes an id also takes the person asking, and matches a global row or one
 * of THEIR personal rows. There is no way to ask for a row by id alone.
 *
 * Who may write what is decided in service.ts, which is the only caller.
 */

const ENV = `clerk_env text NOT NULL CHECK (clerk_env IN ('development', 'production'))`;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ai_memories (
     id            bigserial   PRIMARY KEY,
     ${ENV},
     scope         text        NOT NULL CHECK (scope IN ('personal', 'global')),
     owner_user_id text,
     text          text        NOT NULL,
     category      text,
     created_by    text,
     created_at    timestamptz NOT NULL DEFAULT now(),
     updated_by    text,
     updated_at    timestamptz NOT NULL DEFAULT now(),
     CHECK ((scope = 'personal') = (owner_user_id IS NOT NULL))
   )`,
  `CREATE INDEX IF NOT EXISTS ai_memories_scope ON ai_memories (clerk_env, scope, owner_user_id, updated_at DESC)`,
];

export class MemoryUnavailableError extends Error {
  constructor() {
    super("DATABASE_URL is not set");
    this.name = "MemoryUnavailableError";
  }
}

let schemaReady = false;

async function memorySql() {
  const sql = getSql();
  if (!sql) throw new MemoryUnavailableError();
  if (!schemaReady) {
    for (const statement of SCHEMA) await sql.query(statement);
    schemaReady = true;
  }
  return sql;
}

interface MemoryRow {
  id: string | number;
  scope: MemoryScope;
  owner_user_id: string | null;
  text: string;
  category: string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_by: string | null;
  updated_at: Date | string;
}

const COLUMNS = `id, scope, owner_user_id, text, category, created_by, created_at, updated_by, updated_at`;

const toMemory = (row: MemoryRow): Memory => ({
  id: Number(row.id),
  scope: row.scope,
  ownerUserId: row.owner_user_id,
  text: row.text,
  category: row.category,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
});

/** The database behind the memory rules (service.ts), for one environment. */
export function memoryDeps(env: ClerkEnv): MemoryDeps {
  return {
    async listGlobal() {
      const sql = await memorySql();
      const rows = (await sql.query(
        `SELECT ${COLUMNS} FROM ai_memories WHERE clerk_env = $1 AND scope = 'global' ORDER BY updated_at DESC, id DESC`,
        [env],
      )) as MemoryRow[];
      return rows.map(toMemory);
    },

    async listPersonal(userId) {
      const sql = await memorySql();
      const rows = (await sql.query(
        `SELECT ${COLUMNS} FROM ai_memories
          WHERE clerk_env = $1 AND scope = 'personal' AND owner_user_id = $2
          ORDER BY updated_at DESC, id DESC`,
        [env, userId],
      )) as MemoryRow[];
      return rows.map(toMemory);
    },

    async get(userId, id) {
      const sql = await memorySql();
      const rows = (await sql.query(
        `SELECT ${COLUMNS} FROM ai_memories
          WHERE clerk_env = $1 AND id = $2 AND (scope = 'global' OR owner_user_id = $3)`,
        [env, id, userId],
      )) as MemoryRow[];
      return rows[0] ? toMemory(rows[0]) : null;
    },

    async count(scope, userId) {
      const sql = await memorySql();
      const [row] = (await sql.query(
        `SELECT count(*) AS memories FROM ai_memories
          WHERE clerk_env = $1 AND scope = $2 AND ($2 = 'global' OR owner_user_id = $3)`,
        [env, scope, userId],
      )) as Array<{ memories: string | number }>;
      return Number(row?.memories ?? 0);
    },

    async insert(write) {
      const sql = await memorySql();
      const [row] = (await sql.query(
        `INSERT INTO ai_memories (clerk_env, scope, owner_user_id, text, category, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING ${COLUMNS}`,
        [env, write.scope, write.ownerUserId, write.text, write.category, write.userId],
      )) as MemoryRow[];
      return toMemory(row);
    },

    // Like `get`, each change matches a global row or one of THIS person's own - never another person's.
    async update(id, write) {
      const sql = await memorySql();
      const rows = (await sql.query(
        `UPDATE ai_memories SET text = $3, category = $4, updated_by = $5, updated_at = now()
          WHERE clerk_env = $1 AND id = $2 AND (scope = 'global' OR owner_user_id = $5) RETURNING ${COLUMNS}`,
        [env, id, write.text, write.category, write.userId],
      )) as MemoryRow[];
      return rows[0] ? toMemory(rows[0]) : null;
    },

    async move(id, write) {
      const sql = await memorySql();
      const rows = (await sql.query(
        `UPDATE ai_memories SET scope = $3, owner_user_id = $4, updated_by = $5, updated_at = now()
          WHERE clerk_env = $1 AND id = $2 AND (scope = 'global' OR owner_user_id = $5) RETURNING ${COLUMNS}`,
        [env, id, write.scope, write.ownerUserId, write.userId],
      )) as MemoryRow[];
      return rows[0] ? toMemory(rows[0]) : null;
    },

    async remove(userId, id) {
      const sql = await memorySql();
      const rows = (await sql.query(
        `DELETE FROM ai_memories WHERE clerk_env = $1 AND id = $2 AND (scope = 'global' OR owner_user_id = $3) RETURNING id`,
        [env, id, userId],
      )) as unknown[];
      return rows.length > 0;
    },
  };
}
