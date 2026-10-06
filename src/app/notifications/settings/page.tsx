import type { Metadata } from "next";

import { Notice } from "@/components/account/Notices";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { NotificationsFrame } from "@/components/notifications/NotificationsFrame";
import { PushDeviceSection } from "@/components/notifications/PushDevice";
import { notificationsContent } from "@/content/notifications";
import { requireViewer } from "@/lib/auth/session";
import { preferencesFor, type CategoryPreferences } from "@/lib/notifications/service";
import { notificationDeps } from "@/lib/notifications/store";

const copy = notificationsContent.settings;

export const metadata: Metadata = {
  title: copy.title,
  robots: { index: false, follow: false },
};

/**
 * /notifications/settings - what the signed-in person hears about, and how.
 *
 * For each kind of notification and each channel, what shows is the
 * category's policy and the person's own choice put together
 * (effectiveSetting in src/lib/notifications/model.ts): a switch where the
 * choice is theirs, "Always on" where the ministry requires it, and "Coming
 * soon" for email, which nothing can switch on yet.
 *
 * Above them, and kept apart, is push on THIS device (PushDevice.tsx): the
 * browser's permission and this browser's subscription. The choices follow
 * the person to every device; that one belongs to the device.
 *
 * Only ever their own settings, and every change is checked again on the
 * server (src/app/notifications/actions.ts).
 */
export default async function NotificationSettingsPage() {
  const viewer = await requireViewer("/notifications/settings");

  let categories: CategoryPreferences[] | null;
  try {
    categories = await preferencesFor(viewer, notificationDeps(viewer.env));
  } catch (error) {
    console.error("[notifications] Could not load notification settings:", error instanceof Error ? error.message : "unknown error");
    categories = null;
  }

  return (
    <NotificationsFrame title={copy.title} lead={copy.lead}>
      {/* The device first: whether push can reach this browser at all is the
          browser's and the person's to say, not a setting of the site's. */}
      <PushDeviceSection />
      <h2 className="mt-10 font-display text-2xl text-ink">{copy.categoriesTitle}</h2>
      <p className="mb-5 mt-1 text-sm text-muted">{copy.categoriesLead}</p>
      {categories ? (
        <NotificationPreferences categories={categories} />
      ) : (
        <Notice tone="warning" title={copy.unavailableTitle}>
          {copy.unavailableBody}
        </Notice>
      )}
    </NotificationsFrame>
  );
}
