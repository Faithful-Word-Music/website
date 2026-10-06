"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { leaveBlocked } from "@/components/ui/page-link";
import { appBadge, parsePushClick } from "@/lib/notifications/push";

import { openedFromPush, refreshNotifications, useNotifications } from "./notification-store";
import { refreshPushDevice, releaseSignedOutDevice } from "./push-device";

/**
 * Keeps the open site and the service worker (public/sw.js) in step. Renders
 * nothing; it is in the root layout, so it is there on every page.
 *
 *   - Signed in: registers the service worker and looks at this device's push
 *     (push-device.ts), reconnecting it if this person had it on. Signed out:
 *     ends any push subscription this browser still holds.
 *   - A push arrived: the notification store is refreshed - still the one
 *     store; the push adds nothing of its own to it.
 *   - A push was tapped: it is marked read and its page opened, here, where
 *     there is a session and unsaved work can be asked about.
 *   - The installed app's icon shows the store's `unread`, and nothing at
 *     zero. Where an icon cannot be badged, nothing happens.
 */
export function PushSync() {
  const { isLoaded, isSignedIn, userId } = useAccount();
  const { unread, counted } = useNotifications();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && userId) void refreshPushDevice(userId);
    else void releaseSignedOutDevice();
  }, [isLoaded, isSignedIn, userId]);

  useEffect(() => {
    if (!isSignedIn || !userId || !("serviceWorker" in navigator)) return;
    function onMessage(event: MessageEvent) {
      const type = (event.data as { type?: unknown } | null)?.type;
      if (type === "fwm:push") {
        void refreshNotifications();
      } else if (type === "fwm:push-subscription") {
        if (userId) void refreshPushDevice(userId);
      } else if (type === "fwm:push-click") {
        const tap = parsePushClick(event.data);
        if (!tap) return;
        // Tells the service worker this page has it; unanswered, it opens the site afresh instead.
        event.ports[0]?.postMessage({ ok: true });
        void openedFromPush(tap.id);
        const here = window.location.pathname + window.location.search;
        // Already there: show what changed. A page with unsaved work asks first, and goes itself if told to.
        if (tap.url === here) router.refresh();
        else if (!leaveBlocked(tap.url)) router.push(tap.url);
      }
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [isSignedIn, userId, router]);

  // The app's icon. Not before the count is known: the zero the store starts
  // from would wipe a badge the service worker set while the app was closed.
  const known = isLoaded && (!isSignedIn || counted);
  const shown = isSignedIn ? unread : 0;
  const last = useRef(0);
  useEffect(() => {
    if (!known) return;
    const badge = appBadge(shown);
    const nav = navigator as Navigator & { setAppBadge?: (count: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      if ("set" in badge) void nav.setAppBadge?.(badge.set)?.catch(() => undefined);
      else void nav.clearAppBadge?.()?.catch(() => undefined);
    } catch {
      // Not supported here.
    }
    // Everything has just been read: what is still on the lock screen is put away too.
    if (last.current > 0 && shown === 0) void closeShownNotifications();
    last.current = shown;
  }, [known, shown]);

  return null;
}

async function closeShownNotifications() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const shown = (await registration?.getNotifications?.()) ?? [];
    shown.forEach((notification) => notification.close());
  } catch {
    // Not supported here.
  }
}
