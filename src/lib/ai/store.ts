import "server-only";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { getSql } from "@/lib/db";

import type { AiErrorCode } from "./errors";
import type { AiFeature } from "./features";
import { NO_USAGE, type AiCallUsage, type AiTokenUsage, type AiUsageGroup, type AiUsageTotals } from "./usage";

/**
 * The site's own record of AI usage: one row per request, successful or not.
 * AI Gateway remains the authority on what was spent and enforces the budget;
 * these tables are what let the site report usage by feature and by model.
 *
 *   ai_usage         one row per request AS A PERSON MEANS IT (one Conductor
 *                    question, one refresh of the library index): when, which
 *                    feature (and action within it), who asked, the totals of
 *                    tokens and cost, how long it took, and how it ended
 *   ai_usage_calls   the actual Gateway calls beneath it, one row each: which
 *                    model (a chat model, an embedding model), its tokens, its
 *                    cost and the generation ID a late cost is asked for by
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

const TOKEN_COLUMNS = `input_tokens, output_tokens, reasoning_tokens, cached_input_tokens, total_tokens`;

/**
 * The actual Gateway calls beneath each request (AiCallUsage in usage.ts).
 * Created once; the requests logged before it existed are each given the one
 * call they were recorded as, so every month breaks down the same way.
 */
