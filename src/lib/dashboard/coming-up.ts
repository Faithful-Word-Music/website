/**
 * "Coming up" on the Dashboard: the next services and their songs, with
 * this person's sheet music beside each song.
 *
 * The services come from the song list the public sees; what makes this the
 * person's own is the "Sheet Music" link: the PDF of the one type assigned to
 * them (src/lib/sheet-music-type.ts), among the files their permissions open
 * (canAccessFile). A song without that type gets no link - never a different
 * chart instead. The file route checks access again before serving anything.
 *
 * Pure - no server-only import - so it can be unit tested. The page fetches
 * the song list and the Sheet Music Index and hands them in.
 */

import { siteConfig } from "@/config/site";
import { getTimeline } from "@/lib/service-time";
import { matchIndexSong, type SheetMusicIndex } from "@/lib/sheet-music";
import { canAccessFile, MEMBER_VIEWER, PUBLIC_VIEWER } from "@/lib/sheet-music-access";
import { fileOfType, type SheetMusicType } from "@/lib/sheet-music-type";
import { serviceSlots, songPath, songSlug } from "@/lib/song-list";
import type { Service } from "@/types/song-list";

import type { DashboardFocus } from "./focus";

/** At most this many services... */
export const COMING_UP_LIMIT = 3;
/** ...starting within this many days. */
export const COMING_UP_DAYS = 7;

export type ComingUpStatus = "now" | "next" | "upcoming";

/**
 * The service happening now or next, then the ones after it within the
 * coming week, in order. A quiet week shows just the next service, however
 * far off it is - there is always something to look ahead to.
 */
export function selectComingUp(
  services: readonly Service[],
  now: number,
): Array<{ service: Service; status: ComingUpStatus }> {
  const timeline = getTimeline(services, now);
  const horizon = now + COMING_UP_DAYS * 24 * 60 * 60_000;

  const ahead = services
    .map((service) => ({ service, status: timeline.statusOf(service.id) }))
    .filter((entry): entry is { service: Service; status: ComingUpStatus } =>
      entry.status === "now" || entry.status === "next" || entry.status === "upcoming",
    )
    .sort((a, b) => Date.parse(a.service.startsAt!) - Date.parse(b.service.startsAt!));

  return ahead
    .filter((entry, index) => index === 0 || Date.parse(entry.service.startsAt!) <= horizon)
    .slice(0, COMING_UP_LIMIT);
}

export interface ComingUpSong {
  number: string | null;
  title: string;
  key: string | null;
  /** Where their assigned type of sheet music is, or null when this song has none they may open. */
  sheetHref: string | null;
}

export interface ComingUpService {
  id: string;
  status: ComingUpStatus;
  dateLabel: string;
  serviceLabel: string | null;
  startsAt: string;
  /** In sheet order; null is a song not chosen yet. */
  slots: Array<ComingUpSong | null>;
}

/**
 * The Dashboard's view of the coming services. Sheet music is linked only
 * for someone with an assigned type (`sheetType`), and only when the Index
 * could be read.
 */
export function buildComingUp(
  services: readonly Service[],
  now: number,
  focus: DashboardFocus,
  options: { index: SheetMusicIndex | null; sheetType: SheetMusicType | null },
): ComingUpService[] {
  const viewer = focus.opensMemberSheetMusic ? MEMBER_VIEWER : PUBLIC_VIEWER;
  const { index, sheetType } = options;

  function sheetFor(song: { title: string; number: string | null }): string | null {
    if (!sheetType || !index) return null;
    const indexSong = matchIndexSong(index, song, siteConfig.sheetMusic.hymnalCollection);
    if (!indexSong) return null;
    const found = fileOfType(indexSong, sheetType, (file) => canAccessFile(indexSong, file, viewer));
    return found ? `${songPath(songSlug(song.title))}/sheet-music/${found.file.slug}` : null;
  }

  return selectComingUp(services, now).map(({ service, status }) => ({
    id: service.id,
    status,
    dateLabel: service.dateLabel,
    serviceLabel: service.serviceLabel,
    startsAt: service.startsAt!,
    slots: serviceSlots(service).map((song) =>
      song ? { number: song.number, title: song.title, key: song.key, sheetHref: sheetFor(song) } : null,
    ),
  }));
}
