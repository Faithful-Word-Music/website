import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { supportContent } from "@/content/support";
import { relativeTime } from "@/lib/notifications/format";
import { requestHref } from "@/lib/support/model";
import type { RequestSummary } from "@/lib/support/store";

import { RequestBadges } from "./Badges";

const copy = supportContent.list;

/** A list of requests, newest activity first. Each row opens the request. */
export function RequestList({
  items,
  names,
  forManager,
  now,
  empty,
  moreHref,
}: {
  items: readonly RequestSummary[];
  names: ReadonlyMap<string, string>;
  forManager: boolean;
  now: number;
  empty: string;
  /** Where "Show more" leads, when there is more. */
  moreHref: string | null;
}) {
  if (items.length === 0) return <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-sm text-muted">{empty}</p>;
  return (
    <div>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={requestHref(item.publicId)}
              className="block px-4 py-4 transition-colors hover:bg-paper focus-visible:bg-paper sm:px-5"
            >
              <span className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {item.publicId} · {supportContent.categories[item.category]} · {copy.updated.replace("{time}", relativeTime(item.lastActivityAt, now))}
                    {forManager ? (
                      <>
                        {" · "}
                        {copy.from.replace("{name}", names.get(item.submitterId) || supportContent.detail.formerPerson)}
                        {" · "}
                        {item.assigneeId ? copy.assigned.replace("{name}", names.get(item.assigneeId) || supportContent.detail.formerPerson) : copy.unassigned}
                      </>
                    ) : null}
                  </span>
                </span>
                <RequestBadges
                  status={item.status}
                  waitingOn={item.waitingOn}
                  priority={forManager ? item.priority : "normal"}
                  forManager={forManager}
                  className={cn("shrink-0 sm:justify-end")}
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {moreHref ? (
        <p className="mt-4 text-center">
          <Link href={moreHref} className="text-sm text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark">
            {copy.loadMore}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
