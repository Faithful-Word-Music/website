import { NextResponse } from "next/server";

import { getViewer } from "@/lib/auth/session";
import { ROSTER_PERMISSION, SCHEDULER_PERMISSION } from "@/lib/leadership/access";
import { songListLeaders } from "@/lib/leadership/board";
import { loadBoard } from "@/lib/leadership/load";
import { plannerConfigured } from "@/lib/service-planner/store";

/**
 * GET /api/account/song-leaders
 *
 * Who leads the songs of each PUBLISHED service still to come, for the song
 * list's cards (src/components/song-list/SongLeaders.tsx). The song list is
 * static and the same for everyone - leaders are never part of it, or of its
 * cache, PDF or share images - so a signed-in person's page asks here.
 *
 *   { leaders: [{ anchor, songs: [{ position, title, leader: { name, mine } | null }] }] }
 *
 * Only for someone who prepares from the song lists (view_service_plans) or
 * plans them. Names only: no account IDs, no place IDs. A draft, a cancelled
 * service or one no longer published is simply not in it - decided now, on
 * every request, never from what was true when a link was made.
 */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const viewer = await getViewer();
    if (!viewer) return NextResponse.json({ signedIn: false }, { status: 401, headers });
    if (!viewer.can(ROSTER_PERMISSION) && !viewer.can(SCHEDULER_PERMISSION)) {
      return NextResponse.json({ authorized: false, leaders: [] }, { headers });
    }
    if (!plannerConfigured()) return NextResponse.json({ authorized: true, leaders: [] }, { headers });
    const now = Date.now();
    const board = await loadBoard(viewer.env, now, { exceptions: false });
    return NextResponse.json({ authorized: true, leaders: songListLeaders(board, viewer, now) }, { headers });
  } catch (error) {
    console.error("[leadership] /api/account/song-leaders failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ unavailable: true }, { status: 500, headers });
  }
}
