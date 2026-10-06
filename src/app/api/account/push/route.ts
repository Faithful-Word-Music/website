import { NextResponse } from "next/server";

import { notificationsContent } from "@/content/notifications";
import { ACTION_ERRORS, getViewer } from "@/lib/auth/session";
import { registerSubscription, removeSubscription, subscriptionStatus } from "@/lib/notifications/delivery";
import { notificationDeps } from "@/lib/notifications/store";

/**
 * POST /api/account/push - push on THIS browser or installed app, for the
 * person signed in on it.
 *
 *   { action: "register", subscription }   this browser's push subscription
 *                                          (PushSubscription.toJSON()) becomes
 *                                          one of their devices
 *   { action: "status", endpoint }         whether it is registered to them
 *   { action: "remove", endpoint }         it is theirs no longer
 *
 * Always a POST, with the endpoint in the body: it is a secret, and an
 * address in a query string ends up in logs.
 *
 * Any signed-in person, and only ever their own device: whose it is comes
 * from the session, and a `userId` in the body goes nowhere. Registering a
 * browser that was someone else's moves it (an endpoint is held once), so the
 * last person to sign in on a shared computer never receives the first's.
 *
 * A route, not a server action, for the reason the notifications themselves
 * are (../notifications/route.ts): it is called from every page, and
 * /api/account/* is in the session proxy's matcher.
 */

const headers = { "Cache-Control": "private, no-store" };
const copy = notificationsContent.device.errors;
const refuse = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers });

export async function POST(request: Request) {
  let viewer;
  try {
    viewer = await getViewer();
  } catch (error) {
    console.error("[notifications] Could not load the session:", error instanceof Error ? error.message : "unknown error");
    return refuse(503, ACTION_ERRORS.unavailable);
  }
  if (!viewer) return refuse(401, notificationsContent.errors.signedOut);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  try {
    const push = notificationDeps(viewer.env).push;
    const owner = { userId: viewer.userId };
    const result =
      action === "register"
        ? await registerSubscription(owner, { subscription: body?.subscription, userAgent: request.headers.get("user-agent") }, push)
        : action === "status"
          ? await subscriptionStatus(owner, { endpoint: body?.endpoint }, push)
          : action === "remove"
            ? await removeSubscription(owner, { endpoint: body?.endpoint }, push)
            : null;
    if (!result) return refuse(400, copy.failed);
    if (!result.ok) return refuse(result.problem === "not-set-up" ? 503 : 400, result.problem === "not-set-up" ? copy.notSetUp : copy.failed);
    return NextResponse.json({ ok: true, registered: result.registered }, { headers });
  } catch (error) {
    console.error("[notifications] Could not update a push subscription:", error instanceof Error ? error.message : "unknown error");
    return refuse(503, copy.failed);
  }
}
