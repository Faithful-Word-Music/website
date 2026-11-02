import { NextResponse, type NextRequest } from "next/server";

import { getViewer, isProfileBlocked } from "@/lib/auth/session";
import { listMediaLinks, listRecordings } from "@/lib/recordings/store";

/**
 * GET /api/recordings[?song=<id>&song=<id>...]
 *
 * The recordings and links the signed-in person may see, fresh from the
 * database: public ones and members-only ones. Song pages and Preparation
 * Playlists are built once for everyone with public recordings only; they
 * ask here, after loading, to add what a member may also see - and to give
 * someone who manages recordings an up-to-date list to change.
 *
 *   { recordings: Recording[], links: MediaLink[], canManage: boolean }
 *
 * Members only (view_member_resources). Never cached: it describes what this
 * person may see. Every change is checked again by the server actions.
 */
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const viewer = await getViewer();
    if (!viewer) return NextResponse.json({ signedIn: false }, { status: 401, headers });
    if (!viewer.can("view_member_resources") && !viewer.can("manage_songs")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
    }
    if (await isProfileBlocked(viewer)) return NextResponse.json({ recordings: [], links: [], canManage: false, profileIncomplete: true }, { headers });

    const songs = request.nextUrl.searchParams.getAll("song").filter((song) => song && song.length <= 2048).slice(0, 200);
    const filter = songs.length > 0 ? { songIds: songs } : {};
    const [recordings, links] = await Promise.all([listRecordings(viewer.env, filter), listMediaLinks(viewer.env, filter)]);
    return NextResponse.json({ recordings, links, canManage: viewer.can("manage_songs") }, { headers });
  } catch (error) {
    console.error("[recordings] /api/recordings failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "unavailable" }, { status: 500, headers });
  }
}
