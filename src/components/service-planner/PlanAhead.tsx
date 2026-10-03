import { ButtonLink } from "@/components/ui/Button";
import { servicePlannerContent } from "@/content/service-planner";
import { MAX_AHEAD, monthName } from "@/lib/service-planner/planning-window";

const copy = servicePlannerContent.planAhead;

/**
 * The end of a planner list (Plan, Inserts): "Start planning <month>" brings
 * the next month in early, and - once one has been - "Not yet" sends it away
 * again (its plans stay saved). The pages keep it in the address (?ahead=),
 * so it lasts through reloads (src/lib/service-planner/planning-window.ts).
 */
export function PlanAhead({
  path,
  ahead,
  nextMonth,
  lastMonth,
  className,
}: {
  /** The page, e.g. "/service-planner/inserts". */
  path: string;
  /** Months brought in early so far. */
  ahead: number;
  /** What "Start planning" would bring in: "2026-11". */
  nextMonth: string;
  /** The last month in view, which "Not yet" would send away. */
  lastMonth: string;
  className?: string;
}) {
  const at = (count: number) => (count > 0 ? `${path}?ahead=${count}` : path);
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {ahead < MAX_AHEAD ? (
          <ButtonLink href={at(ahead + 1)} scroll={false} variant="secondary">
            {copy.start.replace("{month}", monthName(nextMonth))}
          </ButtonLink>
        ) : null}
        {ahead > 0 ? (
          <ButtonLink href={at(ahead - 1)} scroll={false} variant="quiet">
            {copy.stop.replace("{month}", monthName(lastMonth))}
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
