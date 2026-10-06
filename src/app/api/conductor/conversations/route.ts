import { NextResponse } from "next/server";

import { conductorHeaders, conductorRoute, conductorViewer } from "@/lib/ai/conductor/request";
import { listConversations } from "@/lib/ai/conversations/store";

/**
 * GET /api/conductor/conversations
 *
 * The saved conversations of the person asking, the one last spoken in first:
 * titles and times only. Nobody else's are ever listed.
 */
export async function GET() {
  const asking = await conductorViewer();
  if ("refused" in asking) return asking.refused;
  const { viewer } = asking;

  return conductorRoute(async () =>
    NextResponse.json({ conversations: await listConversations(viewer.env, viewer.userId) }, { headers: conductorHeaders }),
  );
}
