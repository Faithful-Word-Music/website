import { cn } from "@/components/ui/cn";
import { supportContent } from "@/content/support";
import type { Priority, Status, WaitingOn } from "@/lib/support/model";

const pill = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

/** Status, who it waits on and (for managers, when not normal) priority - as small pills. */
export function RequestBadges({
  status,
  waitingOn,
  priority,
  forManager,
  className,
}: {
  status: Status;
  waitingOn: WaitingOn;
  priority: Priority;
  forManager: boolean;
  className?: string;
}) {
  const waiting =
    waitingOn === "none"
      ? null
      : waitingOn === "submitter"
        ? forManager
          ? supportContent.waiting.submitterForManager
          : supportContent.waiting.submitter
        : supportContent.waiting.management;
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className={cn(pill, status === "open" || status === "in_progress" ? "border-ink bg-ink text-paper" : "border-line text-muted")}>
        {supportContent.statuses[status]}
      </span>
      {waiting ? (
        <span className={cn(pill, waitingOn === "submitter" && !forManager ? "border-gold-dark text-ink" : "border-line text-ink")}>{waiting}</span>
      ) : null}
      {priority !== "normal" ? (
        <span className={cn(pill, priority === "urgent" ? "border-gold-dark text-gold-dark" : "border-gold text-ink")}>
          {supportContent.priorities[priority]}
        </span>
      ) : null}
    </span>
  );
}
