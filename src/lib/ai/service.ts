import "server-only";

import { gateway, generateText, isStepCount, streamText, type ToolSet } from "ai";

import { aiContent } from "@/content/ai";
import type { ClerkEnv } from "@/lib/auth/clerk-env";
import type { Viewer } from "@/lib/auth/session";

import { aiConfig } from "./config";
import { classifyAiError, type AiErrorCode } from "./errors";
import type { AiFeature } from "./features";
import { AI_TIMEOUT_MS } from "./settings";
import { listUncostedAiUsage, recordAiUsage, setAiUsageCost } from "./store";
import { encodeStreamEvent, type AiStreamEvent } from "./stream";
import { addTokenUsage, NO_TOKEN_USAGE, parseCost, readGatewayMetadata, readTokenUsage, type AiTokenUsage } from "./usage";

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
 *
 * Two ways to ask, sharing all of the above:
 *
 *   generateAiText()  one prompt, one answer, returned whole
 *   streamAiText()    a conversation, optionally with tools the model may
 *                     call, answered as a stream of the site's own events
 *                     (src/lib/ai/stream.ts) - what Conductor uses
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

// ---------------------------------------------------------------------------
// Streaming, with tools
// ---------------------------------------------------------------------------

export interface AiStreamRequest {
  /** Who is asking. Must hold use_ai. */
  viewer: Viewer;
  feature: AiFeature;
  action?: string;
  instructions?: string;
  /** The conversation, oldest first, ending with what is being asked. Text only. */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** Tools the model may call. Each runs on the server and answers the model, never the browser. */
  tools?: ToolSet;
  /**
   * The most model calls one answer may take: each round of tool use is one,
   * and writing the answer is one. This is what stops a loop of tool calls.
   */
  maxSteps?: number;
  maxOutputTokens?: number;
  reasoning?: AiReasoning;
  /** How long one tool may run before the model is told it failed. */
  toolTimeoutMs?: number;
  /** Ends the request when the person stops it or leaves. */
  abortSignal?: AbortSignal;
  /**
   * What to tell the browser while a tool runs: a key the feature's own
   * content words, or null to say nothing. The tool's name, input and result
   * are never sent.
   */
  toolStatus?: (toolName: string) => string | null;
}

export type AiStreamResult =
  /** The answer, as newline-separated AiStreamEvents (src/lib/ai/stream.ts). */
  | { ok: true; stream: ReadableStream<Uint8Array> }
  /** Refused before anything was asked of the model. */
  | { ok: false; code: AiErrorCode; message: string };

/**
 * Asks the model to answer a conversation, streaming the answer as it is
 * written. With `tools`, the model may look things up first: each tool call
 * and its result goes back to the model, up to `maxSteps` model calls, and
 * only the answer's text (and a status while a tool runs) reaches the caller.
 *
 * However many model calls an answer takes, it is ONE row in ai_usage: the
 * tokens of every call added up, the Gateway's costs added up, how long the
 * whole thing took and how it ended. A request the person stopped is logged
 * as stopped ("aborted"), with whatever had been used by then.
 *
 * Like generateAiText() it never throws: a refusal comes back as
 * { ok: false }, and a failure once the stream has begun arrives in it as an
 * `error` event with wording safe to show.
 */
