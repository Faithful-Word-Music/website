"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { isSongPage, SONG_ORIGIN_KEY } from "@/lib/song-origin";

/** Remembers the last page visited that isn't a song page, for the song page's back link. */
export function SongOriginTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (isSongPage(pathname)) return;
    try {
      sessionStorage.setItem(SONG_ORIGIN_KEY, pathname + window.location.search);
    } catch {
      // Storage blocked: song pages simply lead back to the archive.
    }
  }, [pathname]);

  return null;
}
