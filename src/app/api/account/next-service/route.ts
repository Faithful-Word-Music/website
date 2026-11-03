import { NextResponse } from "next/server";

import { getViewer, isProfileBlocked } from "@/lib/auth/session";
import { getSheetMusicTypes } from "@/lib/auth/store";
import { servicePacket } from "@/lib/dashboard/coming-up";
import { getSchedule } from "@/lib/schedule";
import { anchorOf, datedServices, pickNextService } from "@/lib/search/next-service";
import type { NextServicePrivate } from "@/lib/site-search";
import { MEMBER_VIEWER, PUBLIC_VIEWER } from "@/lib/sheet-music-access";
import { getSheetMusicIndex } from "@/lib/sheet-music-index";

/**
 * GET /api/account/next-service
 *
 * The signed-in person's own link for the next service, for the search
 * palette's "Open next service's sheet music": their sheet music PDF for it,
 * and only when the PDF route (/dashboard/sheet-music/<service>) would give
 * them one. Asked for only when a signed-in person opens the palette - never
 * polled.
 *
 * The same checks, in the same order, as that PDF route and
 * /api/account/sheet-music, from the same functions:
 *
 *   no session, or it expired   -> 401 (the palette then forgets anything it had)
 *   profile overdue             -> no link (the PDF route refuses them too)
 *   no sheet music types        -> no link
 *   schedule or Index down      -> 503, no link
 *   none of the service's songs
 *   has their music             -> no link (servicePacket(): the Dashboard's rule)
 *
 *   { anchor: "2026-11-08-am" | null, sheetMusicHref: "/dashboard/sheet-music/..." | null }
 *
 * It describes only the person asking, to them, and is never cached anywhere
 * shared. A link from here grants nothing: the PDF route checks the session,
 * the profile and every file's access again on each request.
 *
 * "Plan next service" and "Listen to next service" need nothing private:
 * the palette offers Plan from the person's permissions (the planner checks
 * manage_service_plans itself), and Listen comes from the public index.
 */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const none = (anchor: string | null = null): NextServicePrivate => ({ anchor, sheetMusicHref: null });
  try {
    // The schedule and the Index do not depend on who is asking: read them alongside the session.
    const reads = Promise.all([getSchedule(), getSheetMusicIndex()]);
    reads.catch(() => null);

    const viewer = await getViewer();
    if (!viewer) return NextResponse.json({ signedIn: false }, { status: 401, headers });
    if (await isProfileBlocked(viewer)) return NextResponse.json(none(), { headers });

    const sheetTypes = await getSheetMusicTypes(viewer.env, viewer.userId);
    if (sheetTypes.length === 0) return NextResponse.json(none(), { headers });

    const [schedule, index] = await reads;
    if (!schedule.ok || !index.ok) return NextResponse.json(none(), { status: 503, headers });

    const next = pickNextService(datedServices(schedule.months), Date.now());
    if (!next) return NextResponse.json(none(), { headers });

    const packet = servicePacket(next.service, {
      index: index.index,
      sheetTypes,
      viewer: viewer.can("view_sheet_music") ? MEMBER_VIEWER : PUBLIC_VIEWER,
    });
    const body: NextServicePrivate = { anchor: anchorOf(next.service), sheetMusicHref: packet?.href ?? null };
    return NextResponse.json(body, { headers });
  } catch (error) {
    console.error("[search] /api/account/next-service failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json(none(), { status: 500, headers });
  }
}
