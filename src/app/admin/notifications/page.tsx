import { NoAccess, Notice } from "@/components/account/Notices";
import { NotificationPolicyEditor, NotificationTest } from "@/components/admin/NotificationPolicyEditor";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { notificationsContent } from "@/content/notifications";
import { requireAnyPermission } from "@/lib/auth/session";
import { CHANNELS, allowedPolicies } from "@/lib/notifications/model";
import { policiesFor, type CategoryPolicyView } from "@/lib/notifications/service";
import { notificationDeps } from "@/lib/notifications/store";

export const metadata = { title: "Notifications" };

const content = notificationsContent.admin;

/**
 * /admin/notifications - how each kind of notification reaches people
 * (manage_notifications).
 *
 * Every category has its own policy for each channel: mandatory, on by
 * default, off by default, or unavailable. Nothing about a category is fixed
 * in code - Announcements only START mandatory - and changing a policy never
 * erases anyone's own choices (src/lib/notifications/model.ts).
 *
 * A channel that cannot deliver yet offers only what makes sense for it:
 * email stays "Unavailable" until email is built, and the action refuses
 * anything else (setNotificationPoliciesAction).
 */
export default async function NotificationPoliciesPage() {
  const viewer = await requireAnyPermission("/admin/notifications", ["manage_notifications"]);
  if (!viewer) return <NoAccess />;

  let categories: CategoryPolicyView[] | null;
  try {
    categories = await policiesFor(viewer, notificationDeps(viewer.env));
  } catch (error) {
    console.error("[notifications] Could not load the policies:", error instanceof Error ? error.message : "unknown error");
    categories = null;
  }

  const allowed = Object.fromEntries(CHANNELS.map((channel) => [channel, [...allowedPolicies(channel)]]));

  return (
    <div>
      <SectionHeading as="h1" title={content.title}>
        <p className="text-base">{content.intro}</p>
      </SectionHeading>

      {categories ? (
        <>
          <NotificationPolicyEditor categories={categories} allowed={allowed} />
          {/* Development only: the action refuses anywhere else, whatever is shown. */}
          {viewer.env === "development" ? (
            <NotificationTest categories={categories.filter((category) => category.active).map(({ key, name }) => ({ key, name }))} />
          ) : null}
        </>
      ) : (
        <Notice tone="warning" title={content.unavailableTitle} className="mt-8">
          {content.unavailableBody}
        </Notice>
      )}
    </div>
  );
}
