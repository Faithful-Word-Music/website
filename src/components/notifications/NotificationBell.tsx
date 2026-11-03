"use client";

import Link from "next/link";
import { useId, useRef, useState, useSyncExternalStore } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { CountBadge } from "@/components/ui/CountBadge";
import { Icon } from "@/components/ui/Icon";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Modal } from "@/components/ui/Modal";
import { Popover } from "@/components/ui/popover/Popover";
import { usePagePath } from "@/components/ui/use-page-path";
import { notificationsContent } from "@/content/notifications";
import { NOTIFICATION_LIMITS } from "@/lib/notifications/model";
import { plural } from "@/lib/plural";

import { NotificationList, NotificationsEmpty } from "./NotificationList";
import { loadNotifications, markAllNotificationsRead, useNotificationSync, useNotifications } from "./notification-store";
import { NotificationsError, NotificationsLoading } from "./StatusLine";

const copy = notificationsContent;

/** From `sm` up there is room for a panel under the bell; below it, a dialog. */
const WIDE_QUERY = "(min-width: 640px)";

function subscribeWide(onChange: () => void) {
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * The bell in the header: how many notifications are unread, and the latest
 * of them a press away. Only for someone signed in - visitors see nothing,
 * and nothing is asked of the server for them.
 *
 * From `sm` up it opens a panel under the bell - a non-modal dialog on the
 * shared Popover (Escape, which hands focus back to the bell, or a press
 * elsewhere closes it); on a phone, where a panel that size would be cramped, the same
 * list opens as a dialog. Both end in "View all notifications".
 *
 * The count is text on the badge and in the button's name ("Notifications, 3
 * unread"), never colour alone.
 */
export function NotificationBell() {
  const { isSignedIn, userId } = useAccount();
  useNotificationSync(isSignedIn ? userId : null);
  const { unread } = useNotifications();
  const pathname = usePagePath();
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  if (!isSignedIn) return null;

  const close = () => setOpen(false);

  return (
    <div className="relative shrink-0 print:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open && wide ? panelId : undefined}
        aria-label={unread > 0 ? plural(copy.bell.unread, unread) : copy.bell.label}
        onClick={() => {
          // Every opening shows the latest, not what was there last time.
          if (!open) void loadNotifications();
          setOpen(!open);
        }}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink"
      >
        <Icon name="bell" size={18} strokeWidth={1.2} />
        {/* The count is in the button's name already, so the badge is not read out again. */}
        <CountBadge count={unread} variant="overlay" />
      </button>

      {open && wide ? (
        <Popover
          id={panelId}
          triggerRef={buttonRef}
          onClose={close}
          placement="bottom-end"
          initialFocus="container"
          role="dialog"
          aria-label={copy.bell.panelTitle}
          tabIndex={-1}
          className="flex w-[24rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden [--popover-max-height:34rem]"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line py-2 pl-4 pr-2">
            <h2 className="font-display text-lg text-ink">{copy.bell.panelTitle}</h2>
            <MarkAllButton />
          </header>
          <PanelBody onOpen={close} />
          <footer className="border-t border-line p-2">
            <ViewAllLink onNavigate={close} className="w-full" />
          </footer>
        </Popover>
      ) : null}

      {open && !wide ? (
        <Modal
          title={copy.bell.panelTitle}
          closeLabel={copy.bell.close}
          onClose={close}
          bare
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <MarkAllButton />
              <ViewAllLink onNavigate={close} />
            </div>
          }
        >
          <PanelBody onOpen={close} />
        </Modal>
      ) : null}
    </div>
  );
}

/** The latest few, or why there are none to show. */
function PanelBody({ onOpen }: { onOpen: () => void }) {
  const { items, loaded, loading, error } = useNotifications();
  // Opened by a press, long after the page loaded: the browser's own clock is right.
  const [now] = useState(() => Date.now());
  const recent = items.slice(0, NOTIFICATION_LIMITS.recent);

  return (
    <ScrollArea wrapperClassName="flex min-h-0 flex-1 flex-col" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {error ? <NotificationsError message={error} onRetry={() => void loadNotifications()} /> : null}
      {recent.length > 0 ? (
        <NotificationList items={recent} now={now} onOpen={onOpen} />
      ) : loaded ? (
        <NotificationsEmpty />
      ) : loading ? (
        <NotificationsLoading />
      ) : null}
    </ScrollArea>
  );
}

function MarkAllButton() {
  const { unread } = useNotifications();
  return (
    <button type="button" onClick={markAllNotificationsRead} disabled={unread === 0} className={buttonClasses("quiet", "md", "px-3")}>
      {copy.list.markAllRead}
    </button>
  );
}

function ViewAllLink({ onNavigate, className }: { onNavigate: () => void; className?: string }) {
  return (
    <Link href="/notifications" onClick={onNavigate} className={buttonClasses("quiet", "md", cn("px-3", className))}>
      {copy.bell.viewAll}
    </Link>
  );
}
