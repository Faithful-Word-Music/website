import { Pill } from "@/components/admin/StatusPill";
import { notificationsContent } from "@/content/notifications";
import type { AudienceLabels } from "@/lib/notifications/manual";

const copy = notificationsContent.center;

/**
 * An audience in words: each group, role, instrument and person chosen, as a
 * pill. Groups and roles read strongest - they are the wide ones.
 */
export function AudienceSummary({ labels, empty }: { labels: AudienceLabels; empty?: string }) {
  const count = labels.named.length + labels.roles.length + labels.instruments.length + labels.people.length;
  if (count === 0) return empty ? <p className="text-sm text-muted">{empty}</p> : null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {labels.named.map((label) => (
        <li key={`named:${label}`}>
          <Pill tone="strong">{label}</Pill>
        </li>
      ))}
      {labels.roles.map((label) => (
        <li key={`role:${label}`}>
          <Pill>
            <span className="sr-only">{copy.compose.rolesLabel}: </span>
            {label}
          </Pill>
        </li>
      ))}
      {labels.instruments.map((label) => (
        <li key={`instrument:${label}`}>
          <Pill>
            <span className="sr-only">{copy.compose.instrumentsLabel}: </span>
            {label}
          </Pill>
        </li>
      ))}
      {labels.people.map((label, index) => (
        <li key={`person:${index}:${label}`}>
          <Pill tone="muted">{label}</Pill>
        </li>
      ))}
    </ul>
  );
}
