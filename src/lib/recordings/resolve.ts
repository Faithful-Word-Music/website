import type { Recording, RecordingSelection } from "./model";
import { isPlaylistCapable } from "./providers";

/**
 * Which recording one scheduled song uses, for one viewer.
 *
 *   1. The recording chosen for this place of this service, when there is one.
 *   2. Otherwise the song's primary recording.
 *   3. Otherwise nothing plays: "unset" when the song has recordings but none
 *      is its primary (worth a quiet word to a planner), else "none" - a
 *      normal state; the song stays on the list.
 *
 * A choice that cannot be honoured (the recording was deleted, or this viewer
 * may not see it) is reported as an issue. It never quietly falls back to the
 * primary: someone chose that recording on purpose, and the planner must see
 * that it needs looking at.
 */

/** What a scheduled place says about its recording, as the playlist carries it. */
export type SelectionState =
  | { kind: "none" }
  | { kind: "chosen"; recordingId: string }
  /** A recording was chosen, and has since been deleted. */
  | { kind: "removed" };

export type IssueReason = "removed" | "unavailable" | "unsupported";

export type Resolved =
  | { kind: "selected" | "primary"; recording: Recording }
  | { kind: "none" }
  /** The song has playable recordings, but none is its primary. */
  | { kind: "unset" }
  | { kind: "issue"; reason: IssueReason };

/** The recordings a viewer may see, looked up both ways. */
export interface RecordingCatalog {
  byId: ReadonlyMap<string, Recording>;
  primaryBySong: ReadonlyMap<string, Recording>;
  /** Songs with at least one playable recording. */
  songsWithRecordings: ReadonlySet<string>;
}

export function catalogOf(recordings: readonly Recording[]): RecordingCatalog {
  const byId = new Map<string, Recording>();
  const primaryBySong = new Map<string, Recording>();
  const songsWithRecordings = new Set<string>();
  for (const recording of recordings) {
    byId.set(recording.id, recording);
    if (recording.isPrimary) primaryBySong.set(recording.songId, recording);
    if (isPlaylistCapable(recording.provider)) songsWithRecordings.add(recording.songId);
  }
  return { byId, primaryBySong, songsWithRecordings };
}

/**
 * A stored selection as the playlist carries it - or "none" when it no longer
 * applies because the place now holds a different song. That is how a
 * selection never follows its place to a replacement song.
 */
export function selectionState(selection: RecordingSelection | undefined, songIdAtPlace: string | null): SelectionState {
  if (!selection || !songIdAtPlace || selection.songId !== songIdAtPlace) return { kind: "none" };
  return selection.recordingId ? { kind: "chosen", recordingId: selection.recordingId } : { kind: "removed" };
}

export function resolveRecording(songId: string | null, selection: SelectionState, catalog: RecordingCatalog): Resolved {
  if (selection.kind === "removed") return { kind: "issue", reason: "removed" };
  if (selection.kind === "chosen") {
    const recording = catalog.byId.get(selection.recordingId);
    // Not in what this viewer may see: members-only, or gone since the page was built.
    if (!recording || recording.songId !== songId) return { kind: "issue", reason: "unavailable" };
    if (!isPlaylistCapable(recording.provider)) return { kind: "issue", reason: "unsupported" };
    return { kind: "selected", recording };
  }
  if (!songId) return { kind: "none" };
  const primary = catalog.primaryBySong.get(songId);
  if (!primary || !isPlaylistCapable(primary.provider)) return { kind: catalog.songsWithRecordings.has(songId) ? "unset" : "none" };
  return { kind: "primary", recording: primary };
}

/** The recording to play, or null. */
export function playableRecording(resolved: Resolved): Recording | null {
  return resolved.kind === "selected" || resolved.kind === "primary" ? resolved.recording : null;
}
