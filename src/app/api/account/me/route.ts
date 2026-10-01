import { NextResponse } from "next/server";

import { getViewer } from "@/lib/auth/session";
import { getUserTitles } from "@/lib/auth/store";

/**
 * GET /api/account/me
 *
 * What the browser needs about the signed-in person to shape the page around
 * them: their permissions (for the navigation, through the same rules as the
 * server - src/lib/navigation.ts), whether they may see members' sheet music,
 * and their title. It describes only the person asking, and only to them.
 *
 * Everything here is a convenience for what to SHOW. Every page, file and
 * action checks permissions again for itself on the server.
 */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const viewer = await getViewer();
    if (!viewer) return NextResponse.json({ signedIn: false }, { status: 401, headers });

    const titles = await getUserTitles(viewer.env, viewer.userId);
    return NextResponse.json(
      {
        signedIn: true,
        permissions: [...viewer.permissions].sort(),
        canAccessAdmin: viewer.canAccessAdmin,
        canViewSheetMusic: viewer.can("view_sheet_music"),
        title: titles.find((title) => title.isPrimary)?.label ?? titles[0]?.label ?? null,
      },
      { headers },
    );
  } catch (error) {
    console.error("[auth] /api/account/me failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ signedIn: true, permissions: [], canAccessAdmin: false, title: null }, { status: 500, headers });
  }
}
