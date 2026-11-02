import type { MediaLink, Recording, RecordingSelection } from "./model";

/**
 * A change one recording action just made, as the browser applies it at once
 * - so the planner shows a saved recording the moment the save returns,
 * rather than after the page's data is fetched again. The fetch still
 * follows and replaces this with what the server holds. Pure.
 */
export type RecordingChange =
  /** Added or edited. A primary one takes over from the song's old primary. */
  | { kind: "recording-saved"; recording: Recording }
  | { kind: "recording-deleted"; id: string }
  | { kind: "primary"; songId: string; recordingId: string | null }
  | { kind: "link-saved"; link: MediaLink }
  | { kind: "link-deleted"; id: string }
  /** A recording chosen for one place of the service, or null for the song's primary again. */
  | { kind: "selection"; placeId: string; songId: string; recordingId: string | null };

export interface RecordingData {
  recordings: Recording[];
  links: MediaLink[];
  selections: RecordingSelection[];
}

function upsert<T extends { id: string }>(items: readonly T[], item: T): T[] {
  return items.some((existing) => existing.id === item.id)
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [...items, item];
}

export function applyRecordingChange<T extends RecordingData>(data: T, change: RecordingChange, where?: Pick<RecordingSelection, "date" | "slot">): T {
  switch (change.kind) {
    case "recording-saved": {
      const { recording } = change;
      const others = recording.isPrimary
        ? data.recordings.map((item) => (item.songId === recording.songId && item.id !== recording.id && item.isPrimary ? { ...item, isPrimary: false } : item))
        : data.recordings;
      return { ...data, recordings: upsert(others, recording) };
    }
    case "recording-deleted":
      return {
        ...data,
        recordings: data.recordings.filter((item) => item.id !== change.id),
        // A service that chose it now shows that it is gone.
        selections: data.selections.map((item) => (item.recordingId === change.id ? { ...item, recordingId: null } : item)),
      };
    case "primary":
      return {
        ...data,
        recordings: data.recordings.map((item) =>
          item.songId === change.songId ? { ...item, isPrimary: item.id === change.recordingId } : item,
        ),
      };
    case "link-saved":
      return { ...data, links: upsert(data.links, change.link) };
    case "link-deleted":
      return { ...data, links: data.links.filter((item) => item.id !== change.id) };
    case "selection": {
      const rest = data.selections.filter((item) => item.placeId !== change.placeId);
      if (change.recordingId === null || !where) return { ...data, selections: rest };
      return {
        ...data,
        selections: [...rest, { ...where, placeId: change.placeId, songId: change.songId, recordingId: change.recordingId }],
      };
    }
  }
}
