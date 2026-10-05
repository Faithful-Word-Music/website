/**
 * The numbers of AI usage: reading tokens and cost out of what the AI SDK
 * returns, and summing a month against its budget. The rows themselves are
 * read and written in src/lib/ai/store.ts.
 *
 * Pure - no server-only import, and no import of the AI SDK - so it can be
 * unit tested. Everything from the SDK is read as `unknown`: a provider that
 * reports less simply leaves a figure empty (null), never a guessed zero.
 */

/** Tokens for one request. A figure the provider did not report is null. */
export interface AiTokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  /** Tokens spent reasoning before answering (part of the output tokens), for models that report it. */
  reasoningTokens: number | null;
  /** Input tokens read from the provider's prompt cache, billed at a lower rate. */
  cachedInputTokens: number | null;
  totalTokens: number | null;
}

export const NO_TOKEN_USAGE: AiTokenUsage = {
  inputTokens: null,
  outputTokens: null,
  reasoningTokens: null,
  cachedInputTokens: null,
  totalTokens: null,
};

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

/** The AI SDK's `usage` object as the site's token figures. */
export function readTokenUsage(usage: unknown): AiTokenUsage {
  const value = record(usage);
  const input = count(value.inputTokens);
  const output = count(value.outputTokens);
  return {
    inputTokens: input,
    outputTokens: output,
    reasoningTokens: count(record(value.outputTokenDetails).reasoningTokens),
    cachedInputTokens: count(record(value.inputTokenDetails).cacheReadTokens),
    totalTokens: count(value.totalTokens) ?? (input !== null && output !== null ? input + output : null),
  };
}

/**
 * Two lots of tokens as one - for an answer that took several model calls,
 * which is logged as a single request. A figure neither reported stays null;
 * one that only some calls reported is the sum of those.
 */
export function addTokenUsage(a: AiTokenUsage, b: AiTokenUsage): AiTokenUsage {
  const sum = (x: number | null, y: number | null) => (x === null && y === null ? null : (x ?? 0) + (y ?? 0));
  return {
    inputTokens: sum(a.inputTokens, b.inputTokens),
    outputTokens: sum(a.outputTokens, b.outputTokens),
    reasoningTokens: sum(a.reasoningTokens, b.reasoningTokens),
    cachedInputTokens: sum(a.cachedInputTokens, b.cachedInputTokens),
    totalTokens: sum(a.totalTokens, b.totalTokens),
  };
}

/** An embedding call's `usage` ({ tokens }): everything it uses is input. */
export function readEmbeddingUsage(usage: unknown): AiTokenUsage {
  const tokens = count(record(usage).tokens);
  return { ...NO_TOKEN_USAGE, inputTokens: tokens, totalTokens: tokens };
}

/** A cost in US dollars from a number or a numeric string; null for anything else. */
export function parseCost(value: unknown): number | null {
  const amount = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof amount === "number" && Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/**
 * What AI Gateway says about a request in `providerMetadata.gateway`: its
 * generation ID, and its cost when the response carries one. The cost is not
 * always there - src/lib/ai/service.ts then asks the Gateway for it later by
 * generation ID.
 */
export function readGatewayMetadata(providerMetadata: unknown): { generationId: string | null; costUsd: number | null } {
  const gateway = record(record(providerMetadata).gateway);
  const generationId = typeof gateway.generationId === "string" && gateway.generationId !== "" ? gateway.generationId : null;
  return { generationId, costUsd: parseCost(gateway.cost) ?? parseCost(gateway.totalCost) };
}

// ---------------------------------------------------------------------------
// The calls behind one request
// ---------------------------------------------------------------------------

/**
 * One actual call to AI Gateway. A request as a person thinks of it (one
 * Conductor question, one refresh of the library index) is ONE row of
 * ai_usage however many of these it took: a chat model call for each round of
 * tool use, an embedding call when a tool searches by theme. Each is kept
 * beneath its request in ai_usage_calls, so cost is reported by the model
 * that was really used and every call's cost can be asked for later.
 */
export interface AiCallUsage {
  kind: "language" | "embedding";
  /** The model asked for. */
  model: string;
  /** The model that answered, which differs after a Gateway fallback. */
  responseModel: string | null;
  tokens: AiTokenUsage;
  /** Null when the Gateway had not worked it out. */
  costUsd: number | null;
  /** What the Gateway is asked by, later, for a cost it had not worked out. */
  generationId: string | null;
}

/** A call whose cost is not known yet but can still be asked for. */
export const costPending = (call: Pick<AiCallUsage, "costUsd" | "generationId">) =>
  call.costUsd === null && call.generationId !== null;

/**
 * What a request used in all: its calls' tokens added up, and their costs -
 * null while any call's cost is still to come (the row then shows "Cost
 * pending" and is filled in by the backfill), and null when no call reported
 * one at all. A call with neither a cost nor a generation ID can never be
 * priced, so it does not hold the others back.
 */
export function sumCalls(calls: readonly AiCallUsage[]): { tokens: AiTokenUsage; costUsd: number | null } {
  const tokens = calls.reduce((total, call) => addTokenUsage(total, call.tokens), NO_TOKEN_USAGE);
  const known = calls.filter((call) => call.costUsd !== null);
  const costUsd = calls.some(costPending) || known.length === 0 ? null : known.reduce((total, call) => total + call.costUsd!, 0);
  return { tokens, costUsd };
}

// ---------------------------------------------------------------------------
// A month of usage
// ---------------------------------------------------------------------------

export interface AiUsageTotals {
  requests: number;
  errors: number;
  costUsd: number;
  /** Successful requests whose cost is known, which is what an average is taken over. */
  costedRequests: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  /** Mean time a successful request took, or null when there were none. */
  averageDurationMs: number | null;
}

export const NO_USAGE: AiUsageTotals = {
  requests: 0,
  errors: 0,
  costUsd: 0,
  costedRequests: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  averageDurationMs: null,
};

/** One feature's or one model's share of a month. */
export interface AiUsageGroup {
  key: string;
  requests: number;
  errors: number;
  costUsd: number;
  tokens: number;
}

/** What a successful request cost on average, or null before any cost is known. */
export function averageCostUsd(totals: Pick<AiUsageTotals, "costUsd" | "costedRequests">): number | null {
  return totals.costedRequests > 0 ? totals.costUsd / totals.costedRequests : null;
}

export interface AiBudgetStatus {
  budgetUsd: number;
  spentUsd: number;
  /** Never below zero. */
  remainingUsd: number;
  /** 0 to 1 of the budget, and above 1 once it is overspent. */
  used: number;
  over: boolean;
}

/**
 * Spending against the display budget; null when no budget is shown. This
 * only reports - AI Gateway's own budget is what refuses requests.
 */
export function budgetStatus(spentUsd: number, budgetUsd: number | null): AiBudgetStatus | null {
  if (budgetUsd === null || !(budgetUsd > 0)) return null;
  return {
    budgetUsd,
    spentUsd,
    remainingUsd: Math.max(0, budgetUsd - spentUsd),
    used: spentUsd / budgetUsd,
    over: spentUsd > budgetUsd,
  };
}

export interface MonthWindow {
  /** "2026-10" */
  key: string;
  /** "October 2026" */
  label: string;
  /** The first instant of the month, and of the next one (ISO, UTC). */
  start: string;
  end: string;
}

/**
 * The calendar month holding `now`, in UTC - the clock AI Gateway's monthly
 * budgets reset on - so the site's month and the Gateway's are the same one.
 */
export function monthWindow(now: number): MonthWindow {
  const date = new Date(now);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return {
    key: start.toISOString().slice(0, 7),
    label: start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
