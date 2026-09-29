import { songListContent } from "@/content/song-list";

/**
 * Where a song page's back link goes. A song page can be reached from the
 * schedule, the archive or a year page, so the last of those visited in this
 * tab is remembered (song pages themselves are skipped, so hopping between
 * "Often sung with" songs still leads back to where you started).
 */

export const SONG_ORIGIN_KEY = "fwm:song-origin";

const SONG_LIST = "/song-list";

export function isSongPage(pathname: string): boolean {
  return /^\/song-list\/archive\/[^/]+\/?$/.test(pathname);
}

/**
 * The back link for an origin path (with any query). With no origin - someone
 * opened a shared link straight to the song - it leads to the song list.
 */
export function songBackTarget(origin: string | null): { href: string; label: string } {
  const { backLabels } = songListContent.songPage;
  const pathname = origin?.split(/[?#]/)[0].replace(/\/$/, "") ?? "";

  const year = pathname.match(/^\/song-list\/year\/(\d{4})$/)?.[1];
  if (origin && year) return { href: origin, label: backLabels.year.replace("{year}", year) };

  if (origin && pathname === "/song-list/archive") return { href: origin, label: backLabels.archive };

  if (origin && pathname === SONG_LIST) return { href: origin, label: backLabels.songList };

  return { href: SONG_LIST, label: backLabels.songList };
}
