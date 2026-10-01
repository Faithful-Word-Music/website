"use client";

import { useAuth } from "@clerk/nextjs";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { usePagePath } from "@/components/ui/use-page-path";
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

/** Inside ClerkProvider: only rendered when accounts are switched on. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [result, setResult] = useState<{ userId: string; me: Me | null } | null>(null);

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    let cancelled = false;
    fetch("/api/account/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!cancelled) setResult({ userId, me: data ? parseMe(data) : null });
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
    return {
      isLoaded,
      isSignedIn: signedIn,
      userId: signedIn ? (userId ?? null) : null,
      me,
      meSettled: !signedIn || current !== null,
      nav: { signedIn: isLoaded ? signedIn : onMemberPage, permissions: new Set(me?.permissions ?? []) },
    };
  }, [isLoaded, isSignedIn, userId, result, onMemberPage]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
