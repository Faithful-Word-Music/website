/**
 * "Coming up" on the Dashboard: the next services and their songs, with
 * this person's sheet music for each service as one PDF.
 *
 * The services come from the song list the public sees; what makes this the
 * person's own is the sheet music: for each song, the PDF of the first of
 * their assigned types that it has (assignedFiles in
 * src/lib/sheet-music-type.ts), among the files their permissions open
 * (canAccessFile), with their other types it has as alternatives. A song
 * with none of their types says so - never other sheet music instead. The
 * PDF routes check access again before serving anything.
 *
 * Pure - no server-only import - so it can be unit tested. The page fetches
 * the song list and the Sheet Music Index and hands them in.
 */

import { siteConfig } from "@/config/site";
import { getTimeline } from "@/lib/service-time";
import { type IndexSong, matchIndexSong, type SheetFile, type SheetMusicIndex, type SongVersion } from "@/lib/sheet-music";
import { canAccessFile, MEMBER_VIEWER, PUBLIC_VIEWER, type Viewer as SheetViewer } from "@/lib/sheet-music-access";
import { assignedFiles } from "@/lib/sheet-music-type";
import { serviceSlots, songPath, songSlug } from "@/lib/song-list";
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

/** One of the person's types for a song: its name, and its PDF on its own. */
export interface SheetChoice {
  label: string;
  href: string;
}

/**
 * A song's sheet music for this person: the type shown (their first choice
 * the song has) and their other types it has - or "missing" when it has none
 * of their types.
 */
export type ComingUpSheet =
  | { status: "found"; shown: SheetChoice; alternatives: SheetChoice[] }
  | { status: "missing" };

export interface ComingUpSong {
  number: string | null;
  title: string;
  key: string | null;
  /** null when they have no assigned types, or the Index could not be read. */
  sheet: ComingUpSheet | null;
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
  /** The songs in that PDF, in order, with the type used: what to count pages through when printing only some. */
  packetSongs: Array<{ number: string | null; title: string; label: string }>;
  /** Whether to name the type used for each song: only when they have more than one. */
  showLabels: boolean;
}

/** One chosen song of a service, with the file of the person's first type it has - or null for none. */
export interface ServiceSheet {
  number: string | null;
  title: string;
  key: string | null;
  found: { song: IndexSong; version: SongVersion; file: SheetFile } | null;
  /** Their other types the song has, in their order. */
  alternatives: Array<{ version: SongVersion; file: SheetFile }>;
}

type SheetOptions = { index: SheetMusicIndex; sheetTypes: readonly number[]; viewer: SheetViewer };

/** One song's sheet music for the person (see assignedFiles). */
function sheetFor(
  song: { number: string | null; title: string; key: string | null },
  options: SheetOptions,
): ServiceSheet {
  const { index, sheetTypes, viewer } = options;
  const indexSong = matchIndexSong(index, song, siteConfig.sheetMusic.hymnalCollection);
  const [first, ...alternatives] = indexSong
    ? assignedFiles(indexSong, sheetTypes, (file) => canAccessFile(indexSong, file, viewer))
    : [];
  return {
    number: song.number,
    title: song.title,
    key: song.key,
    found: first && indexSong ? { song: indexSong, ...first } : null,
    alternatives,
  };
}

/**
 * The chosen songs of a service, in order, each with the PDF of the first of
 * the person's assigned types it has that they may open - the one rule both
 * the Dashboard and the service PDF follow.
 */
export function serviceSheets(service: Service, options: SheetOptions): ServiceSheet[] {
  return serviceSlots(service)
    .filter((song) => song !== null)
    .map((song) => sheetFor(song, options));
}

/** Where a service's sheet music PDF is: /dashboard/sheet-music/2026-10-04-am. */
export function servicePacketPath(service: Pick<Service, "date" | "slot">): string | null {
  return service.date ? `/dashboard/sheet-music/${serviceAnchor(service.date, service.slot)}` : null;
}

/** Where one song's file is: the song page's file route, which checks access itself. */
function fileHref(title: string, file: SheetFile): string {
  return `${songPath(songSlug(title))}/sheet-music/${file.slug}`;
}

function toComingUpSheet(sheet: ServiceSheet): ComingUpSheet {
  if (!sheet.found) return { status: "missing" };
  const choice = ({ version, file }: { version: SongVersion; file: SheetFile }): SheetChoice => ({
    label: version.label,
    href: fileHref(sheet.title, file),
  });
  return { status: "found", shown: choice(sheet.found), alternatives: sheet.alternatives.map(choice) };
}

/**
 * The Dashboard's view of the coming services. Sheet music is linked only
 * for someone with assigned types (`sheetTypes`, in order of preference),
 * and only when the Index could be read.
 */
export function buildComingUp(
  services: readonly Service[],
  now: number,
  focus: DashboardFocus,
  options: { index: SheetMusicIndex | null; sheetTypes: readonly number[] },
): ComingUpService[] {
  const viewer = focus.opensMemberSheetMusic ? MEMBER_VIEWER : PUBLIC_VIEWER;
  const { index, sheetTypes } = options;
  const sheetOptions = sheetTypes.length > 0 && index ? { index, sheetTypes, viewer } : null;

  return selectComingUp(services, now).map(({ service, status }) => {
    const slots = serviceSlots(service).map((song): ComingUpSong | null => {
      if (!song) return null;
      const sheet = sheetOptions ? toComingUpSheet(sheetFor(song, sheetOptions)) : null;
      return { number: song.number, title: song.title, key: song.key, sheet };
    });
    const packetSongs = slots.flatMap((song) =>
      song?.sheet?.status === "found"
        ? [{ number: song.number, title: song.title, label: song.sheet.shown.label }]
        : [],
    );

    return {
      id: service.id,
      status,
      dateLabel: service.dateLabel,
      serviceLabel: service.serviceLabel,
      startsAt: service.startsAt!,
      slots,
      packetHref: packetSongs.length > 0 ? servicePacketPath(service) : null,
      packetSongs,
      showLabels: sheetTypes.length > 1,
    };
  });
}
