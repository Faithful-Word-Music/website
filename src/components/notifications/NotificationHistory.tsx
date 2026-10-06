"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
 * The Notifications page's list: everything loaded so far, "Load more" for
 * what is older, and "Mark all as read".
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
          <NotificationList items={items} now={now} />
        ) : known ? (
          <NotificationsEmpty className="py-14" />
        ) : store.error ? null : (
          <NotificationsLoading />
        )}
      </Card>

      {nextCursor !== null ? (
        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            state={store.loading ? "pending" : "idle"}
            pendingLabel={copy.loading}
            onClick={() => void loadMoreNotifications()}
          >
            {copy.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
