import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { Icon, type IconName } from "@/components/ui/Icon";
import { dashboardContent } from "@/content/dashboard";
import type { Readiness, SignalState } from "@/lib/dashboard/readiness";
import { readinessTone } from "@/lib/dashboard/workspace";

const copy = dashboardContent.readiness;

const BADGE_ICON: Record<Readiness["overall"], IconName> = {
  ready: "check",
  attention: "clock",
  blocked: "alert",
  unknown: "minus",
};

/** The service's overall readiness as a badge: words first, the tone only reinforces them. */
export function ReadinessBadge({ readiness, className }: { readiness: Readiness; className?: string }) {
  return (
    <Badge
      tone={readinessTone(readiness.overall)}
      icon={<Icon name={BADGE_ICON[readiness.overall]} size={12} strokeWidth={1.6} />}
      className={className}
    >
      {copy.overall[readiness.overall]}
    </Badge>
  );
}

const SIGNAL: Record<SignalState, { icon: IconName; className: string; srLabel: string }> = {
  ok: { icon: "check-circle", className: "text-success", srLabel: copy.states.ok },
  attention: { icon: "clock", className: "text-warning", srLabel: copy.states.attention },
  blocked: { icon: "alert-circle", className: "text-danger", srLabel: copy.states.blocked },
  unknown: { icon: "minus", className: "text-muted", srLabel: copy.states.unknown },
};

/** Each check, one line each, linking to where it is fixed when there is somewhere. */
export function ReadinessSignals({ readiness, className }: { readiness: Readiness; className?: string }) {
  return (
    <ul className={cn("space-y-2", className)}>
      {readiness.signals.map((signal) => {
        const look = SIGNAL[signal.state];
        return (
          <li key={signal.key} className="flex items-start gap-2.5 text-sm">
            <Icon name={look.icon} size={16} strokeWidth={1.5} className={cn("mt-0.5", look.className)} />
            <span className="min-w-0 flex-1 text-ink-soft">
              <span className="sr-only">{look.srLabel} </span>
              {signal.label}
            </span>
            {signal.href && signal.state !== "ok" ? (
              <Link
                href={signal.href}
                className="shrink-0 text-sm font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-gold"
              >
                {copy.fix}
                <span className="sr-only">: {signal.label}</span>
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The worst signal's words, for the line beside the badge - the reason, not a repeat of it. */
export function readinessReason(readiness: Readiness): string | null {
  if (readiness.overall === "ready") return null;
  const rank: Record<SignalState, number> = { ok: 0, unknown: 1, attention: 2, blocked: 3 };
  const worst = [...readiness.signals].sort((a, b) => rank[b.state] - rank[a.state])[0];
  return worst?.label ?? null;
}
