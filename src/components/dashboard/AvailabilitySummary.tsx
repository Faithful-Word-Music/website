import Link from "next/link";
import type { ReactNode } from "react";

import { StatePill } from "@/components/availability/parts";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { availabilityContent } from "@/content/availability";
import { dashboardContent } from "@/content/dashboard";
import type { UpcomingChange } from "@/lib/availability/board";
import { normalServicesLabel, serviceName, serviceShort } from "@/lib/availability/format";
import type { AvailabilitySummary as Summary } from "@/lib/availability/summary";
import { formatCountdown } from "@/lib/service-time";

const copy = availabilityContent.dashboard;

/**
 * The person's own availability, for everyone it applies to. Always there for
 * them - availability is a standing part of serving - but short: their normal
 * services, the next service and their state for it, their changes, other
 * people's changes in the next two weeks, and the way into /availability.
 * (The whole team, for whoever looks after it, is in Ministry.tsx.)
 */
export function AvailabilitySummary({
  summary,
  now,
  className,
}: {
  /** Null when the board could not be read. */
  summary: Summary | null;
  now: number;
  className?: string;
}) {
  const self = summary?.self ?? null;
  const ministry = summary?.ministry ?? [];

  return (
    <Panel
      title={dashboardContent.yourAvailability.title}
      className={className}
      bare
      footer={
        <Link href="/availability" className="group inline-flex min-h-9 items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
          {copy.open}
          <Icon name="arrow-right" size={13} strokeWidth={1.6} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
      }
    >
      {!summary ? (
        <div className="px-5 pb-5">
          <Notice compact tone="neutral" title={copy.unavailable} className="shadow-none" />
        </div>
      ) : (
        <div className="divide-y divide-line border-t border-line">
          {self ? (
            <>
              <Row label={copy.normal}>
                {self.normal.length > 0 ? (
                  <p className="text-sm text-ink">{normalServicesLabel(self.normal).join(" · ")}</p>
                ) : (
                  <p className="text-sm text-muted">
                    {copy.noNormal} ·{" "}
                    <Link href="/availability#normal" className="text-ink underline decoration-gold underline-offset-4">
                      {copy.setNormal}
                    </Link>
                  </p>
                )}
              </Row>
              <Row label={copy.next}>
                {self.next ? (
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <span className="text-sm text-ink">
                      {serviceShort(self.next)}
                      <span className="text-muted"> · {formatCountdown(self.next.startsAt, now)}</span>
                    </span>
                    <StatePill state={self.next.state} long />
                  </div>
                ) : (
                  <p className="text-sm text-muted">{copy.noNext}</p>
                )}
              </Row>
              <Row label={copy.mine}>
                {self.changes.length > 0 ? (
                  <ChangeList changes={self.changes} showNames={false} />
                ) : (
                  <p className="text-sm text-muted">{copy.noMine}</p>
                )}
                {self.totalChanges > self.changes.length ? (
                  <p className="mt-2 text-xs text-muted">{copy.more.replace("{count}", String(self.totalChanges - self.changes.length))}</p>
                ) : null}
              </Row>
            </>
          ) : null}

          {ministry.length > 0 ? (
            <Row label={copy.ministry}>
              <ChangeList changes={ministry} showNames />
              {summary.totalMinistry > ministry.length ? (
                <p className="mt-2 text-xs text-muted">{copy.more.replace("{count}", String(summary.totalMinistry - ministry.length))}</p>
              ) : null}
            </Row>
          ) : !self ? (
            <Row label={copy.ministry}>
              <p className="text-sm text-muted">{availabilityContent.upcoming.noneEveryone}</p>
            </Row>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-3.5">
      <h3 className="mb-1.5 font-sans text-xs font-medium tracking-normal text-muted">{label}</h3>
      {children}
    </div>
  );
}

function ChangeList({ changes, showNames }: { changes: UpcomingChange[]; showNames: boolean }) {
  return (
    <ul className="space-y-2">
      {changes.map((change) => (
        <li key={`${change.id}|${change.date}|${change.slot}`} className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-sm text-ink">{showNames ? change.name : serviceShort(change)}</span>
            <span className="block truncate text-xs text-muted">
              {showNames ? serviceShort(change) : serviceName(change)}
              {change.note ? ` · “${change.note}”` : ""}
            </span>
          </span>
          <StatePill state={change.state} className="shrink-0" />
        </li>
      ))}
    </ul>
  );
}
