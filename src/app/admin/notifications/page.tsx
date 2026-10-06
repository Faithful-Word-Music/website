import { redirect } from "next/navigation";

import { NoAccess, Notice } from "@/components/account/Notices";
import { AnnouncementComposer, type DraftSource } from "@/components/admin/notifications/AnnouncementComposer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { notificationsContent } from "@/content/notifications";
import { requireViewer } from "@/lib/auth/session";
import { SEND_PERMISSION } from "@/lib/notifications/manual";
import { composerOptions, loadDraft, type ComposerOptions, type LoadedDraft } from "@/lib/notifications/manual-service";
import { manualDeps } from "@/lib/notifications/manual-store";
import { MANAGE_PERMISSION } from "@/lib/notifications/service";

export const metadata = { title: "Send a notification" };

const content = notificationsContent.center;

const positive = (value: string | string[] | undefined): number | null => {
  const id = typeof value === "string" && /^\d{1,15}$/.test(value) ? Number(value) : 0;
  return id > 0 ? id : null;
};

/**
 * /admin/notifications - write a notification and send it (send_notifications).
 *
 * `?template=<id>` starts from a template and `?from=<id>` from something
 * already sent ("Use again"). Either way the composer is handed a COPY:
 * nothing is sent, and neither the template nor the old send is touched,
 * until the person reviews it and presses Send.
 *
 * This address used to be the policy page. Someone who may configure
 * notifications and not send them is taken on to where the policies now are
 * (/admin/notifications/policies), so an old link or bookmark still arrives.
 */
export default async function SendNotificationPage({ searchParams }: PageProps<"/admin/notifications">) {
  const viewer = await requireViewer("/admin/notifications");
  if (!viewer.can(SEND_PERMISSION)) {
    if (viewer.can(MANAGE_PERMISSION)) redirect("/admin/notifications/policies");
    return <NoAccess />;
  }

  const params = await searchParams;
  const templateId = positive(params.template);
  const eventId = positive(params.from);
  const source: DraftSource | undefined = templateId ? "template" : eventId ? "history" : undefined;

  const deps = manualDeps(viewer.env);
  let options: ComposerOptions | null;
  let initial: LoadedDraft | null = null;
  try {
    [options, initial] = await Promise.all([
      composerOptions(viewer, deps),
      templateId ? loadDraft(viewer, { templateId }, deps) : eventId ? loadDraft(viewer, { eventId }, deps) : null,
    ]);
  } catch (error) {
    console.error("[notifications] Could not load the composer:", error instanceof Error ? error.message : "unknown error");
    options = null;
  }

  return (
    <div>
      <SectionHeading as="h1" title={content.compose.title}>
        <p className="text-base">{content.compose.intro}</p>
      </SectionHeading>

      {options ? (
        // A fresh composer for each thing it is started from.
        <AnnouncementComposer
          key={`${source ?? "new"}:${templateId ?? eventId ?? 0}`}
          options={options}
          initial={initial ?? undefined}
          source={initial ? source : undefined}
          missing={source !== undefined && initial === null}
        />
      ) : (
        <Notice tone="warning" title={content.compose.unavailableTitle} className="mt-8">
          {content.compose.unavailableBody}
        </Notice>
      )}
    </div>
  );
}
