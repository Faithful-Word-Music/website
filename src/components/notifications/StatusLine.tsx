"use client";

import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/StatusIcons";
import { notificationsContent } from "@/content/notifications";

/** "Loading…", while the first notifications are on their way. */
export function NotificationsLoading({ className }: { className?: string }) {
  return (
    <p role="status" className={cn("flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted", className)}>
      <Spinner />
      {notificationsContent.list.loading}
    </p>
  );
}

/** Something could not be loaded or saved: what, and a way to try again. */
export function NotificationsError({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3 text-sm text-gold-dark", className)}>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className={buttonClasses("quiet", "md", "min-h-9 px-0")}>
          {notificationsContent.errors.retry}
        </button>
      ) : null}
    </div>
  );
}
