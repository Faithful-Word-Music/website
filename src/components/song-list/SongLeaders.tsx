"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { matchCardLeaders, type CardLeaderView, type SongListLeaders } from "@/lib/leadership/board";
import type { Song } from "@/types/song-list";

/**
 * Who leads the songs, on the song list's cards - for signed-in people who
 * prepare from the song lists. The page itself is static and the same for
 * everyone, so leaders are never in it: they are asked for once the page has
 * loaded (/api/account/song-leaders, private and never cached) and kept in
 * memory only - never in the browser's storage.
 *
 * A card shows them only when its songs match, place by place and title by
 * title, what the answer says: a page drawn from an older copy of the song
 * list shows no leaders rather than wrong ones.
 */

const Context = createContext<{ services: ReadonlyMap<string, SongListLeaders>; authorized: boolean } | null>(null);

export function SongLeadersProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAccount();
  const [answer, setAnswer] = useState<{ userId: string; authorized: boolean; leaders: SongListLeaders[] } | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    const controller = new AbortController();
    fetch("/api/account/song-leaders", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { authorized?: unknown; leaders?: unknown } | null) => {
        if (data && Array.isArray(data.leaders)) {
          setAnswer({ userId, authorized: data.authorized === true, leaders: data.leaders as SongListLeaders[] });
        }
      })
      .catch(() => {
        // Offline or aborted: the cards simply show no leaders.
      });
    return () => controller.abort();
  }, [isLoaded, isSignedIn, userId]);

  // Only ever this person's answer, and nothing once they have signed out.
  const current = answer && isSignedIn && answer.userId === userId ? answer : null;
  const value = useMemo(
    () => (current ? { services: new Map(current.leaders.map((service) => [service.anchor, service])), authorized: current.authorized } : null),
    [current],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Whether this person may have the song list with its leaders (the signed-in
 * PDF): they prepare from the song lists, by the server's own answer.
 */
export function useLeadersAuthorized(): boolean {
  return useContext(Context)?.authorized === true;
}

/**
 * A card's leaders (cardLeaderView: once for the service when one person leads
 * every song, otherwise on each song), when the answer matches its
 * rows; null otherwise, or outside the provider.
 */
export function useCardLeaders(serviceId: string, rows: ReadonlyArray<Pick<Song, "title"> | null>): CardLeaderView | null {
  const all = useContext(Context);
  const service = all?.services.get(serviceId);
  if (!service) return null;
  return matchCardLeaders(service, rows);
}
