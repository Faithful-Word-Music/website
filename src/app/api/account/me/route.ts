import { NextResponse } from "next/server";

import { getViewer } from "@/lib/auth/session";
import { getUserTitles } from "@/lib/auth/store";

/**
 * GET /api/account/me
 *
 * What the header's account menu needs about the signed-in person: whether to
 * show the Admin link, and their title. It describes only the person asking,
 * and only to them. Showing the Admin link is a convenience - the admin pages
 * and actions check permissions again themselves.
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
        canAccessAdmin: viewer.canAccessAdmin,
        title: titles.find((title) => title.isPrimary)?.label ?? titles[0]?.label ?? null,
      },
      { headers },
    );
  } catch (error) {
    console.error("[auth] /api/account/me failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ signedIn: true, canAccessAdmin: false, title: null }, { status: 500, headers });
  }
}
