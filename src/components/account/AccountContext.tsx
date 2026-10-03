"use client";

import { useAuth } from "@clerk/nextjs";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { usePagePath } from "@/components/ui/use-page-path";
import { NAV_CACHE_KEY, parseCachedNav, serializeCachedNav } from "@/lib/auth/nav-cache";
import { isPermission, type Permission } from "@/lib/auth/permissions";
import { SIGNED_OUT, isMemberPath, type NavContext } from "@/lib/navigation";

/**
 * The signed-in person, as the browser knows them - shared by the header,
 * mobile menu, footer, search and the song pages' members' sheet music, so
 * /api/account/me is asked once per person rather than once per component.
 *
 * Public pages are static and the same for everyone, so they cannot know who
 * is looking; this finds out after the page loads. It only shapes what is
 * SHOWN: every protected page, file and action checks again on the server.
 *
 * Without accounts (no AccountProvider), everyone is a visitor.
 */

interface Me {
  permissions: Permission[];
  canAccessAdmin: boolean;
  canViewSheetMusic: boolean;
  title: string | null;
}

export interface AccountState {
  /** False until Clerk has said whether anyone is signed in. */
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  /** The person's details from /api/account/me, or null while loading (or if it failed). */
  me: Me | null;
  /** True once /api/account/me has answered (or failed) for this person. */
  meSettled: boolean;
  /** For src/lib/navigation.ts. */
  nav: NavContext;
}

const VISITOR: AccountState = {
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  me: null,
  meSettled: true,
  nav: SIGNED_OUT,
};

const AccountContext = createContext<AccountState>(VISITOR);

export function useAccount(): AccountState {
  return useContext(AccountContext);
}

function parseMe(data: unknown): Me {
  const value = (data ?? {}) as Partial<Record<keyof Me, unknown>>;
  return {
    permissions: Array.isArray(value.permissions)
      ? value.permissions.filter((item): item is Permission => typeof item === "string" && isPermission(item))
      : [],
    canAccessAdmin: value.canAccessAdmin === true,
    canViewSheetMusic: value.canViewSheetMusic === true,
    title: typeof value.title === "string" ? value.title : null,
  };
}

/*
 * The last permissions seen in this browser (src/lib/auth/nav-cache.ts), so
 * the gated links show at once rather than after Clerk and /api/account/me.
 * Storage can be missing or blocked; the navigation then just waits as before.
 */
const navCacheListeners = new Set<() => void>();

function subscribeNavCache(listener: () => void) {
  navCacheListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    navCacheListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readNavCache(): string | null {
  try {
    return window.localStorage.getItem(NAV_CACHE_KEY);
  } catch {
    return null;
  }
}

function writeNavCache(value: string | null) {
  if (readNavCache() === value) return;
  try {
    if (value === null) window.localStorage.removeItem(NAV_CACHE_KEY);
    else window.localStorage.setItem(NAV_CACHE_KEY, value);
  } catch {
    return;
  }
  navCacheListeners.forEach((listener) => listener());
}

/** Inside ClerkProvider: only rendered when accounts are switched on. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [result, setResult] = useState<{ userId: string; me: Me | null } | null>(null);
  // Null on the server and while hydrating, so the first render matches it.
  const cachedRaw = useSyncExternalStore(subscribeNavCache, readNavCache, () => null);
  const cached = useMemo(() => parseCachedNav(cachedRaw), [cachedRaw]);

  // Forget them on sign-out, or when someone else has signed in here.
  useEffect(() => {
    if (!isLoaded || !cached) return;
    if (!isSignedIn || cached.userId !== userId) writeNavCache(null);
  }, [isLoaded, isSignedIn, userId, cached]);

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    let cancelled = false;
    fetch("/api/account/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        const me = data ? parseMe(data) : null;
        setResult({ userId, me });
        // Only a real answer replaces what is remembered - never a failure.
        if (me) writeNavCache(serializeCachedNav({ userId, permissions: me.permissions }));
      })
      .catch(() => {
        if (!cancelled) setResult({ userId, me: null });
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId]);

  // A members' page is only ever open to someone signed in, so its navigation
  // need not wait for Clerk (it would otherwise flash the visitor's links).
  const onMemberPage = isMemberPath(usePagePath());

  const value = useMemo((): AccountState => {
    const signedIn = Boolean(isLoaded && isSignedIn && userId);
    const current = signedIn && result?.userId === userId ? result : null;
    const me = current?.me ?? null;
    // The navigation may go ahead on the remembered permissions - this
    // person's, or before Clerk loads on a members' page (only someone signed
    // in can be there). `me` itself always waits for the real answer.
    const useCached = signedIn ? cached?.userId === userId : !isLoaded && onMemberPage;
    const permissions = me?.permissions ?? (useCached ? cached?.permissions : undefined) ?? [];
    return {
      isLoaded,
      isSignedIn: signedIn,
      userId: signedIn ? (userId ?? null) : null,
      me,
      meSettled: !signedIn || current !== null,
      nav: { signedIn: isLoaded ? signedIn : onMemberPage, permissions: new Set(permissions) },
    };
  }, [isLoaded, isSignedIn, userId, result, onMemberPage, cached]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
