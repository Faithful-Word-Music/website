import "server-only";

import { gateway, generateText } from "ai";

import { aiContent } from "@/content/ai";
import type { ClerkEnv } from "@/lib/auth/clerk-env";
import type { Viewer } from "@/lib/auth/session";

import { aiConfig } from "./config";
import { classifyAiError, type AiErrorCode } from "./errors";
import type { AiFeature } from "./features";
import { AI_TIMEOUT_MS } from "./settings";
import { listUncostedAiUsage, recordAiUsage, setAiUsageCost } from "./store";
import { NO_TOKEN_USAGE, parseCost, readGatewayMetadata, readTokenUsage, type AiTokenUsage } from "./usage";

/**
 * The site's one way of talking to an AI model. EVERY AI request goes through
 * this module - it is the only file that imports the AI SDK (ESLint enforces
 * that), so no page, action or component calls a model directly.
 *
 * Each request here:
 *
 *   1. is refused unless the person holds use_ai - checked again here, on top
 *      of the action or route that called it;
 *   2. goes to the configured model through Vercel AI Gateway, by its
 *      "provider/model" ID, so changing model or provider is configuration;
 *   3. is logged to ai_usage whether it worked or not - feature, model,
 *      tokens, cost, duration, outcome - and never its prompt or its answer;
 *   4. NEVER throws: a failure comes back as { ok: false } with a code and
 *      wording safe to show, so AI being down cannot break the page using it.
 *
 * The key is read by the AI SDK from the environment; it never passes
 * through this code. See AI.md for the whole system.
 */

/** How hard a reasoning model should think; left to the model when not given. */
export type AiReasoning = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface AiTextRequest {
  /** Who is asking. Must hold use_ai. */
  viewer: Viewer;
  /** Which feature this is for - what its cost is reported under. */
  feature: AiFeature;
  /** What the feature is doing, when it does more than one thing. */
  action?: string;
  /** The standing instructions (the "system prompt"). */
  instructions?: string;
  prompt: string;
  maxOutputTokens?: number;
  reasoning?: AiReasoning;
}

export type AiTextResult =
  | {
      ok: true;
      text: string;
      /** The model that answered. */
      model: string;
      tokens: AiTokenUsage;
      /** Null when the Gateway had not worked the cost out yet; it is filled in later. */
      costUsd: number | null;
      durationMs: number;
    }
  | { ok: false; code: AiErrorCode; message: string };

const failure = (code: AiErrorCode): AiTextResult => ({ ok: false, code, message: aiContent.errors[code] });

/** Asks the model for text. See the notes at the top of this file. */
export async function generateAiText(request: AiTextRequest): Promise<AiTextResult> {
  const { viewer, feature } = request;
  if (!viewer.can("use_ai")) {
    console.warn(`[ai] Refused ${feature} for ${viewer.userId}: no use_ai permission.`);
    return failure("forbidden");
  }

  const config = aiConfig();
  const entry = {
    env: viewer.env,
    feature,
    action: request.action ?? null,
    model: config.model,
    userId: viewer.userId,
  };

  if (!config.configured) {
    console.error("[ai] AI is not configured: neither AI_GATEWAY_API_KEY nor a Vercel deployment token is set.");
    await recordAiUsage({
      ...entry,
      status: "error",
      errorCode: "not-configured",
      tokens: NO_TOKEN_USAGE,
      costUsd: null,
      durationMs: null,
    });
    return failure("not-configured");
  }

  const started = performance.now();
  try {
    const result = await generateText({
      model: config.model,
      instructions: request.instructions,
      prompt: request.prompt,
      maxOutputTokens: request.maxOutputTokens,
      reasoning: request.reasoning,
      timeout: AI_TIMEOUT_MS,
      maxRetries: 1,
      providerOptions: {
        // Reporting dimensions in the Gateway's own dashboard, matching the usage table.
        gateway: { user: viewer.userId, tags: [`feature:${feature}`, `env:${viewer.env}`] },
      },
    });
    const durationMs = performance.now() - started;
    const tokens = readTokenUsage(result.usage);
    const { generationId, costUsd } = readGatewayMetadata(result.providerMetadata);
    const model = result.response?.modelId || config.model;
    const empty = result.text.trim() === "";

    if (empty) console.error(`[ai] ${feature}: the model returned no text (${result.finishReason}).`);
    await recordAiUsage({
      ...entry,
      responseModel: model,
      status: empty ? "error" : "success",
      errorCode: empty ? "invalid-response" : null,
      errorDetail: empty ? `No text returned (finish reason: ${result.finishReason}).` : null,
      tokens,
      costUsd,
      durationMs,
      generationId,
      finishReason: result.finishReason,
    });
    if (empty) return failure("invalid-response");
    return { ok: true, text: result.text, model, tokens, costUsd, durationMs };
  } catch (error) {
    const failed = classifyAiError(error);
    console.error(`[ai] ${feature} failed (${failed.code}): ${failed.detail}`);
    await recordAiUsage({
      ...entry,
      status: "error",
      errorCode: failed.code,
      errorDetail: failed.detail,
      tokens: NO_TOKEN_USAGE,
      costUsd: null,
      durationMs: performance.now() - started,
      generationId: failed.generationId,
    });
    return failure(failed.code);
  }
}

/**
 * Fills in costs the Gateway had not worked out when their requests were
 * logged, by asking it for each generation. Called when usage is viewed, so
 * nothing waits on it. Returns how many were filled in; never throws.
 */
export async function backfillAiCosts(env: ClerkEnv): Promise<number> {
  if (!aiConfig().configured) return 0;
  try {
    const waiting = await listUncostedAiUsage(env);
    const filled = await Promise.all(
      waiting.map(async ({ id, generationId }) => {
        try {
          const costUsd = parseCost((await gateway.getGenerationInfo({ id: generationId })).totalCost);
          if (costUsd === null) return false;
          await setAiUsageCost(env, id, costUsd);
          return true;
        } catch {
          // Not ready yet, or gone: it is asked for again the next time usage is viewed.
          return false;
        }
      }),
    );
    return filled.filter(Boolean).length;
  } catch (error) {
    console.error("[ai] Could not fill in costs:", error instanceof Error ? error.message : "unknown error");
    return 0;
  }
}
