/**
 * "Coming up" on the Dashboard: the next services and their songs, with
 * this person's sheet music for each service as one PDF.
 *
 * The services come from the song list the public sees; what makes this the
 * person's own is the sheet music: the PDF of the one type assigned to them
 * (src/lib/sheet-music-type.ts), among the files their permissions open
 * (canAccessFile). A song without that type is left out - never other sheet
 * music instead. The PDF's route checks access again before serving anything.
 *
 * Pure - no server-only import - so it can be unit tested. The page fetches
 * the song list and the Sheet Music Index and hands them in.
 */

import { siteConfig } from "@/config/site";
import { getTimeline } from "@/lib/service-time";
import { type IndexSong, matchIndexSong, type SheetFile, type SheetMusicIndex, type SongVersion } from "@/lib/sheet-music";
import { canAccessFile, MEMBER_VIEWER, PUBLIC_VIEWER, type Viewer as SheetViewer } from "@/lib/sheet-music-access";
import { fileOfType } from "@/lib/sheet-music-type";
import { serviceSlots } from "@/lib/song-list";
import { serviceAnchor } from "@/lib/site-search";
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
}

export interface ComingUpService {
  id: string;
  status: ComingUpStatus;
  dateLabel: string;
  serviceLabel: string | null;
  startsAt: string;
  /** In sheet order; null is a song not chosen yet. */
  slots: Array<ComingUpSong | null>;
  /** All of their sheet music for the service as one PDF, or null when no song has any. */
  packetHref: string | null;
  /** The songs in that PDF, in order: what to count pages through when printing only some. */
  packetSongs: Array<{ number: string | null; title: string }>;
}

/** One chosen song of a service, with the file of the person's type - or null for none. */
export interface ServiceSheet {
  number: string | null;
  title: string;
  key: string | null;
  found: { song: IndexSong; version: SongVersion; file: SheetFile } | null;
}

/**
 * The chosen songs of a service, in order, each with the PDF of exactly the
 * person's assigned type that they may open (see fileOfType) - the one rule
 * both the Dashboard's count and the service PDF follow.
 */
export function serviceSheets(
  service: Service,
  options: { index: SheetMusicIndex; sheetType: number; viewer: SheetViewer },
): ServiceSheet[] {
  const { index, sheetType, viewer } = options;
  return serviceSlots(service)
    .filter((song) => song !== null)
    .map((song) => {
      const indexSong = matchIndexSong(index, song, siteConfig.sheetMusic.hymnalCollection);
      const found = indexSong
        ? fileOfType(indexSong, sheetType, (file) => canAccessFile(indexSong, file, viewer))
        : null;
      return {
        number: song.number,
        title: song.title,
        key: song.key,
        found: found && indexSong ? { song: indexSong, ...found } : null,
      };
    });
}

/** Where a service's sheet music PDF is: /dashboard/sheet-music/2026-10-04-am. */
export function servicePacketPath(service: Pick<Service, "date" | "slot">): string | null {
  return service.date ? `/dashboard/sheet-music/${serviceAnchor(service.date, service.slot)}` : null;
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
  options: { index: SheetMusicIndex | null; sheetType: number | null },
): ComingUpService[] {
  const viewer = focus.opensMemberSheetMusic ? MEMBER_VIEWER : PUBLIC_VIEWER;
  const { index, sheetType } = options;

  return selectComingUp(services, now).map(({ service, status }) => {
    const sheets =
      sheetType !== null && index ? serviceSheets(service, { index, sheetType, viewer }) : [];
    const slots = serviceSlots(service).map((song): ComingUpSong | null =>
      song ? { number: song.number, title: song.title, key: song.key } : null,
    );
    const packetSongs = sheets
      .filter((sheet) => sheet.found)
      .map((sheet) => ({ number: sheet.number, title: sheet.title }));

    return {
      id: service.id,
      status,
      dateLabel: service.dateLabel,
      serviceLabel: service.serviceLabel,
      startsAt: service.startsAt!,
      slots,
      packetHref: packetSongs.length > 0 ? servicePacketPath(service) : null,
      packetSongs,
    };
  });
}
