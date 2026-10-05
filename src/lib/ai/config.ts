import "server-only";

import { AI_GATEWAY_DASHBOARD_URL, parseModelId, parseMonthlyBudget } from "./settings";

/**
 * How the AI system is set up in this deployment, from the environment:
 *
 *   AI_GATEWAY_API_KEY      the Vercel AI Gateway key (secret). On Vercel the
 *                           deployment's own VERCEL_OIDC_TOKEN works instead.
 *   AI_MODEL                the model, e.g. "openai/gpt-5.6-terra" (optional)
 *   AI_MONTHLY_BUDGET_USD   the budget shown beside usage (optional)
 *
 * The key itself is never read here, returned or logged - only whether one is
 * present. The AI SDK picks it up from the environment by itself.
 */
export interface AiConfig {
  /** Whether a request can be attempted at all. */
  configured: boolean;
  /** How requests authenticate with the Gateway, or null when they cannot. */
  auth: "api-key" | "oidc" | null;
  model: string;
  /** The budget to show, in US dollars; null to show none. */
  monthlyBudgetUsd: number | null;
  dashboardUrl: string;
}

export function aiConfig(): AiConfig {
  const auth = process.env.AI_GATEWAY_API_KEY ? "api-key" : process.env.VERCEL_OIDC_TOKEN ? "oidc" : null;
  return {
    configured: auth !== null,
    auth,
    model: parseModelId(process.env.AI_MODEL),
    monthlyBudgetUsd: parseMonthlyBudget(process.env.AI_MONTHLY_BUDGET_USD),
    dashboardUrl: AI_GATEWAY_DASHBOARD_URL,
  };
}
