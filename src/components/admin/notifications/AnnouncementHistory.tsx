"use client";

import Link from "next/link";
import { useState } from "react";

import { loadAnnouncementsAction } from "@/app/admin/notifications/actions";
import { ActionMessage } from "@/components/account/fields";
import { Pill } from "@/components/admin/StatusPill";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAction } from "@/components/ui/use-action";
import { notificationsContent } from "@/content/notifications";
import { formatDateTime } from "@/lib/auth/format";
import type { AnnouncementPage, AnnouncementSummary } from "@/lib/notifications/manual-service";
import { plural } from "@/lib/plural";

import { AudienceSummary } from "./AudienceSummary";

const copy = notificationsContent.center;
const text = copy.history;

/** "3 pushes accepted · 1 failed", or that none was attempted. */
function pushLine(delivery: AnnouncementSummary["delivery"]): string {
  const parts = [
    delivery.sent > 0 ? plural(text.push.sent, delivery.sent) : null,
    delivery.failed > 0 ? plural(text.push.failed, delivery.failed) : null,
    delivery.expired > 0 ? plural(text.push.expired, delivery.expired) : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" · ") : text.push.none;
}

/**
 * Admin -> Notifications -> History: what was sent, newest first, a page at
 * a time. Each row is the send as it was - its title, sender and audience
 * are read from the send's own record, not from whatever those are called
 * now - and opens the full record.
 */
export function AnnouncementHistory({ initial }: { initial: AnnouncementPage }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const { pending, result, run, stateOf } = useAction();

  if (items.length === 0) return <p className="mt-8 text-muted">{text.empty}</p>;

  return (
    <div className="mt-8">
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="relative p-4 transition-shadow hover:shadow-lift sm:p-6">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="min-w-0 break-words font-display text-xl text-ink">
                  {/* The title is the card's link, stretched over all of it. */}
                  <Link href={`/admin/notifications/history/${item.id}`} className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-gold-dark">
                    {item.title}
                  </Link>
                </h2>
                {item.priority !== "normal" ? <Pill tone="warning">{copy.priorities[item.priority].label}</Pill> : null}
              </div>
              <p className="tnum mt-1 text-sm text-muted">
                <time dateTime={item.sentAt}>{formatDateTime(item.sentAt)}</time>
                {" · "}
                {item.senderName ? text.sentBy.replace("{name}", item.senderName) : text.sentByUnknown}
              </p>
              <div className="mt-3">
                <AudienceSummary labels={item.labels} />
              </div>
              <p className="tnum mt-3 text-sm text-ink">
                {plural(text.recipients, item.recipients)}
                <span className="text-muted"> · {pushLine(item.delivery)}</span>
              </p>
            </Card>
          </li>
        ))}
      </ul>

      {cursor !== null ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            state={stateOf()}
            pendingLabel={text.loading}
            disabled={pending}
            onClick={() =>
              void run(() => loadAnnouncementsAction(cursor), {
                refresh: false,
                onOk: (outcome) => {
                  if (!outcome.ok) return;
                  setItems((now) => [...now, ...outcome.value.items]);
                  setCursor(outcome.value.nextCursor);
                },
              })
            }
          >
            {text.loadMore}
          </Button>
          <ActionMessage result={result && !result.ok ? result : null} />
        </div>
      ) : null}
    </div>
  );
}
