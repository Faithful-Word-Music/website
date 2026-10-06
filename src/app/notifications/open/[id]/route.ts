import { redirect } from "next/navigation";

import { getViewer, loginUrl } from "@/lib/auth/session";
import { PUSH_FALLBACK_URL, pushOpenPath } from "@/lib/notifications/push";
import { openNotification } from "@/lib/notifications/service";
import { notificationDeps } from "@/lib/notifications/store";

/**
 * /notifications/open/<id> - where a tapped push lands when the site was not
 * already open (public/sw.js). It marks that notification read and goes on
 * to the page it is about.
 *
 * A page address rather than a request from the service worker, on purpose:
 * the service worker runs with the site closed, when the session's
 * short-lived cookie has usually lapsed, so a request from it would arrive
 * signed out. Opening a page lets Clerk restore the session first (the proxy
 * covers /notifications/*), and someone signed out is sent to log in and
 * brought back here.
 *
 * Nothing in the address is trusted beyond the id. Whose notification it is
 * comes from the session, so anyone else's is simply not found; and where it
 * leads is the address STORED with the notification, never one in the push
 * or the URL - so this can never be made to send someone off the site.
 */
export async function GET(_request: Request, ctx: RouteContext<"/notifications/open/[id]">) {
  const { id } = await ctx.params;
  const number = /^\d{1,15}$/.test(id) ? Number(id) : null;
  if (number === null) redirect(PUSH_FALLBACK_URL);

  const viewer = await getViewer();
  if (!viewer) redirect(loginUrl(pushOpenPath(number)));

  let target: string = PUSH_FALLBACK_URL;
  try {
    const result = await openNotification(viewer, { id: number }, notificationDeps(viewer.env));
    // Not theirs, or folded into a later one since: their notifications, where the latest is.
    if (result.ok && result.url) target = result.url;
  } catch (error) {
    console.error("[notifications] Could not open a notification:", error instanceof Error ? error.message : "unknown error");
  }
  redirect(target);
}
