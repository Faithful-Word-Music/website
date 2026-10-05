import { NextResponse } from "next/server";

import { aiContent } from "@/content/ai";
import { conductorContent } from "@/content/conductor";
import { answerConductor } from "@/lib/ai/conductor/conductor";
import { CONDUCTOR_LIMITS } from "@/lib/ai/conductor/limits";
import { parseConductorRequest } from "@/lib/ai/conductor/protocol";
import type { AiErrorCode } from "@/lib/ai/errors";
import { AI_STREAM_CONTENT_TYPE } from "@/lib/ai/stream";
import { getViewer } from "@/lib/auth/session";

/** Longer than the AI layer's own time limit, so that limit is the one that ends a slow answer. */
export const maxDuration = 120;

const headers = { "Cache-Control": "private, no-store" };
const refuse = (status: number, error: string) => NextResponse.json({ error }, { status, headers });

const STATUS: Partial<Record<AiErrorCode, number>> = { forbidden: 403, "rate-limited": 429, "invalid-response": 400 };

/**
 * POST /api/conductor
 *
 * One question to Conductor, answered as a stream (src/lib/ai/stream.ts). The
 * Conductor page and the floating panel both ask here, so there is one
 * Conductor however it is opened.
 *
 * Only for someone holding use_ai: checked here, where the request arrives,
 * and again inside the AI layer (src/lib/ai/service.ts). The body is the
 * conversation so far and the page Conductor was opened over; neither is
 * stored, here or in the usage log.
 */
export async function POST(request: Request) {
  let viewer;
  try {
    viewer = await getViewer();
  } catch (error) {
    console.error("[conductor] Could not load the session:", error instanceof Error ? error.message : "unknown error");
    return refuse(503, aiContent.errors.unknown);
  }
  if (!viewer) return refuse(401, conductorContent.errors.signedOut);
  if (!viewer.can("use_ai")) {
    console.warn(`[conductor] Refused ${viewer.userId}: no use_ai permission.`);
    return refuse(403, aiContent.errors.forbidden);
  }

  const parsed = parseConductorRequest(await request.json().catch(() => null));
  if (!parsed.ok) {
    const error =
      parsed.problem === "too-long"
        ? conductorContent.composer.tooLong.replace("{max}", CONDUCTOR_LIMITS.questionChars.toLocaleString("en-US"))
        : conductorContent.errors[parsed.problem];
    return refuse(400, error);
  }

  const answer = await answerConductor({ viewer, turns: parsed.turns, context: parsed.context, signal: request.signal });
  if (!answer.ok) return refuse(STATUS[answer.code] ?? 503, answer.message);

  return new Response(answer.stream, {
    headers: {
      ...headers,
      "Content-Type": AI_STREAM_CONTENT_TYPE,
      // Each event is sent as it is written, not held back to be compressed or batched.
      "X-Accel-Buffering": "no",
    },
  });
}
