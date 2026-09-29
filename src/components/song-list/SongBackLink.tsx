"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { SONG_ORIGIN_KEY, songBackTarget } from "@/lib/song-origin";

const subscribe = () => () => {};

function readOrigin(): string | null {
  try {
    return sessionStorage.getItem(SONG_ORIGIN_KEY);
  } catch {
    return null;
  }
}

/**
 * "← Back to …" at the top of a song page, pointing at the page the visitor
 * came from. The server can't know that, so its HTML says the song list.
 */
export function SongBackLink() {
  const origin = useSyncExternalStore(subscribe, readOrigin, () => null);
  const { href, label } = songBackTarget(origin);

  return (
    <Link
      href={href}
      className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink"
    >
      <span aria-hidden="true">←</span>
      {label}
    </Link>
  );
}
