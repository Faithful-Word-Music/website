import { NoAccess, Notice } from "@/components/account/Notices";
import { TemplateManager } from "@/components/admin/notifications/TemplateManager";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { notificationsContent } from "@/content/notifications";
import { requireAnyPermission } from "@/lib/auth/session";
import { SEND_PERMISSION } from "@/lib/notifications/manual";
import { composerOptions, listTemplates, type ComposerOptions, type NotificationTemplate } from "@/lib/notifications/manual-service";
import { manualDeps } from "@/lib/notifications/manual-store";

export const metadata = { title: "Notification templates" };

const content = notificationsContent.center.templates;

/**
 * /admin/notifications/templates - notifications kept to start from
 * (send_notifications).
 *
 * A template is only a starting point. Using one copies it into the composer;
 * what is eventually sent keeps its own record, so editing or deleting a
 * template here changes nothing that was already sent.
 */
export default async function NotificationTemplatesPage() {
  const viewer = await requireAnyPermission("/admin/notifications/templates", [SEND_PERMISSION]);
  if (!viewer) return <NoAccess />;

  const deps = manualDeps(viewer.env);
  let loaded: { templates: NotificationTemplate[]; options: ComposerOptions } | null = null;
  try {
    const [templates, options] = await Promise.all([listTemplates(viewer, deps), composerOptions(viewer, deps)]);
    if (templates && options) loaded = { templates, options };
  } catch (error) {
    console.error("[notifications] Could not load the templates:", error instanceof Error ? error.message : "unknown error");
  }

  // Who last changed each: the names are already in hand, from the people the audience picker offers.
  const names = loaded ? Object.fromEntries(loaded.options.people.map((person) => [person.id, person.name])) : {};

  return (
    <div>
      <SectionHeading as="h1" title={content.title}>
        <p className="text-base">{content.intro}</p>
      </SectionHeading>

      {loaded ? (
        <TemplateManager templates={loaded.templates} options={loaded.options} names={names} />
      ) : (
        <Notice tone="warning" title={content.unavailableTitle} className="mt-8">
          {content.unavailableBody}
        </Notice>
      )}
    </div>
  );
}