export async function streamAiText(request: AiStreamRequest): Promise<AiStreamResult> {
  const { viewer, feature } = request;
  const refuse = (code: AiErrorCode): AiStreamResult => ({ ok: false, code, message: aiContent.errors[code] });

  if (!viewer.can("use_ai")) {
    console.warn(`[ai] Refused ${feature} for ${viewer.userId}: no use_ai permission.`);
    return refuse("forbidden");
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
    return refuse("not-configured");
  }

  // Stops the model when the reader goes away, as well as when the caller says so.
  const gone = new AbortController();
  const abortSignal = request.abortSignal ? AbortSignal.any([request.abortSignal, gone.signal]) : gone.signal;
  const encoder = new TextEncoder();
  const started = performance.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: AiStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeStreamEvent(event)));
        } catch {
          // The reader has gone; the request is being aborted.
          open = false;
        }
      };

      // What is known about the request, gathered as each model call finishes.
      let tokens = NO_TOKEN_USAGE;
      let costUsd: number | null = 0;
      let steps = 0;
      let generationId: string | null = null;
      let responseModel: string | null = null;
      let finishReason: string | null = null;
      let written = 0;
      // Words written before a lookup and those after it are separate paragraphs.
      let breakDue = false;
      let cutShort = false;
      let failed: ReturnType<typeof classifyAiError> | null = null;

      try {
        const result = streamText({
          model: config.model,
          instructions: request.instructions,
          messages: request.messages,
          tools: request.tools,
          stopWhen: isStepCount(request.maxSteps ?? 1),
          maxOutputTokens: request.maxOutputTokens,
          reasoning: request.reasoning,
          timeout: { totalMs: AI_TIMEOUT_MS, ...(request.toolTimeoutMs ? { toolMs: request.toolTimeoutMs } : {}) },
          maxRetries: 1,
          abortSignal,
          providerOptions: {
            gateway: { user: viewer.userId, tags: [`feature:${feature}`, `env:${viewer.env}`] },
          },
          // Reported through the stream below; without this the SDK prints the raw error.
          onError: () => {},
        });

        for await (const part of result.stream) {
          switch (part.type) {
            case "text-delta":
              if (part.text === "") break;
              if (breakDue && part.text.trim() !== "") {
                send({ type: "text", delta: "\n\n" });
                breakDue = false;
              }
              written += part.text.length;
              send({ type: "text", delta: part.text });
              break;
            case "tool-call": {
              const key = request.toolStatus?.(part.toolName) ?? null;
              if (key) send({ type: "status", key });
              break;
            }
            case "finish-step": {
              steps += 1;
              breakDue = written > 0;
              tokens = addTokenUsage(tokens, readTokenUsage(part.usage));
              const metadata = readGatewayMetadata(part.providerMetadata);
              // One call without a cost and the total is not known.
              costUsd = costUsd === null || metadata.costUsd === null ? null : costUsd + metadata.costUsd;
              generationId = metadata.generationId;
              responseModel = part.response?.modelId || responseModel;
              finishReason = part.finishReason;
              break;
            }
            case "finish":
              finishReason = part.finishReason;
              break;
            case "abort":
              cutShort = true;
              break;
            case "error":
              failed = classifyAiError(part.error);
              break;
          }
        }
      } catch (error) {
        failed = classifyAiError(error);
      }

      // Stopped by the person (or by their leaving) is not a failure. An abort
      // nobody here asked for is the time limit.
      const aborted = abortSignal.aborted;
      if (aborted) failed = null;
      else if (!failed && cutShort) {
        failed = { code: "timeout", detail: `Gave up after ${Math.round(AI_TIMEOUT_MS / 1000)} seconds.`, generationId };
      } else if (!failed && written === 0) {
        failed = {
          code: "invalid-response",
          detail: `No text returned after ${steps} model call${steps === 1 ? "" : "s"} (finish reason: ${finishReason ?? "none"}).`,
          generationId,
        };
      }

      const durationMs = performance.now() - started;
      // The Gateway can only be asked later for ONE call's cost, so a late cost is only filled in for a one-call answer.
      const loggedCost = steps === 0 ? null : costUsd;
      const loggedGeneration = steps <= 1 ? (generationId ?? failed?.generationId ?? null) : null;
      if (failed) console.error(`[ai] ${feature} failed (${failed.code}): ${failed.detail}`);
      await recordAiUsage({
        ...entry,
        responseModel,
        status: failed ? "error" : "success",
        errorCode: failed?.code ?? null,
        errorDetail: failed?.detail ?? null,
        tokens,
        costUsd: loggedCost,
        durationMs,
        generationId: loggedGeneration,
        finishReason: aborted ? "aborted" : finishReason,
      });

      if (failed) send({ type: "error", code: failed.code, message: aiContent.errors[failed.code] });
      else if (!aborted) send({ type: "done" });
      if (open) {
        try {
          controller.close();
        } catch {
          // Already closed by the reader leaving.
        }
      }
    },
    cancel() {
      gone.abort();
    },
  });

  return { ok: true, stream };
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
