"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAccount } from "@/components/account/AccountContext";
import type { MediaLink, Recording } from "@/lib/recordings/model";

export interface ViewerRecordings {
  /** Everything this person may see: the page's public recordings, and members' once fetched. */
  recordings: Recording[];
  links: MediaLink[];
  /** They may add, change and delete recordings (manage_songs). */
  canManage: boolean;
  /** Fetch again - after a change. */
  reload: () => void;
}

/**
 * The page is the same for everyone and carries public recordings only.
 * For a signed-in member this asks /api/recordings, privately, for what they
 * may also see (members-only recordings and links), and replaces the public
 * set with that fuller, fresh one. Anyone else keeps what the page brought.
 */
export function useViewerRecordings(
  initial: { recordings: Recording[]; links: MediaLink[] },
  songIds?: readonly string[],
): ViewerRecordings {
  const { me } = useAccount();
  const permissions = me?.permissions;
  const member = permissions?.includes("view_member_resources") || permissions?.includes("manage_songs") || false;
  const [fetched, setFetched] = useState<{ recordings: Recording[]; links: MediaLink[]; canManage: boolean } | null>(null);
  const [version, setVersion] = useState(0);
  const query = useMemo(() => (songIds ?? []).map((id) => `song=${encodeURIComponent(id)}`).join("&"), [songIds]);

  useEffect(() => {
    if (!member) return;
    const controller = new AbortController();
    fetch(`/api/recordings${query ? `?${query}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { recordings?: Recording[]; links?: MediaLink[]; canManage?: boolean } | null) => {
        if (data && Array.isArray(data.recordings) && Array.isArray(data.links)) {
          setFetched({ recordings: data.recordings, links: data.links, canManage: data.canManage === true });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [member, query, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  if (!member || !fetched) return { ...initial, canManage: false, reload };
  return { ...fetched, reload };
}
