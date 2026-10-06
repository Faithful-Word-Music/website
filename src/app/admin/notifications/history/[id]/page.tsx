import { NoAccess, Notice } from "@/components/account/Notices";
import { SectionLabel } from "@/components/account/ProfileView";
import { AudienceSummary } from "@/components/admin/notifications/AudienceSummary";
import { Pill } from "@/components/admin/StatusPill";
import { BackLink } from "@/components/ui/BackLink";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { notificationsContent } from "@/content/notifications";
import { formatDateTime } from "@/lib/auth/format";
import { requireAnyPermission } from "@/lib/auth/session";
import { SEND_PERMISSION } from "@/lib/notifications/manual";
import { getAnnouncement, type AnnouncementDetail } from "@/lib/notifications/manual-service";
import { manualDeps } from "@/lib/notifications/manual-store";
import { plural } from "@/lib/plural";

export const metadata = { title: "Sent notification" };

const center = notificationsContent.center;
const content = center.detail;

/**
 * /admin/notifications/history/[id] - one send, exactly as it was
 * (send_notifications): what it said, who sent it, who it was for, who was
 * told, and what became of each push.
 *
 * Everything about the message comes from the send's own snapshot, so a
 * template edited since, or a role renamed, changes nothing here.
 *
 * Push results are per device, and only ever its name and the push service's
 * answer - a device's address and keys are not in the delivery history at
 * all. "Accepted" is the most a server is ever told: it is not proof that a
 * device showed the notification, and the page says so.
 *
 * "Use again" opens the composer with a copy. It sends nothing and makes no
 * template.
 */
export default async function SentNotificationPage({ params }: PageProps<"/admin/notifications/history/[id]">) {
  const { id } = await params;
  const viewer = await requireAnyPermission(`/admin/notifications/history/${id}`, [SEND_PERMISSION]);
  if (!viewer) return <NoAccess />;

  const eventId = /^\d{1,15}$/.test(id) ? Number(id) : 0;
  let detail: AnnouncementDetail | null;
  try {
    detail = await getAnnouncement(viewer, eventId, manualDeps(viewer.env));
  } catch (error) {
    console.error("[notifications] Could not load a sent notification:", error instanceof Error ? error.message : "unknown error");
    detail = null;
  }

  if (!detail) {
    return (
      <div>
        <BackLink fallback="/admin/notifications/history" />
        <Notice tone="warning" title={content.notFoundTitle} className="mt-4">
          {content.notFoundBody}
        </Notice>
      </div>
    );
  }

  const { snapshot, delivery, people } = detail;
  const facts: Array<[string, React.ReactNode]> = [
    [content.sent, <time key="sent" dateTime={detail.sentAt}>{formatDateTime(detail.sentAt)}</time>],
    [content.sender, snapshot.senderName || center.history.sentByUnknown],
    [content.priority, center.priorities[snapshot.priority].label],
    [content.destination, snapshot.actionUrl ?? content.noDestination],
    ...(snapshot.template ? [[content.template, snapshot.template.name] as [string, React.ReactNode]] : []),
  ];
  const results: Array<[string, number]> = [
    [content.attempts, delivery.attempts],
    [content.accepted, delivery.sent],
    [content.failed, delivery.failed],
    [content.expired, delivery.expired],
    [content.reached, delivery.reached],
    [content.notAttempted, delivery.notAttempted],
  ];

  return (
    <div>
      <BackLink fallback="/admin/notifications/history" />
      <SectionHeading as="h1" title={snapshot.title} className="mt-2 break-words" />
      {snapshot.priority !== "normal" ? (
        <div className="mt-3">
          <Pill tone="warning">{center.priorities[snapshot.priority].label}</Pill>
        </div>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Card className="p-4 sm:p-6">
            <SectionLabel>{content.message}</SectionLabel>
            <p className="mt-3 whitespace-pre-line break-words text-ink">{snapshot.body}</p>
          </Card>

          <Card className="p-4 sm:p-6">
            <SectionLabel>{content.recipientsHeading}</SectionLabel>
            <p className="tnum mt-3 text-ink">{plural(content.recipients, snapshot.recipients)}</p>
            {people.length < snapshot.recipients ? <p className="mt-1 text-sm text-muted">{content.recipientsGone}</p> : null}
            {people.length > 0 ? (
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {people.map((person) => (
                  <li key={person.id} className="flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <span className="min-w-0 break-words text-ink">{person.name ?? content.unnamed}</span>
                    <span className="text-muted sm:text-right">
                      {person.devices.length === 0
                        ? content.noDevice
                        : person.devices.map((device, index) => (
                            <span key={index} className="block">
                              {device.device || content.unknownDevice}: {content.status[device.status]}
                            </span>
                          ))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card className="p-4 sm:p-6">
            <dl className="space-y-3 text-sm">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="font-medium text-ink">{label}</dt>
                  <dd className="mt-0.5 break-words text-muted">{value}</dd>
                </div>
              ))}
              <div>
                <dt className="font-medium text-ink">{content.audience}</dt>
                <dd className="mt-1.5">
                  <AudienceSummary labels={snapshot.labels} />
                </dd>
              </div>
            </dl>
            <div className="mt-5 border-t border-line pt-5">
              <ButtonLink href={`/admin/notifications?from=${detail.id}`} variant="secondary">
                {content.useAgain}
              </ButtonLink>
              <p className="mt-2 text-xs text-muted">{content.useAgainHint}</p>
            </div>
          </Card>

          <Card className="p-4 sm:p-6">
            <SectionLabel>{content.deliveryHeading}</SectionLabel>
            <p className="mt-2 text-sm text-muted">{content.deliveryLead}</p>
            <dl className="mt-4 space-y-2 text-sm">
              {results.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-ink">{label}</dt>
                  <dd className="tnum font-medium text-ink">{value.toLocaleString("en-US")}</dd>
                </div>
              ))}
            </dl>
            {delivery.notAttempted > 0 ? <p className="mt-3 text-xs text-muted">{content.notAttemptedNote}</p> : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
