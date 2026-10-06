"use client";

import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { notificationsContent } from "@/content/notifications";
import { relativeTime } from "@/lib/notifications/format";
import type { NotificationItem } from "@/lib/notifications/model";

import { markNotification } from "./notification-store";

const copy = notificationsContent.list;

/** A 16px line icon for each starting category; anything else wears the bell. */
const CATEGORY_ICONS: Record<string, string> = {
  admin_announcement: "M2.5 6.5v3h2l5 3v-9l-5 3zM12 6.2a2.5 2.5 0 0 1 0 3.6",
  service_plan_published:
    "M6 12.5V4l6.5-1.5v8M6 12.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0ZM12.5 10.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0Z",
  service_plan_updated:
    "M6 12.5V4l6.5-1.5v8M6 12.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0ZM12.5 10.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0Z",
  availability_changed: "M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3",
  account_access: "M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 13.5c.4-2.5 2.3-4 5-4s4.6 1.5 5 4",
  sheet_music_report: "M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8.5h4M6 11h4",
  ai_system: "M7 2.5 8.2 6l3.3 1-3.3 1.2L7 11.5 5.8 8.2 2.5 7l3.3-1zM12 10.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z",
};

export const BELL_ICON = "M4 11.5V7a4 4 0 0 1 8 0v4.5M2.5 11.5h11M6.5 13.5a1.6 1.6 0 0 0 3 0";

/**
 * Notifications as a divided list: the bell's panel and the Notifications
 * page both show this.
 *
 * An unread one is marked three ways, never by colour alone: a gold dot, a
 * heavier title, and "Unread" read out before it. The whole row opens the
 * notification - follows its link, if it has one, and marks it read; the
 * small button at its end marks it read or unread without opening it.
 *
 * Following a link grants nothing: the page it leads to checks the person's
 * permissions itself, and says so if they may no longer see it.
 */
export function NotificationList({
  items,
  now,
  onOpen,
  className,
}: {
  items: NotificationItem[];
  /** The time to measure "5 min ago" from. */
  now: number;
  /** A notification was opened: the panel closes. */
  onOpen?: () => void;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {items.map((item) => (
        <Row key={item.id} item={item} now={now} onOpen={onOpen} />
      ))}
    </ul>
  );
}

function Row({ item, now, onOpen }: { item: NotificationItem; now: number; onOpen?: () => void }) {
  const unread = item.readAt === null;
  const open = () => {
    markNotification(item.id, true);
    onOpen?.();
  };
  // The title is the row's link or button, stretched over the whole row (after:inset-0).
  const titleClass = cn(
    "text-left text-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-gold-dark",
    unread ? "font-semibold text-ink" : "text-ink-soft",
  );
  const title = (
    <>
      {unread ? <span className="sr-only">{copy.unread}: </span> : null}
      {item.title}
    </>
  );

  return (
    <li className={cn("relative flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-paper", unread && "bg-paper/60")}>
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
          unread ? "border-gold text-gold-dark" : "border-line text-muted",
        )}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d={CATEGORY_ICONS[item.category] ?? BELL_ICON}
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-start gap-2">
          {item.actionUrl ? (
            <Link href={item.actionUrl} onClick={open} className={titleClass}>
              {title}
            </Link>
          ) : unread ? (
            <button type="button" onClick={open} className={titleClass}>
              {title}
            </button>
          ) : (
            <span className="text-sm text-ink-soft">{item.title}</span>
          )}
        </p>
        {item.body ? <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-sm text-muted">{item.body}</p> : null}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          {item.priority !== "normal" ? <span className="font-semibold uppercase tracking-wide text-gold-dark">{copy.important}</span> : null}
          <time dateTime={item.createdAt} suppressHydrationWarning>
            {relativeTime(item.createdAt, now)}
          </time>
        </p>
      </div>

      {/* Above the stretched title, so it is its own target. */}
      <button
        type="button"
        onClick={() => markNotification(item.id, unread)}
        aria-label={`${unread ? copy.markRead : copy.markUnread}: ${item.title}`}
        title={unread ? copy.markRead : copy.markUnread}
        className="relative z-10 -mr-2 -mt-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <span
          aria-hidden="true"
          className={cn("block h-2.5 w-2.5 rounded-full border transition-colors", unread ? "border-gold bg-gold" : "border-muted bg-transparent")}
        />
      </button>
    </li>
  );
}

/** "You're all caught up." */
export function NotificationsEmpty({ className }: { className?: string }) {
  const empty = notificationsContent.empty;
  return (
    <div className={cn("px-6 py-10 text-center", className)}>
      <span aria-hidden="true" className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-line text-gold-dark">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d={BELL_ICON} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p className="mt-4 font-display text-xl text-ink">{empty.title}</p>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">{empty.body}</p>
    </div>
  );
}
