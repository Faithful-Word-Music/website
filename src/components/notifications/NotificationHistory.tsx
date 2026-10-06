"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LOG_PAGE, ShowMore, useShown } from "@/components/ui/ShowMore";
import { useNow } from "@/components/song-list/use-now";
import { notificationsContent } from "@/content/notifications";
import type { NotificationPage } from "@/lib/notifications/service";
import { plural } from "@/lib/plural";

import { NotificationList, NotificationsEmpty } from "./NotificationList";
import {
  hydrateNotifications,
  loadMoreNotifications,
  loadNotifications,
  markAllNotificationsRead,
  useNotifications,
} from "./notification-store";
import { NotificationsError, NotificationsLoading } from "./StatusLine";

const copy = notificationsContent.list;

/**
 * The Notifications page's list: the newest few, more on request (first
 * what is already loaded, then older pages from the server), and "Mark all
 * as read".
 *
 * It shows the one shared store (notification-store.ts), so a notification
 * read here is read on the bell too. The server's first page (`initial`) is
 * what shows until the store has it - or, when that could not be loaded, the
 * store asks for itself.
 */
export function NotificationHistory({
  userId,
  initial,
  serverNow,
}: {
  userId: string;
  initial: NotificationPage | null;
  /** When the server rendered this, so "5 min ago" reads the same before and after hydration. */
  serverNow: number;
}) {
  const store = useNotifications();
  const now = useNow(serverNow);

  useEffect(() => {
    if (initial) hydrateNotifications(userId, initial);
    else void loadNotifications();
  }, [userId, initial]);

  // Until the store holds this person's list, show what the server sent.
  const ready = store.userId === userId && store.loaded;
  const items = ready ? store.items : (initial?.items ?? []);
  const unread = ready ? store.unread : (initial?.unread ?? 0);
  const nextCursor = ready ? store.nextCursor : (initial?.nextCursor ?? null);
  const known = ready || initial !== null;

  // The newest few, and never fewer than reach the last unread one the page opened
  // with: "3 unread" must not be about rows that are folded away.
  const [firstPage] = useState(() => Math.max(LOG_PAGE.initial, (initial?.items.findLastIndex((item) => item.readAt === null) ?? -1) + 1));
  const { shown, remaining, more } = useShown(items.length, { initial: firstPage, step: LOG_PAGE.step });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-muted" aria-live="polite">
          {known ? (unread > 0 ? plural(copy.unreadCount, unread) : items.length > 0 ? copy.allRead : "") : ""}
        </p>
        <Button type="button" variant="secondary" onClick={markAllNotificationsRead} disabled={unread === 0}>
          {copy.markAllRead}
        </Button>
      </div>

      <Card className="mt-4 overflow-hidden">
        {store.error ? <NotificationsError message={store.error} onRetry={() => void loadNotifications()} /> : null}
        {items.length > 0 ? (
          <NotificationList items={items.slice(0, shown)} now={now} />
        ) : known ? (
          <NotificationsEmpty className="py-14" />
        ) : store.error ? null : (
          <NotificationsLoading />
        )}
      </Card>

      {remaining > 0 ? (
        <ShowMore shown={shown} remaining={remaining} step={LOG_PAGE.step} onMore={more} />
      ) : (
        <ShowMore
          shown={shown}
          remaining={nextCursor !== null ? 1 : 0}
          step={LOG_PAGE.step}
          pending={store.loading}
          label={copy.loadMore}
          onMore={() => {
            // Room for the page being fetched, so it shows as it arrives.
            more();
            void loadMoreNotifications();
          }}
        />
      )}
    </div>
  );
}
