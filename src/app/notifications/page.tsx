import type { Metadata } from "next";

import { NotificationHistory } from "@/components/notifications/NotificationHistory";
import { NotificationsFrame } from "@/components/notifications/NotificationsFrame";
import { notificationsContent } from "@/content/notifications";
import { requireViewer, type Viewer } from "@/lib/auth/session";
import { listNotifications, type NotificationPage } from "@/lib/notifications/service";
import { notificationDeps } from "@/lib/notifications/store";

const copy = notificationsContent;

export const metadata: Metadata = {
  title: copy.title,
  robots: { index: false, follow: false },
};

/**
 * /notifications - everything the signed-in person has been told, newest
 * first: the same notifications as the bell's panel, a page at a time.
 *
 * Only ever the person's own: whose they are comes from the session
 * (src/lib/notifications/service.ts). The first page is rendered here; the
 * rest, and every change, go through /api/account/notifications, so the bell
 * and this page always agree.
 *
 * Opening a notification follows its link, if it has one. That grants
 * nothing - the page it leads to checks permissions for itself.
 */
export default async function NotificationsPage() {
  const viewer = await requireViewer("/notifications");
  const { initial, loadedAt } = await firstPage(viewer);

  return (
    <NotificationsFrame title={copy.title} lead={copy.lead}>
      <NotificationHistory userId={viewer.userId} initial={initial} serverNow={loadedAt} />
    </NotificationsFrame>
  );
}

/** The newest page and when it was read - or nothing, and the list then asks for itself in the browser. */
async function firstPage(viewer: Viewer): Promise<{ initial: NotificationPage | null; loadedAt: number }> {
  try {
    return { initial: await listNotifications(viewer, {}, notificationDeps(viewer.env)), loadedAt: Date.now() };
  } catch (error) {
    console.error("[notifications] Could not load notifications:", error instanceof Error ? error.message : "unknown error");
    return { initial: null, loadedAt: Date.now() };
  }
}
