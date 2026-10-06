import Link from "next/link";
import type { ReactNode } from "react";

import { StateMark, StatePill, stateTone } from "@/components/availability/parts";
import { DashboardGrid } from "@/components/dashboard/DashboardSection";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { availabilityContent } from "@/content/availability";
import type { PersonStatus, UpcomingChange } from "@/lib/availability/board";
import { availabilityHref, normalServicesLabel, serviceName, serviceShort } from "@/lib/availability/format";
import type { AvailabilitySummary as Summary, TeamAvailability } from "@/lib/availability/summary";
import { formatCountdown } from "@/lib/service-time";

const copy = availabilityContent.dashboard;

/**
 * The Dashboard's Availability section, for everyone availability applies
 * to. Unlike most sections it is always there for them - availability is a
 * standing part of serving - but it stays short when nothing is unusual: the
 * normal services, the next service, any changes, and the way into
 * /availability for everything else.
 *
 * Whoever looks after the team's availability (manage_availability) gets the
 * team as well, under that card (Team, below): `summary.team` is only ever
 * worked out for them (src/lib/dashboard/load.ts).
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

      {summary?.team ? <Team team={summary.team} now={now} /> : null}
    </section>
  );
}

/**
 * For whoever looks after the team (manage_availability): the next three
 * services, each with everyone expected and everyone away - the whole
 * picture, where the card above only says who differs. In the same grid as
 * Coming up, so each service sits under its own card there.
 */
function Team({ team, now }: { team: TeamAvailability; now: number }) {
  const text = copy.team;

  return (
    <div className="mt-6">
      <h3 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">{text.label}</h3>

      {team.services.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{text.noServices}</p>
      ) : (
        <DashboardGrid className="mt-3">
          {team.services.map((service) => (
            <Card key={`${service.date}|${service.slot}`} className="flex flex-col px-5 py-5">
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="min-w-0 truncate font-display text-xl text-ink">{serviceShort(service)}</h4>
                <span className="shrink-0 text-xs text-muted">{formatCountdown(service.startsAt, now)}</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                {serviceName(service)} ·{" "}
                <span className="tnum text-ink-soft">
                  {text.expected.replace("{count}", String(service.expected.length)).replace("{total}", String(team.size))}
                </span>
              </p>

              {service.expected.length > 0 ? (
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {service.expected.map((person) => (
                    <li key={person.id}>
                      <PersonChip person={person} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-muted">{text.nobody}</p>
              )}

              {service.away.length > 0 ? (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted">{text.away}</p>
                  <ul className="mt-2 space-y-1.5">
                    {service.away.map((person) => (
                      <li key={person.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <PersonChip person={person} />
                        {person.note ? <span className="min-w-0 truncate text-xs text-muted">“{person.note}”</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          ))}
        </DashboardGrid>
      )}

      {team.unset.length > 0 ? (
        <p className="mt-3 text-sm text-muted">
          {text.unset}{" "}
          {team.unset.map((person, index) => (
            <span key={person.id}>
              {index > 0 ? ", " : ""}
              <Link
                href={availabilityHref({ person: person.id })}
                aria-label={text.manage.replace("{name}", person.name)}
                className="text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-gold"
              >
                {person.name}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/** One person at one service, in the site's availability language (parts.tsx): the mark says how they come to be there, or not. */
function PersonChip({ person }: { person: PersonStatus }) {
  const away = person.state === "unavailable-by-exception";
  return (
    <span
      title={person.state === "available-by-exception" ? copy.team.extra : undefined}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium", stateTone(person.state))}
    >
      <StateMark state={person.state} />
      <span className={cn(away && "line-through decoration-1")}>{person.name}</span>
      {person.state === "available-by-exception" ? <span className="sr-only"> ({copy.team.extra})</span> : null}
    </span>
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