const CALLS_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ai_usage_calls (
     id                  bigserial   PRIMARY KEY,
     ${ENV},
     usage_id            bigint      NOT NULL REFERENCES ai_usage (id) ON DELETE CASCADE,
     created_at          timestamptz NOT NULL DEFAULT now(),
     kind                text        NOT NULL CHECK (kind IN ('language', 'embedding')),
     model               text        NOT NULL,
     response_model      text,
     input_tokens        integer,
     output_tokens       integer,
     reasoning_tokens    integer,
     cached_input_tokens integer,
     total_tokens        integer,
     cost_usd            numeric(12, 6),
     generation_id       text
   )`,
  `CREATE INDEX IF NOT EXISTS ai_usage_calls_usage ON ai_usage_calls (usage_id)`,
  `INSERT INTO ai_usage_calls (clerk_env, usage_id, created_at, kind, model, response_model, ${TOKEN_COLUMNS}, cost_usd, generation_id)
   SELECT clerk_env, id, created_at, 'language', model, response_model, ${TOKEN_COLUMNS}, cost_usd, generation_id
     FROM ai_usage u
    WHERE (u.total_tokens IS NOT NULL OR u.cost_usd IS NOT NULL OR u.generation_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM ai_usage_calls c WHERE c.usage_id = u.id)`,
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
    const [calls] = (await sql.query(`SELECT to_regclass('ai_usage_calls') IS NOT NULL AS present`)) as Array<{ present: boolean }>;
    if (!calls?.present) for (const statement of CALLS_SCHEMA) await sql.query(statement);
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
  /** The request's totals: what its calls used, added up (sumCalls in usage.ts). */
  tokens: AiTokenUsage;
  costUsd: number | null;
  durationMs: number | null;
  /** Of a call that failed before it could be recorded as one, for the server log's sake. */
  generationId?: string | null;
  finishReason?: string | null;
  /** The Gateway calls the request made, in order. None when it never reached the Gateway. */
  calls?: readonly AiCallUsage[];
}

/**
 * Logs one request, with the calls beneath it, and returns its row ID. NEVER
 * throws: the log failing must not turn an AI answer into an error, so a
 * failure is reported to the server log and null is returned.
 */
export async function recordAiUsage(entry: AiUsageEntry): Promise<number | null> {
  try {
    const sql = await usageSql();
    const calls = (entry.calls ?? []).map((call) => ({
      kind: call.kind,
      model: call.model,
      response_model: call.responseModel,
      input_tokens: call.tokens.inputTokens,
      output_tokens: call.tokens.outputTokens,
      reasoning_tokens: call.tokens.reasoningTokens,
      cached_input_tokens: call.tokens.cachedInputTokens,
      total_tokens: call.tokens.totalTokens,
      cost_usd: call.costUsd,
      generation_id: call.generationId,
    }));
    // One statement, so a request is never logged without its calls.
    const [row] = (await sql.query(
      `WITH logged AS (
         INSERT INTO ai_usage (clerk_env, feature, action, model, response_model, clerk_user_id, status, error_code,
           error_detail, ${TOKEN_COLUMNS}, cost_usd, duration_ms, generation_id, finish_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING id
       ), made AS (
         INSERT INTO ai_usage_calls (clerk_env, usage_id, kind, model, response_model, ${TOKEN_COLUMNS}, cost_usd, generation_id)
         SELECT $1, logged.id, c.kind, c.model, c.response_model, c.input_tokens, c.output_tokens, c.reasoning_tokens,
                c.cached_input_tokens, c.total_tokens, c.cost_usd, c.generation_id
           FROM logged, jsonb_to_recordset($19::jsonb) AS c(kind text, model text, response_model text, input_tokens integer,
                output_tokens integer, reasoning_tokens integer, cached_input_tokens integer, total_tokens integer,
                cost_usd numeric, generation_id text)
       )
       SELECT id FROM logged`,
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
        JSON.stringify(calls),
      ],
    )) as Array<{ id: string | number }>;
    return row ? Number(row.id) : null;
  } catch (error) {
    console.error("[ai] Could not log usage:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

/** Calls whose cost the Gateway had not worked out when they were logged, newest first. */
export async function listUncostedAiCalls(env: ClerkEnv, limit = 20): Promise<Array<{ id: number; generationId: string }>> {
  const sql = await usageSql();
  const rows = (await sql.query(
    `SELECT id, generation_id FROM ai_usage_calls
      WHERE clerk_env = $1 AND cost_usd IS NULL AND generation_id IS NOT NULL
        AND created_at > now() - interval '35 days'
      ORDER BY created_at DESC LIMIT $2`,
    [env, limit],
  )) as Array<{ id: string | number; generation_id: string }>;
  return rows.map((row) => ({ id: Number(row.id), generationId: row.generation_id }));
}

/**
 * Fills in a call's cost learned after its request was logged (never
 * replacing one already there), and once none of that request's calls is
 * still waiting, the request's own cost: the sum of its calls'.
 */
export async function setAiCallCost(env: ClerkEnv, id: number, costUsd: number): Promise<void> {
  const sql = await usageSql();
  await sql.query(
    `WITH priced AS (
       UPDATE ai_usage_calls SET cost_usd = $3 WHERE clerk_env = $1 AND id = $2 AND cost_usd IS NULL RETURNING usage_id
     )
     UPDATE ai_usage u
        SET cost_usd = (SELECT coalesce(sum(c.cost_usd), 0) FROM ai_usage_calls c WHERE c.usage_id = u.id AND c.id <> $2) + $3
       FROM priced
      WHERE u.id = priced.usage_id
        AND NOT EXISTS (
          SELECT 1 FROM ai_usage_calls c
           WHERE c.usage_id = u.id AND c.id <> $2 AND c.cost_usd IS NULL AND c.generation_id IS NOT NULL
        )`,
    [env, id, costUsd],
  );
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * How many requests one person has made for a feature since `since` (ISO),
 * failed ones included - what a feature's own hourly limit counts.
 */
export async function countRecentAiUsage(env: ClerkEnv, userId: string, feature: AiFeature, since: string): Promise<number> {
  const sql = await usageSql();
  const [row] = (await sql.query(
    `SELECT count(*) AS requests FROM ai_usage
      WHERE clerk_env = $1 AND clerk_user_id = $2 AND feature = $3 AND created_at >= $4::timestamptz`,
    [env, userId, feature, since],
  )) as Array<{ requests: string | number }>;
  return Number(row?.requests ?? 0);
}

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
    // By the model each CALL went to: a question that also embedded its search is counted under both
    // models, each with its own cost. A request that never reached the Gateway has no calls and counts
    // under the model it was for.
    sql.query(
      `SELECT coalesce(c.model, u.model) AS key,
              count(DISTINCT u.id) AS requests,
              count(DISTINCT u.id) FILTER (WHERE u.status = 'error') AS errors,
              coalesce(sum(c.cost_usd), 0) AS cost,
              coalesce(sum(c.total_tokens), 0) AS tokens
         FROM ai_usage u LEFT JOIN ai_usage_calls c ON c.usage_id = u.id
        WHERE u.clerk_env = $1 AND u.created_at >= $2::timestamptz AND u.created_at < $3::timestamptz
        GROUP BY 1 ORDER BY cost DESC, requests DESC`,
      args,
    ),
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
  /** Why the model stopped; "aborted" when the person stopped it. */
  finishReason: string | null;
}

/** The latest requests, newest first. */
export async function listRecentAiUsage(env: ClerkEnv, limit = 20): Promise<AiUsageRecord[]> {
  const sql = await usageSql();
  const rows = (await sql.query(
    `SELECT id, created_at, feature, action, model, status, error_code, total_tokens, reasoning_tokens, cost_usd, duration_ms, finish_reason
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
    finish_reason: string | null;
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
    finishReason: row.finish_reason,
  }));
}
