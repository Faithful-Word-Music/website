import { NextResponse } from "next/server";

import { notificationsContent } from "@/content/notifications";
import { getViewer } from "@/lib/auth/session";
import { unreadCount } from "@/lib/notifications/service";
import { notificationDeps } from "@/lib/notifications/store";

/**
 * GET /api/account/notifications/unread
 *
 * How many of your own notifications are unread: the number on the bell,
 * asked for often, so it is one count over an index of unread rows and
 * nothing else (src/lib/notifications/store.ts). The same number the
 * Notifications page shows - and the one an app-icon badge will show.
 */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const viewer = await getViewer();
    if (!viewer) return NextResponse.json({ ok: false, error: notificationsContent.errors.signedOut }, { status: 401, headers });
    return NextResponse.json({ ok: true, unread: await unreadCount(viewer, notificationDeps(viewer.env)) }, { headers });
  } catch (error) {
    console.error("[notifications] Could not count unread notifications:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: notificationsContent.errors.load }, { status: 503, headers });
  }
}
