import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { conductorContent } from "@/content/conductor";
import { isActionChoice } from "@/lib/ai/conductor/actions";
import { conductorHeaders, conductorRefusal, conductorRoute, conductorViewer } from "@/lib/ai/conductor/request";
import { resolveAction, type ResolveProblem } from "@/lib/ai/conductor/resolve";
import { isConversationId } from "@/lib/ai/conversations/model";
import { claimAction, getAction, releaseAction } from "@/lib/ai/conversations/store";
import { memoryDeps } from "@/lib/ai/memory/store";
import { philosophyDeps } from "@/lib/ai/planning/run";

const STATUS: Record<ResolveProblem, number> = {
  "not-found": 404,
  settled: 409,
  "invalid-choice": 400,
  forbidden: 403,
  "memory-gone": 409,
  "memory-invalid": 400,
  "memory-full": 409,
  "philosophy-changed": 409,
  "philosophy-invalid": 400,
  unavailable: 503,
};

/**
 * POST /api/conductor/actions/[id]   { choice }
 *
 * The person's choice on a card Conductor showed them: Personal, Global or
 * Cancel for a memory to save; Apply or Cancel for the rest. THIS request, and
 * nothing the model says, is what saves a memory or changes the philosophy.
 *
 * The proposal is looked up as this person's own and must still be waiting;
 * their permissions are checked for the choice they made; and the write is
 * the same one the Memory page and the philosophy editor make
 * (src/lib/ai/conductor/resolve.ts). The body carries no text to save: what is
 * written is what was recorded when the card was made.
 */
export async function POST(request: Request, context: RouteContext<"/api/conductor/actions/[id]">) {
  const asking = await conductorViewer();
  if ("refused" in asking) return asking.refused;
  const { viewer } = asking;
  const { id } = await context.params;
  // A proposal's id is a UUID like a conversation's.
  if (!isConversationId(id)) return conductorRefusal(404, conductorContent.cards.errors["not-found"]);

  const body = (await request.json().catch(() => null)) as { choice?: unknown } | null;
  if (!isActionChoice(body?.choice)) return conductorRefusal(400, conductorContent.cards.errors["invalid-choice"]);
  const choice = body.choice;

  return conductorRoute(async () => {
    const result = await resolveAction(viewer, id, choice, {
      get: (actionId) => getAction(viewer.env, viewer.userId, actionId),
      claim: (actionId, status, outcome) => claimAction(viewer.env, viewer.userId, actionId, status, outcome),
      release: (actionId) => releaseAction(viewer.env, viewer.userId, actionId),
      memory: memoryDeps(viewer.env),
      philosophy: philosophyDeps(viewer.env),
    });
    if (!result.ok) {
      if (result.problem === "forbidden") console.warn(`[conductor] Refused a ${choice} choice for ${viewer.userId}.`);
      return conductorRefusal(STATUS[result.problem], conductorContent.cards.errors[result.problem]);
    }
    // What was changed has its own page under Admin -> AI.
    if (result.action.status === "applied") revalidatePath("/admin/ai", "layout");
    return NextResponse.json({ action: result.action }, { headers: conductorHeaders });
  });
}
