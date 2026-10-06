/**
 * The service-plan archive: every past service as a complete song list -
 * "what did we sing that Sunday?", "what surrounded Psalm 120 last time?".
 * The other view of the same history the song archive counts by song
 * (src/lib/song-history.ts). Pure - unit tested.
 */

import { recordedInsert } from "@/lib/service-planner/model";
import { serviceAnchor } from "@/lib/site-search";
import { keyMatches, matchesSong } from "@/lib/song-list";
import { weeklyService } from "@/lib/song-stats";
import type { DatedService, Song } from "@/types/song-list";

export interface ArchivedService {
  /** "2026-10-11-am" - its address, /song-list/archive/services/2026-10-11-am. */
  anchor: string;
  date: string;
  slot: "AM" | "PM";
  startsAt: string;
  /** A special service's name. */
  label: string | null;
  /** Outside the weekly pattern: stored as special, or (older records) on another day. */
  special: boolean;
  songs: Song[];
}

/** Past services as archive entries, newest first. */
export function toArchive(services: readonly DatedService[]): ArchivedService[] {
  return services
    .map((service) => ({
      anchor: serviceAnchor(service.date, service.slot),
      date: service.date,
      slot: service.slot,
      startsAt: service.startsAt,
      label: service.label ?? null,
      special: service.kind === "special" || weeklyService(service) === "other",
      songs: service.songs,
    }))
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
}

export const SERVICE_TYPES = ["all", "sundayMorning", "sundayEvening", "wednesday", "special"] as const;
export type ServiceTypeFilter = (typeof SERVICE_TYPES)[number];

export interface ArchiveFilter {
  /** "YYYY-MM-DD", inclusive; "" for open-ended. */
  from: string;
  to: string;
  /** A title or hymn number, as in the song archive's search. */
  song: string;
  type: ServiceTypeFilter;
  /** Only services with a song in this key (with `song`, that song in this key). */
  key: string;
  /** Only services whose insert matches (with `song`, the song must be the insert). */
  insertOnly: boolean;
}

export const NO_FILTER: ArchiveFilter = { from: "", to: "", song: "", type: "all", key: "", insertOnly: false };

/** The services matching every part of the filter; the order is kept. */
export function filterArchive(services: readonly ArchivedService[], filter: ArchiveFilter): ArchivedService[] {
  const wantsSong = filter.song.trim() !== "";
  const wantsKey = filter.key.trim() !== "";

  return services.filter((service) => {
    if (filter.from && service.date < filter.from) return false;
    if (filter.to && service.date > filter.to) return false;
    if (filter.type === "special" && !service.special) return false;
    if (filter.type !== "all" && filter.type !== "special") {
      if (service.special || weeklyService(service) !== filter.type) return false;
    }

    // The song, key and insert conditions must all hold for the SAME song.
    if (!wantsSong && !wantsKey && !filter.insertOnly) return true;
    return service.songs.some(
      (song) =>
        (!wantsSong || matchesSong({ title: song.title, number: song.number, keys: [song.key] }, { query: filter.song, key: "" })) &&
        (!wantsKey || (song.key !== null && keyMatches(song.key, filter.key))) &&
        (!filter.insertOnly || recordedInsert(song)),
    );
  });
}

/** Every key used in these services, for the key filter. */
export function archiveKeys(services: readonly ArchivedService[]): Array<string | null> {
  return services.flatMap((service) => service.songs.map((song) => song.key));
}
