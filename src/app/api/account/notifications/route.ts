import { NextResponse } from "next/server";

import { notificationsContent } from "@/content/notifications";
import { ACTION_ERRORS, getViewer, type Viewer } from "@/lib/auth/session";
import { listNotifications, markAllRead, markRead } from "@/lib/notifications/service";
import { notificationDeps } from "@/lib/notifications/store";

/**
 * /api/account/notifications - your OWN notifications, for the bell in the
 * header and the Notifications page.
 *
 *   GET   ?before=<id>&limit=<n>   a page, newest first, with how many are
 *                                  unread in all
 *   POST  { action: "read" | "unread", id }   mark one
 *         { action: "read-all" }              mark every one read
 *
 * A route, not a server action, because the bell sits in the header over
 * public pages the session proxy never runs for; /api/account/* is in its
 * matcher (src/proxy.ts).
 *
 * Any signed-in person, and only ever their own: nothing in the request says
 * whose notifications these are - that comes from the session, and every
 * query matches on it (src/lib/notifications/store.ts). Someone else's id is
 * simply "not found".
 */

const headers = { "Cache-Control": "private, no-store" };
const copy = notificationsContent.errors;
const refuse = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers });

async function signedIn(): Promise<{ viewer: Viewer } | { refused: NextResponse }> {
  try {
    const viewer = await getViewer();
    return viewer ? { viewer } : { refused: refuse(401, copy.signedOut) };
  } catch (error) {
    console.error("[notifications] Could not load the session:", error instanceof Error ? error.message : "unknown error");
    return { refused: refuse(503, ACTION_ERRORS.unavailable) };
  }
}

/** A whole number from the query string, or undefined. */
function whole(value: string | null): number | undefined {
  if (value === null || !/^\d{1,15}$/.test(value)) return undefined;
  return Number(value);
}

export async function GET(request: Request) {
  const who = await signedIn();
  if ("refused" in who) return who.refused;

  const params = new URL(request.url).searchParams;
  try {
    const page = await listNotifications(
      who.viewer,
      { before: whole(params.get("before")) ?? null, limit: whole(params.get("limit")) },
      notificationDeps(who.viewer.env),
    );
    return NextResponse.json({ ok: true, ...page }, { headers });
  } catch (error) {
    console.error("[notifications] Could not load notifications:", error instanceof Error ? error.message : "unknown error");
    return refuse(503, copy.load);
  }
}

export async function POST(request: Request) {
  const who = await signedIn();
  if ("refused" in who) return who.refused;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  try {
    const deps = notificationDeps(who.viewer.env);
    // Named fields only: a `userId` in the body goes nowhere.
    const result =
      action === "read-all"
        ? await markAllRead(who.viewer, deps)
        : action === "read" || action === "unread"
          ? await markRead(who.viewer, { id: body?.id, read: action === "read" }, deps)
          : null;
    if (!result) return refuse(400, copy.update);
    if (!result.ok) return refuse(result.problem === "not-found" ? 404 : 400, copy.update);
    return NextResponse.json({ ok: true, unread: result.unread }, { headers });
  } catch (error) {
    console.error("[notifications] Could not update a notification:", error instanceof Error ? error.message : "unknown error");
    return refuse(503, copy.update);
  }
}
