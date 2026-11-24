"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";

import { useAccount, type AccountState } from "@/components/account/AccountContext";
import { usePagePath } from "@/components/ui/use-page-path";

import { FavoritesController, type FavoriteView } from "./favorites-controller";

/**
 * Favorites for whoever is signed in, shared by the Library's pages so a heart
 * keeps its state across them. It reads no session on the server and sends
 * nothing for a visitor, so the public pages stay public and cached.
 */

export type FavoritesAccess = "none" | "blocked" | "member";

interface FavoritesContextValue {
  access: FavoritesAccess;
  controller: FavoritesController | null;
  observe: (element: Element, id: string) => () => void;
}

const noObserve = () => () => undefined;
const FavoritesContext = createContext<FavoritesContextValue>({ access: "none", controller: null, observe: noObserve });

/**
 * Approved means a session and a profile that is not overdue, the same rule
 * the server applies. Unknown (still loading, or a failed lookup) is "none":
 * no private control shows until this account is confirmed.
 */
export function favoritesAccess({ isLoaded, isSignedIn, userId, me, meSettled }: AccountState): { access: FavoritesAccess; accountId: string | null } {
  if (!isLoaded || !isSignedIn || !userId || !meSettled || !me) return { access: "none", accountId: null };
  if (me.profileAttention === "blocked") return { access: "blocked", accountId: null };
  return { access: "member", accountId: userId };
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { access, accountId } = favoritesAccess(useAccount());
  // Made during render, keyed by account, so a new account never sees a frame of the old one's state.
  const controller = useMemo(() => (accountId ? new FavoritesController(accountId) : null), [accountId]);
  const pagePath = usePagePath();

  useEffect(() => {
    controller?.connect();
    return () => controller?.disconnect();
  }, [controller]);

  useEffect(() => {
    controller?.refreshIfStale();
  }, [controller, pagePath]);

  // One observer for every row: membership is asked only for songs near the screen.
  const targets = useRef(new Map<Element, string>());
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const rows = targets.current;
    observer.current?.disconnect();
    observer.current = null;
    if (!controller) return;
    if (typeof IntersectionObserver !== "undefined") {
      observer.current = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const id = rows.get(entry.target);
          if (id) controller.setVisible(id, entry.isIntersecting);
        }
      }, { rootMargin: "400px 0px" });
      for (const element of rows.keys()) observer.current.observe(element);
    } else {
      for (const id of rows.values()) controller.setVisible(id, true);
    }
    return () => {
      observer.current?.disconnect();
      observer.current = null;
    };
  }, [controller]);

  const observe = useCallback((element: Element, id: string) => {
    targets.current.set(element, id);
    if (observer.current) observer.current.observe(element);
    else if (typeof IntersectionObserver === "undefined") controller?.setVisible(id, true);
    return () => {
      targets.current.delete(element);
      observer.current?.unobserve(element);
      if (![...targets.current.values()].includes(id)) controller?.setVisible(id, false);
    };
  }, [controller]);

  const value = useMemo(() => ({ access, controller, observe }), [access, controller, observe]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  return useContext(FavoritesContext);
}

const noSubscribe = () => () => undefined;
const HIDDEN: FavoriteView = { status: "loading", favorited: false, pending: false, observed: null, intended: null, error: null };

/** One song's state, re-rendering only when that song changes. */
export function useFavoriteView(id: string): FavoriteView {
  const { controller } = useFavorites();
  const subscribe = useCallback(
    (listener: () => void) => (controller ? controller.subscribe(id, listener) : noSubscribe()),
    [controller, id],
  );
  const snapshot = useCallback(() => (controller ? controller.getView(id) : HIDDEN), [controller, id]);
  return useSyncExternalStore(subscribe, snapshot, () => HIDDEN);
}

/** Reports this element's song to the shared observer. */
export function useObservedFavorite(ref: RefObject<Element | null>, id: string, enabled: boolean): void {
  const { observe } = useFavorites();
  useEffect(() => {
    if (!enabled || !ref.current) return;
    return observe(ref.current, id);
  }, [enabled, id, observe, ref]);
}
