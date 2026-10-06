import { NextResponse } from "next/server";

import { planAiMessage, planAiRequestSchema, planAiStatus, type PlanAiFailure, type PlanAiResponse } from "@/lib/ai/service-planner/protocol";
import { answerPlanRequest } from "@/lib/ai/service-planner/run";
import { getViewer } from "@/lib/auth/session";

/** Longer than the AI layer's own time limit for a request and its one correction, so that limit ends a slow answer. */
export const maxDuration = 180;

const headers = { "Cache-Control": "private, no-store" };
const refuse = (failure: PlanAiFailure) =>
  NextResponse.json({ ok: false, problem: failure.problem, error: planAiMessage(failure) } satisfies PlanAiResponse, {
    status: planAiStatus(failure),
    headers,
  });

/**
 * POST /api/service-planner/ai
 *
 * Generate with AI and Suggest with AI, for the Service Planner's workspace:
 * the songs as they stand in the editor come in, and songs for the editor go
 * back (src/lib/ai/service-planner/plan.ts).
 *
 * Only for someone holding BOTH manage_service_plans and use_ai - checked
 * here, where the request arrives, and again inside. Hiding the buttons is
 * never the protection.
 *
 * It reads and answers. It does not save or publish the service, touch any
 * other service or the week's insert, or revalidate a page: what comes back
 * is unsaved in the editor until the person saves it. Neither the songs sent
 * nor the instruction is stored, here or in the usage log.
 */
export async function POST(request: Request) {
  let viewer;
  try {
    viewer = await getViewer();
  } catch (error) {
    console.error("[service-planner] Could not load the session:", error instanceof Error ? error.message : "unknown error");
    return refuse({ ok: false, problem: "unavailable" });
  }
  if (!viewer) return refuse({ ok: false, problem: "signed-out" });
  if (!viewer.can("manage_service_plans") || !viewer.can("use_ai")) {
    console.warn(`[service-planner] Refused AI for ${viewer.userId}: needs manage_service_plans and use_ai.`);
    return refuse({ ok: false, problem: "forbidden" });
  }

  const parsed = planAiRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return refuse({ ok: false, problem: "invalid" });

  try {
    const result = await answerPlanRequest(viewer, parsed.data, request.signal);
    return result.ok ? NextResponse.json(result satisfies PlanAiResponse, { headers }) : refuse(result);
  } catch (error) {
    console.error("[service-planner] AI planning failed:", error instanceof Error ? error.message : "unknown error");
    return refuse({ ok: false, problem: "unavailable" });
  }
}
