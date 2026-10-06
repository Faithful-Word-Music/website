import { NoAccess, Notice } from "@/components/account/Notices";
import { AnnouncementHistory } from "@/components/admin/notifications/AnnouncementHistory";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { notificationsContent } from "@/content/notifications";
import { requireAnyPermission } from "@/lib/auth/session";
import { SEND_PERMISSION } from "@/lib/notifications/manual";
import { listAnnouncements, type AnnouncementPage } from "@/lib/notifications/manual-service";
import { manualDeps } from "@/lib/notifications/manual-store";

export const metadata = { title: "Notification history" };

const content = notificationsContent.center.history;

/**
 * /admin/notifications/history - every notification sent by hand, newest
 * first (send_notifications).
 *
 * This is not a second record of anything: each row is the send's own event
 * in the notification tables, and what it shows is what was written then
 * (src/lib/notifications/manual-service.ts).
 */
export default async function NotificationHistoryPage() {
  const viewer = await requireAnyPermission("/admin/notifications/history", [SEND_PERMISSION]);
  if (!viewer) return <NoAccess />;

  let page: AnnouncementPage | null;
  try {
    page = await listAnnouncements(viewer, {}, manualDeps(viewer.env));
  } catch (error) {
    console.error("[notifications] Could not load the send history:", error instanceof Error ? error.message : "unknown error");
    page = null;
  }

  return (
    <div>
      <SectionHeading as="h1" title={content.title}>
        <p className="text-base">{content.intro}</p>
      </SectionHeading>

      {page ? (
        <AnnouncementHistory initial={page} />
      ) : (
        <Notice tone="warning" title={content.unavailableTitle} className="mt-8">
          {content.unavailableBody}
        </Notice>
      )}
    </div>
  );
}
