"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { isStandalone, subscribeStandalone } from "@/components/app/standalone";
import { usePagePath } from "@/components/ui/use-page-path";
import { appLoginUrl, isOpenInApp } from "@/lib/app-only";
import { showSplash } from "@/lib/splash";

/**
 * Inside the installed app only (src/lib/app-only.ts), once Clerk has loaded:
 *   - Signed out on any page but the way to an account: off to log in. This
 *     covers moving between pages and logging out, which the <head> script
 *     (full page loads only) does not see.
 *   - Just signed in, on the way to an account (the login pages): the loading
 *     screen comes back until the next page (the Dashboard, usually) has
 *     arrived, as an app's launch screen does. Only there - Clerk briefly
 *     reporting signed out and in again on any other page (refreshing its
 *     session) must never bring the screen back.
 * Only rendered while accounts are switched on.
 */
export function AppOnly() {
  const inApp = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
  const { isLoaded, isSignedIn } = useAccount();
  const path = usePagePath();
  const router = useRouter();
  const wasSignedIn = useRef<boolean | null>(null);
  /** Signed out, the last page seen was on the way to an account. */
  const signingIn = useRef(false);

  useEffect(() => {
    if (!inApp || !isLoaded || isSignedIn || isOpenInApp(path)) return;
    router.replace(appLoginUrl(window.location.origin, path, window.location.search));
  }, [inApp, isLoaded, isSignedIn, path, router]);

  // Remembered while signed out, so it holds however Clerk orders the sign-in
  // and the move to the next page.
  useEffect(() => {
    if (isLoaded && !isSignedIn) signingIn.current = isOpenInApp(path);
  }, [isLoaded, isSignedIn, path]);

  useEffect(() => {
    if (!isLoaded) return;
    if (inApp && wasSignedIn.current === false && isSignedIn && signingIn.current) showSplash();
    wasSignedIn.current = isSignedIn;
  }, [inApp, isLoaded, isSignedIn]);

  return null;
}
