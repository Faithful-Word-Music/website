import "server-only";

import { NextResponse } from "next/server";

import { aiContent } from "@/content/ai";
import { conductorContent } from "@/content/conductor";
import { getViewer, type Viewer } from "@/lib/auth/session";

/**
 * The start of every /api/conductor/... request that is not a question: who
 * is asking, and whether they may use AI at all. Conductor's conversations and
 * the cards it shows are reached through routes, not server actions, because
 * the floating panel is open over pages the session proxy never runs for -
 * and these routes are in its matcher (src/proxy.ts).
 *
 * WHAT they may reach is decided past this point, by functions that take the
 * person asking: a conversation or a proposal that is not theirs is not found.
 */

export const conductorHeaders = { "Cache-Control": "private, no-store" };

export const conductorRefusal = (status: number, error: string) => NextResponse.json({ error }, { status, headers: conductorHeaders });

export async function conductorViewer(): Promise<{ viewer: Viewer } | { refused: NextResponse }> {
  let viewer: Viewer | null;
  try {
    viewer = await getViewer();
  } catch (error) {
    console.error("[conductor] Could not load the session:", error instanceof Error ? error.message : "unknown error");
    return { refused: conductorRefusal(503, aiContent.errors.unknown) };
  }
  if (!viewer) return { refused: conductorRefusal(401, conductorContent.errors.signedOut) };
  if (!viewer.can("use_ai")) {
    console.warn(`[conductor] Refused ${viewer.userId}: no use_ai permission.`);
    return { refused: conductorRefusal(403, aiContent.errors.forbidden) };
  }
  return { viewer };
}

/** Runs a route's work, answering a failure with wording safe to show. */
export async function conductorRoute(work: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await work();
  } catch (error) {
    console.error("[conductor] A request failed:", error instanceof Error ? error.message : "unknown error");
    return conductorRefusal(503, conductorContent.errors.unavailable);
  }
}
