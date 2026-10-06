import { after, NextResponse } from "next/server";

import { aiContent } from "@/content/ai";
import { conductorContent } from "@/content/conductor";
import { answerConductor, type ConductorAnswer } from "@/lib/ai/conductor/conductor";
import { CONDUCTOR_LIMITS } from "@/lib/ai/conductor/limits";
import { parseConductorRequest } from "@/lib/ai/conductor/protocol";
import { AI_STREAM_CONTENT_TYPE } from "@/lib/ai/stream";
import { getViewer } from "@/lib/auth/session";

/** Longer than the AI layer's own time limit, so that limit is the one that ends a slow answer. */
export const maxDuration = 120;

const headers = { "Cache-Control": "private, no-store" };
const refuse = (status: number, error: string) => NextResponse.json({ error }, { status, headers });

type Refusal = Extract<ConductorAnswer, { ok: false }>["code"];
const STATUS: Partial<Record<Refusal, number>> = { forbidden: 403, "rate-limited": 429, "invalid-response": 400, "not-found": 404 };

/**
 * POST /api/conductor
 *
 * One question to Conductor, answered as a stream (src/lib/ai/stream.ts). The
 * Conductor page, the desktop panel and the phone sheet all ask here, so
 * there is one Conductor however it is opened.
 *
 * Only for someone holding use_ai: checked here, where the request arrives,
 * and again inside the AI layer (src/lib/ai/service.ts). The body is the
 * question, the saved conversation it belongs to and the page Conductor was
 * opened over. The conversation itself is read from the server's own record,
 * for this person only - an id that is not theirs is a 404 - and the question
 * and its answer are stored there (src/lib/ai/conversations), never in the
 * usage log.
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

  const answer = await answerConductor({
    viewer,
    question: parsed.question,
    conversationId: parsed.conversationId,
    retry: parsed.retry,
    context: parsed.context,
    signal: request.signal,
  });
  if (!answer.ok) return refuse(STATUS[answer.code] ?? 503, answer.message);

  // The answer is stored, and the conversation's summary kept up, even if the person closes the page mid-answer.
  after(() => answer.finished);

  return new Response(answer.stream, {
    headers: {
      ...headers,
      "Content-Type": AI_STREAM_CONTENT_TYPE,
      // Each event is sent as it is written, not held back to be compressed or batched.
      "X-Accel-Buffering": "no",
    },
  });
}
