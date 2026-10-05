import "server-only";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { getSql } from "@/lib/db";

import type { AiErrorCode } from "./errors";
import type { AiFeature } from "./features";
import { NO_USAGE, type AiTokenUsage, type AiUsageGroup, type AiUsageTotals } from "./usage";

/**
 * The site's own record of AI usage: one row per request, successful or not.
 * AI Gateway remains the authority on what was spent and enforces the budget;
 * this table is what lets the site report usage by feature.
 *
 *   ai_usage   when, which feature (and action within it), which model, who
 *              asked, tokens, cost, how long it took, and how it ended
 *
 * What is deliberately NOT here: prompts, answers, or anything a person
 * typed. Conversation history, when it exists, gets tables of its own.
 *
 * Like the planner's tables it is created on first use and every row carries
 * the Clerk environment - Local, Preview and Production share one database.
 *
 * No authorization happens here: src/lib/ai/service.ts checks use_ai before
 * a request is made, and the pages that read this check it for themselves.
 */

const ENV = `clerk_env text NOT NULL CHECK (clerk_env IN ('development', 'production'))`;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ai_usage (
     id                  bigserial   PRIMARY KEY,
     ${ENV},
     created_at          timestamptz NOT NULL DEFAULT now(),
     feature             text        NOT NULL,
     action              text,
     model               text        NOT NULL,
     response_model      text,
     clerk_user_id       text,
     status              text        NOT NULL CHECK (status IN ('success', 'error')),
     error_code          text,
     error_detail        text,
     input_tokens        integer,
     output_tokens       integer,
     reasoning_tokens    integer,
     cached_input_tokens integer,
     total_tokens        integer,
     cost_usd            numeric(12, 6),
     duration_ms         integer,
     generation_id       text,
     finish_reason       text
   )`,
  `CREATE INDEX IF NOT EXISTS ai_usage_recent ON ai_usage (clerk_env, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS ai_usage_feature ON ai_usage (clerk_env, feature, created_at)`,
];

export class AiUsageUnavailableError extends Error {
  constructor() {
    super("DATABASE_URL is not set");
    this.name = "AiUsageUnavailableError";
  }
}

let schemaReady = false;

async function usageSql() {
  const sql = getSql();
  if (!sql) throw new AiUsageUnavailableError();
  if (!schemaReady) {
    for (const statement of SCHEMA) await sql.query(statement);
    schemaReady = true;
  }
  return sql;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface AiUsageEntry {
  env: ClerkEnv;
  feature: AiFeature;
  /** What the feature was doing, when it does more than one thing (e.g. "regenerate"). */
  action?: string | null;
  /** The model asked for. */
  model: string;
  /** The model that answered, which differs after a Gateway fallback. */
  responseModel?: string | null;
  userId: string | null;
  status: "success" | "error";
  errorCode?: AiErrorCode | null;
  /** Already sanitized (see sanitizeDetail in errors.ts). */
  errorDetail?: string | null;
  tokens: AiTokenUsage;
  costUsd: number | null;
  durationMs: number | null;
  generationId?: string | null;
  finishReason?: string | null;
}

/**
 * Logs one request and returns its row ID. NEVER throws: the log failing must
 * not turn an AI answer into an error, so a failure is reported to the server
 * log and null is returned.
 */
export async function recordAiUsage(entry: AiUsageEntry): Promise<number | null> {
  try {
    const sql = await usageSql();
    const [row] = (await sql.query(
      `INSERT INTO ai_usage (clerk_env, feature, action, model, response_model, clerk_user_id, status, error_code,
         error_detail, input_tokens, output_tokens, reasoning_tokens, cached_input_tokens, total_tokens, cost_usd,
         duration_ms, generation_id, finish_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING id`,
      [
        entry.env,
        entry.feature,
        entry.action ?? null,
        entry.model,
        entry.responseModel ?? null,
        entry.userId,
        entry.status,
        entry.errorCode ?? null,
        entry.errorDetail ?? null,
        entry.tokens.inputTokens,
        entry.tokens.outputTokens,
        entry.tokens.reasoningTokens,
        entry.tokens.cachedInputTokens,
        entry.tokens.totalTokens,
        entry.costUsd,
        entry.durationMs === null ? null : Math.round(entry.durationMs),
        entry.generationId ?? null,
        entry.finishReason ?? null,
      ],
    )) as Array<{ id: string | number }>;
    return row ? Number(row.id) : null;
  } catch (error) {
    console.error("[ai] Could not log usage:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

/** Requests whose cost the Gateway had not worked out when they were logged, newest first. */
export async function listUncostedAiUsage(env: ClerkEnv, limit = 10): Promise<Array<{ id: number; generationId: string }>> {
  const sql = await usageSql();
  const rows = (await sql.query(
    `SELECT id, generation_id FROM ai_usage
      WHERE clerk_env = $1 AND status = 'success' AND cost_usd IS NULL AND generation_id IS NOT NULL
        AND created_at > now() - interval '35 days'
      ORDER BY created_at DESC LIMIT $2`,
    [env, limit],
  )) as Array<{ id: string | number; generation_id: string }>;
  return rows.map((row) => ({ id: Number(row.id), generationId: row.generation_id }));
}

/** Fills in a cost learned after the request was logged. Never replaces one already there. */
export async function setAiUsageCost(env: ClerkEnv, id: number, costUsd: number): Promise<void> {
  const sql = await usageSql();
  await sql.query(`UPDATE ai_usage SET cost_usd = $3 WHERE clerk_env = $1 AND id = $2 AND cost_usd IS NULL`, [
    env,
    id,
    costUsd,
  ]);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface AiUsageSummary {
  totals: AiUsageTotals;
  byFeature: AiUsageGroup[];
  byModel: AiUsageGroup[];
}

interface GroupRow {
  key: string;
  requests: string | number;
  errors: string | number;
  cost: string | number | null;
  tokens: string | number | null;
}

const toGroup = (row: GroupRow): AiUsageGroup => ({
  key: row.key,
  requests: Number(row.requests),
  errors: Number(row.errors),
  costUsd: Number(row.cost ?? 0),
  tokens: Number(row.tokens ?? 0),
});

const GROUP_COLUMNS = `count(*) AS requests,
  count(*) FILTER (WHERE status = 'error') AS errors,
  coalesce(sum(cost_usd), 0) AS cost,
  coalesce(sum(total_tokens), 0) AS tokens`;

/** Usage from `start` up to (not including) `end`: totals, and the same split by feature and by model. */
export async function getAiUsageSummary(env: ClerkEnv, start: string, end: string): Promise<AiUsageSummary> {
  const sql = await usageSql();
  const range = `clerk_env = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz`;
  const args = [env, start, end];
  const [totals, byFeature, byModel] = (await Promise.all([
    sql.query(
      `SELECT count(*) AS requests,
              count(*) FILTER (WHERE status = 'error') AS errors,
              coalesce(sum(cost_usd), 0) AS cost,
              count(*) FILTER (WHERE status = 'success' AND cost_usd IS NOT NULL) AS costed,
              coalesce(sum(input_tokens), 0) AS input,
              coalesce(sum(output_tokens), 0) AS output,
              coalesce(sum(reasoning_tokens), 0) AS reasoning,
              avg(duration_ms) FILTER (WHERE status = 'success') AS duration
         FROM ai_usage WHERE ${range}`,
      args,
    ),
    sql.query(`SELECT feature AS key, ${GROUP_COLUMNS} FROM ai_usage WHERE ${range} GROUP BY feature ORDER BY cost DESC, requests DESC`, args),
    sql.query(`SELECT model AS key, ${GROUP_COLUMNS} FROM ai_usage WHERE ${range} GROUP BY model ORDER BY cost DESC, requests DESC`, args),
  ])) as [Array<Record<string, string | number | null>>, GroupRow[], GroupRow[]];

  const row = totals[0];
  return {
    totals: row
      ? {
          requests: Number(row.requests),
          errors: Number(row.errors),
          costUsd: Number(row.cost ?? 0),
          costedRequests: Number(row.costed),
          inputTokens: Number(row.input ?? 0),
          outputTokens: Number(row.output ?? 0),
          reasoningTokens: Number(row.reasoning ?? 0),
          averageDurationMs: row.duration === null ? null : Number(row.duration),
        }
      : NO_USAGE,
    byFeature: byFeature.map(toGroup),
    byModel: byModel.map(toGroup),
  };
}

/** One logged request, as the Admin page lists it. */
export interface AiUsageRecord {
  id: number;
  at: string;
  feature: string;
  action: string | null;
  model: string;
  status: "success" | "error";
  errorCode: string | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  costUsd: number | null;
  durationMs: number | null;
}

/** The latest requests, newest first. */
export async function listRecentAiUsage(env: ClerkEnv, limit = 20): Promise<AiUsageRecord[]> {
  const sql = await usageSql();
  const rows = (await sql.query(
    `SELECT id, created_at, feature, action, model, status, error_code, total_tokens, reasoning_tokens, cost_usd, duration_ms
       FROM ai_usage WHERE clerk_env = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [env, limit],
  )) as Array<{
    id: string | number;
    created_at: Date | string;
    feature: string;
    action: string | null;
    model: string;
    status: "success" | "error";
    error_code: string | null;
    total_tokens: number | null;
    reasoning_tokens: number | null;
    cost_usd: string | number | null;
    duration_ms: number | null;
  }>;
  return rows.map((row) => ({
    id: Number(row.id),
    at: new Date(row.created_at).toISOString(),
    feature: row.feature,
    action: row.action,
    model: row.model,
    status: row.status,
    errorCode: row.error_code,
    totalTokens: row.total_tokens,
    reasoningTokens: row.reasoning_tokens,
    costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
    durationMs: row.duration_ms,
  }));
}
