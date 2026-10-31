import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { profileSetupContent, requirementLabel } from "@/content/profile-setup";
import { formatDate } from "@/lib/auth/format";
import type { ProfileStatus } from "@/lib/auth/profile-requirements";

const copy = profileSetupContent.status;

/**
 * What is still needed on someone's profile, and by when - on the Dashboard
 * (above everything else, and with no way to dismiss it while anything is
 * missing) and on /profile. Shows nothing when the profile is complete,
 * unless `showComplete` asks it to say so.
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
      <div role="status" className={cn("rounded-card border border-line border-l-2 border-l-gold bg-surface px-5 py-4", className)}>
        <p className="font-medium text-ink">{copy.completeTitle}</p>
        <p className="mt-1 text-sm text-muted">{copy.completeBody}</p>
      </div>
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
  const urgent = status.state !== "advisory";

  return (
    <section
      aria-label={title}
      className={cn(
        "rounded-card border bg-surface px-5 py-4 sm:px-6 sm:py-5",
        urgent ? "border-gold-dark border-l-4" : "border-line border-l-2 border-l-gold",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-xl text-ink">{title}</h2>
          <p className="mt-1 text-sm text-muted">{body}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-gold-dark">{copy.stillNeeded}</p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink">
            {status.missing.map((item) => (
              <li key={item.key} className="flex gap-2">
                <span aria-hidden="true" className="text-gold-dark">
                  ·
                </span>
                {requirementLabel(item.key)}
              </li>
            ))}
          </ul>
        </div>
        <ButtonLink href="/welcome" className="shrink-0">
          {copy.finish}
        </ButtonLink>
      </div>
    </section>
  );
}
