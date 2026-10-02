import Link from "next/link";
import type { ReactNode } from "react";

import { StatePill } from "@/components/availability/parts";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { availabilityContent } from "@/content/availability";
import type { UpcomingChange } from "@/lib/availability/board";
import { normalServicesLabel, serviceName, serviceShort } from "@/lib/availability/format";
import type { AvailabilitySummary as Summary } from "@/lib/availability/summary";
import { formatCountdown } from "@/lib/service-time";

const copy = availabilityContent.dashboard;

/**
 * The Dashboard's Availability section, for everyone availability applies
 * to. Unlike most sections it is always there for them - availability is a
 * standing part of serving - but it stays short when nothing is unusual: the
 * normal services, the next service, any changes, and the way into
 * /availability for everything else.
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
  const headingId = "dashboard-availability";
  const self = summary?.self ?? null;
  const ministry = summary?.ministry ?? [];

  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={headingId} className="font-display text-2xl text-ink">
          {copy.title}
        </h2>
        <Link
          href="/availability"
          className="group inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
        >
          {copy.open}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      </div>

      {!summary ? (
        <p className="mt-4 text-muted">{copy.unavailable}</p>
      ) : (
        <Card className="mt-4 overflow-hidden">
          <div
            className={cn(
              "grid divide-y divide-line md:divide-x md:divide-y-0",
              self && ministry.length > 0 ? "md:grid-cols-3" : self ? "md:grid-cols-2" : "md:grid-cols-1",
            )}
          >
            {self ? (
              <>
                <Column label={copy.normal}>
                  {self.normal.length > 0 ? (
                    <p className="text-[0.95rem] text-ink">{normalServicesLabel(self.normal).join(" · ")}</p>
                  ) : (
                    <p className="text-[0.95rem] text-muted">
                      {copy.noNormal} ·{" "}
                      <Link href="/availability#normal" className="text-ink underline decoration-gold underline-offset-4">
                        {copy.setNormal}
                      </Link>
                    </p>
                  )}
                  <p className="mt-4 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">
                    {copy.next}
                  </p>
                  {self.next ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-[0.95rem] text-ink">
                        {serviceShort(self.next)}
                        <span className="text-muted"> · {formatCountdown(self.next.startsAt, now)}</span>
                      </span>
                      <StatePill state={self.next.state} long />
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm text-muted">{copy.noNext}</p>
                  )}
                </Column>

                <Column label={copy.mine}>
                  {self.changes.length > 0 ? (
                    <ChangeList changes={self.changes} showNames={false} />
                  ) : (
                    <p className="text-[0.95rem] text-muted">{copy.noMine}</p>
                  )}
                  {self.totalChanges > self.changes.length ? (
                    <p className="mt-2 text-xs text-muted">
                      {copy.more.replace("{count}", String(self.totalChanges - self.changes.length))}
                    </p>
                  ) : null}
                </Column>
              </>
            ) : null}

            {ministry.length > 0 ? (
              <Column label={copy.ministry}>
                <ChangeList changes={ministry} showNames />
                {summary.totalMinistry > ministry.length ? (
                  <p className="mt-2 text-xs text-muted">
                    {copy.more.replace("{count}", String(summary.totalMinistry - ministry.length))}
                  </p>
                ) : null}
              </Column>
            ) : !self ? (
              <Column label={copy.ministry}>
                <p className="text-[0.95rem] text-muted">{availabilityContent.upcoming.noneEveryone}</p>
              </Column>
            ) : null}
          </div>
        </Card>
      )}
    </section>
  );
}

function Column({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-5 sm:px-6">
      <h3 className="mb-2 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">{label}</h3>
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
