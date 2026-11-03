import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Notice, type NoticeTone } from "@/components/ui/Notice";
import { profileSetupContent, requirementLabel } from "@/content/profile-setup";
import { formatDate } from "@/lib/auth/format";
import type { ProfileStatus } from "@/lib/auth/profile-requirements";

const copy = profileSetupContent.status;

/**
 * What is still needed on someone's profile, and by when - on the Dashboard
 * (above everything else, and with no way to dismiss it while anything is
 * missing) and on /profile. Shows nothing when the profile is complete,
 * unless `showComplete` asks it to say so, and nothing when the status could
 * not be worked out ("unknown") - never a "complete" it cannot back up.
 *
 *   advisory  info     asked for, nothing enforced yet
 *   grace     warning  required from a date: the date is in the title
 *   blocked   danger   required now (the gate in requireViewer enforces it;
 *                      this only explains it)
 */
export function ProfileStatusNotice({
  status,
  showComplete = false,
  className,
}: {
  status: ProfileStatus;
  showComplete?: boolean;
  className?: string;
}) {
  if (status.state === "unknown") return null;
  if (status.state === "complete") {
    if (!showComplete) return null;
    return (
      <Notice tone="success" compact role="status" title={copy.completeTitle} className={className}>
        {copy.completeBody}
      </Notice>
    );
  }

  const date = status.dueAt ? formatDate(status.dueAt) : null;
  const [title, body] =
    status.state === "blocked"
      ? [copy.blockedTitle, copy.blockedBody]
      : status.state === "grace"
        ? date
          ? [copy.graceTitle.replace("{date}", date), copy.graceBody.replaceAll("{date}", date)]
          : [copy.advisoryTitle, copy.graceNoDate]
        : [copy.advisoryTitle, copy.advisoryBody];
  const tone: NoticeTone = status.state === "blocked" ? "danger" : status.state === "grace" ? "warning" : "info";

  return (
    <Notice
      tone={tone}
      label={title}
      title={title}
      className={className}
      actions={
        <ButtonLink href="/welcome" className="w-full sm:w-auto">
          {copy.finish}
        </ButtonLink>
      }
    >
      <p>{body}</p>
      <div className="mt-3">
        <p className="text-xs font-medium text-muted">{copy.stillNeeded}</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {status.missing.map((item) => (
            <li
              key={item.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink"
            >
              <Icon name="edit" size={12} className="text-muted" />
              {requirementLabel(item.key)}
            </li>
          ))}
        </ul>
      </div>
    </Notice>
  );
}
