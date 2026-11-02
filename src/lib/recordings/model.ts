/**
 * Song recordings: the shapes shared by the server, the song pages, the
 * Service Planner and the Preparation Playlists. Pure - safe in the browser.
 *
 *   Recording   a playable reference recording of one song, hosted by its
 *               provider (YouTube). We keep its address and who published
 *               it, never a copy of the media.
 *   MediaLink   anything else worth opening for a song - a Drive folder of
 *               audio, a demo video. Never playable here, never in a playlist.
 *
 * A recording belongs to its song for good, not to a service. A service may
 * pick a different one of the song's recordings for one place
 * (RecordingSelection) without changing the song's primary.
 *
 * Many songs have no recording at all; that is a normal state, not a fault.
 */

export type RecordingVisibility = "public" | "members";

export const RECORDING_VISIBILITIES: readonly RecordingVisibility[] = ["public", "members"];

/** The providers a recording may come from. Each is defined in providers.ts. */
export type RecordingProviderId = "youtube";

export interface Recording {
  id: string;
  songId: string;
  provider: RecordingProviderId;
  /** The provider's own ID for the media (YouTube's 11-character video ID). */
  mediaId: string;
  /** The address it was added from, normalised. Opens the original. */
  sourceUrl: string;
  title: string;
  /** Who published it - the channel or organization ("Faithful Word Baptist Church"). */
  sourceName: string | null;
  description: string | null;
  /** How it differs from how the song is usually done ("Piano demonstration", "Alternate arrangement"). */
  arrangement: string | null;
  /** The key it is recorded in, when known. */
  musicKey: string | null;
  visibility: RecordingVisibility;
  /** The song's standard recording, used by Preparation Playlists. At most one per song. */
  isPrimary: boolean;
  updatedAt: string;
}

export type MediaLinkSource = "google-drive" | "youtube" | "other";

export interface MediaLink {
  id: string;
  songId: string;
  url: string;
  source: MediaLinkSource;
  title: string;
  description: string | null;
  visibility: RecordingVisibility;
  updatedAt: string;
}

/**
 * The recording one place of one service uses instead of the song's primary.
 * `songId` is the song that was in that place when it was chosen: if the
 * place now holds another song, the selection no longer applies.
 */
export interface RecordingSelection {
  date: string;
  slot: "AM" | "PM";
  placeId: string;
  songId: string;
  /** null when the chosen recording has since been deleted. */
  recordingId: string | null;
}

/** Recordings first by primary, then oldest first - a stable order everywhere. */
export function sortRecordings(recordings: readonly Recording[]): Recording[] {
  return [...recordings].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id),
  );
}

/** Groups recordings by song, each song's list sorted. */
export function recordingsBySong(recordings: readonly Recording[]): Map<string, Recording[]> {
  const bySong = new Map<string, Recording[]>();
  for (const recording of recordings) bySong.set(recording.songId, [...(bySong.get(recording.songId) ?? []), recording]);
  for (const [songId, list] of bySong) bySong.set(songId, sortRecordings(list));
  return bySong;
}

/** Whether a viewer may see a recording or link with this visibility. */
export function visibleTo(visibility: RecordingVisibility, canSeeMembers: boolean): boolean {
  return visibility === "public" || canSeeMembers;
}
