import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { servicePlannerContent } from "@/content/service-planner";
import type { RailService } from "@/lib/recordings/planner";
import { monthDay, serviceDate } from "@/lib/service-planner/format";

const copy = servicePlannerContent;
const rail = copy.workspace.rail;

const DOT: Record<RailService["status"], string> = {
  published: "bg-ink",
  draft: "bg-gold",
  "not-started": "border border-staff bg-transparent",
  cancelled: "bg-line",
};

/**
 * The month's services, in order, to move between without going back to the
 * list - and previous / next either side. Each shows its status (a dot) and
 * how many songs it has. Leaving with unsaved changes still asks first: the
 * workspace's guard catches these links like any other.
 */
export function ServiceRail({ services, current, className }: { services: RailService[]; current: string; className?: string }) {
  if (services.length < 2) return null;
  const index = services.findIndex((service) => service.anchor === current);
  const previous = index > 0 ? services[index - 1] : null;
  const next = index >= 0 && index < services.length - 1 ? services[index + 1] : null;

  return (
    <nav aria-label={rail.label} className={cn("flex items-center gap-2", className)}>
      <RailArrow service={previous} label={rail.previous} direction="previous" />
      {/* `relative`: the chips' sr-only words are absolutely placed; without it they escape the scroll
          and stretch the whole page sideways by the width of the services out of view. */}
      <ol className="relative flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">

        {services.map((service) => {
          const here = service.anchor === current;
          return (
            <li key={service.anchor} className="shrink-0">
              <Link
                href={`/service-planner/${service.anchor}`}
                aria-current={here ? "page" : undefined}
                title={`${service.title} · ${copy.status[service.status]}`}
                className={cn(
                  "flex min-h-11 flex-col justify-center rounded-lg border px-3 py-1.5 text-left transition-colors",
                  here ? "border-gold bg-surface shadow-card" : "border-line hover:border-gold",
                  service.status === "cancelled" && "opacity-60",
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <span aria-hidden="true" className={cn("size-2 rounded-full", DOT[service.status])} />
                  {serviceDate(service.startsAt)} · {service.anchor.endsWith("-am") ? "AM" : "PM"}
                </span>
                <span className="tnum text-[0.7rem] text-muted">
                  <span className="sr-only">{copy.status[service.status]}, </span>
                  {service.filled}/{service.target}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <RailArrow service={next} label={rail.next} direction="next" />
    </nav>
  );
}

function RailArrow({ service, label, direction }: { service: RailService | null; label: string; direction: "previous" | "next" }) {
  const path = direction === "previous" ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5";
  const icon = (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
  if (!service) {
    return (
      <span aria-hidden="true" className="inline-flex size-11 shrink-0 items-center justify-center text-line">
        {icon}
      </span>
    );
  }
  return (
    <Link
      href={`/service-planner/${service.anchor}`}
      aria-label={`${label}: ${service.title}, ${monthDay(service.startsAt)}`}
      title={label}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-ink-soft transition-colors hover:border-gold hover:text-ink"
    >
      {icon}
    </Link>
  );
}
