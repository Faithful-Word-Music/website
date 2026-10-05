/**
 * The AI system's settings and their defaults. None of these is a secret: the
 * one secret (the AI Gateway key) is read only by the AI SDK, on the server.
 * src/lib/ai/config.ts reads the environment through these.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

/**
 * The model used when AI_MODEL is not set: an AI Gateway "provider/model" ID.
 * Changing models is one environment variable, never a code change; the IDs
 * on offer are listed at https://ai-gateway.vercel.sh/v1/models.
 */
export const DEFAULT_AI_MODEL = "openai/gpt-5.6-terra";

/**
 * The monthly budget shown beside the site's own usage, in US dollars, when
 * AI_MONTHLY_BUDGET_USD is not set. For display only: the limit that actually
 * stops spending is the budget set in Vercel AI Gateway, which should match.
 */
export const DEFAULT_MONTHLY_BUDGET_USD = 10;

/** Where spending is really capped and reported: the AI Gateway's budgets, in the Vercel dashboard. */
export const AI_GATEWAY_DASHBOARD_URL =
  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fbudgets&title=AI+Gateway+Budgets";

/** How long one request may take before it is given up on. */
export const AI_TIMEOUT_MS = 60_000;

/** "provider/model", as AI Gateway names its models. */
const MODEL_ID = /^[a-z0-9][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/;

/** AI_MODEL as a model ID: the default when it is unset, blank or not shaped like one. */
export function parseModelId(value: string | undefined): string {
  const id = value?.trim() ?? "";
  return MODEL_ID.test(id) && id.length <= 100 ? id : DEFAULT_AI_MODEL;
}

/**
 * AI_MONTHLY_BUDGET_USD as dollars: the default when unset or unreadable, and
 * null for 0 ("show no budget").
 */
export function parseMonthlyBudget(value: string | undefined): number | null {
  const text = value?.trim().replace(/^\$/, "") ?? "";
  if (text === "") return DEFAULT_MONTHLY_BUDGET_USD;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return DEFAULT_MONTHLY_BUDGET_USD;
  return amount === 0 ? null : amount;
}
