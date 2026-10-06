"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/Modal";
import { usePagePath } from "@/components/ui/use-page-path";
import { notificationsContent } from "@/content/notifications";
import { NOTIFICATION_LIMITS, badgeLabel } from "@/lib/notifications/model";
import { plural } from "@/lib/plural";

import { BELL_ICON, NotificationList, NotificationsEmpty } from "./NotificationList";
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
 * From `sm` up it opens a panel under the bell (Escape or a press elsewhere
 * closes it); on a phone, where a panel that size would be cramped, the same
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
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  // The panel: Escape hands focus back to the bell; a press elsewhere closes it.
  // (The phone's dialog does both for itself.)
  useEffect(() => {
    if (!open || !wide) return;
    panelRef.current?.focus({ preventScroll: true });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus({ preventScroll: true });
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, wide]);

  if (!isSignedIn) return null;

  const badge = badgeLabel(unread);
  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative shrink-0 print:hidden">
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
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d={BELL_ICON} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {badge ? (
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-1 inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-ink px-1 text-[0.65rem] font-semibold leading-none text-paper ring-2 ring-surface tabular-nums"
          >
            {badge}
          </span>
        ) : null}
      </button>

      {open && wide ? (
        <div
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-label={copy.bell.panelTitle}
          tabIndex={-1}
          className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(34rem,calc(100dvh-6rem))] w-[24rem] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-lift outline-none animate-enter"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line py-2 pl-4 pr-2">
            <h2 className="font-display text-lg text-ink">{copy.bell.panelTitle}</h2>
            <MarkAllButton />
          </header>
          <PanelBody onOpen={close} />
          <footer className="border-t border-line p-2">
            <ViewAllLink onNavigate={close} className="w-full" />
          </footer>
        </div>
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
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {error ? <NotificationsError message={error} onRetry={() => void loadNotifications()} /> : null}
      {recent.length > 0 ? (
        <NotificationList items={recent} now={now} onOpen={onOpen} />
      ) : loaded ? (
        <NotificationsEmpty />
      ) : loading ? (
        <NotificationsLoading />
      ) : null}
    </div>
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
