"use server";

import { revalidatePath, updateTag } from "next/cache";

import { recordingsContent } from "@/content/recordings";
import { servicePlannerContent } from "@/content/service-planner";
import { firstIssue } from "@/lib/auth/forms";
import { withPermission, type ActionResult } from "@/lib/auth/session";
import { linkSource, safeLinkUrl } from "@/lib/recordings/links";
import { RECORDINGS_TAG } from "@/lib/recordings/load";
import type { MediaLink, Recording } from "@/lib/recordings/model";
import { youtubeOembed } from "@/lib/recordings/oembed";
import { parseRecordingUrl } from "@/lib/recordings/providers";
import {
  addLinkSchema,
  addRecordingSchema,
  deleteSchema,
  lookupSchema,
  primarySchema,
  serviceRecordingSchema,
  updateLinkSchema,
  updateRecordingSchema,
} from "@/lib/recordings/forms";
import {
  deleteMediaLink,
  deleteRecording as removeRecording,
  getRecording,
  insertMediaLink,
  insertRecording,
  saveSelection,
  setPrimaryRecording as storePrimary,
  updateMediaLink,
  updateRecording as storeUpdate,
} from "@/lib/recordings/store";
import { SCHEDULE_TAG } from "@/lib/schedule";
import { isLocked, parseAnchor } from "@/lib/service-planner/model";
import { getPlan } from "@/lib/service-planner/store";
import { songIdentity } from "@/lib/song-identity";

/**
 * Changing song recordings and media links - one set of actions, used by the
 * song pages and the Service Planner alike, so both always show the same
 * recordings and follow the same rules. Every action:
 *
 *   1. runs only for someone holding manage_songs (recordings belong to the
 *      song) or, for choosing a recording for one service,
 *      manage_service_plans - checked on the server by withPermission;
 *   2. validates what the browser sent (src/lib/recordings/forms.ts), and
 *      parses every address again here;
 *   3. refreshes the song pages, the playlists and the planner (RECORDINGS_TAG).
 */

const MANAGE = "manage_songs";
const PLAN = "manage_service_plans";
const copy = recordingsContent.manage;

/** Every page that shows recordings. */
function refreshRecordings() {
  updateTag(RECORDINGS_TAG);
  revalidatePath("/library", "layout");
  revalidatePath("/preparation", "layout");
  revalidatePath("/service-planner", "layout");
  revalidatePath("/dashboard");
}

export interface RecordingLookup {
  provider: "youtube";
  mediaId: string;
  canonicalUrl: string;
  title: string | null;
  sourceName: string | null;
}

/**
 * Reads an address before it is added: which provider plays it, and the
 * title and channel the provider gives, to fill in the form.
 */
export async function lookUpRecording(input: unknown): Promise<ActionResult<RecordingLookup>> {
  return withPermission(MANAGE, async () => {
    const parsed = lookupSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const found = parseRecordingUrl(parsed.data.url);
    if (!found) return { ok: false, error: copy.errors.unsupported };
    const meta = await youtubeOembed(found.canonicalUrl);
    if (!meta.ok && meta.reason === "not-found") return { ok: false, error: copy.errors.notFound };
    if (!meta.ok && meta.reason === "not-embeddable") return { ok: false, error: copy.errors.notEmbeddable };
    return {
      ok: true,
      value: {
        provider: found.provider.id,
        mediaId: found.mediaId,
        canonicalUrl: found.canonicalUrl,
        title: meta.ok ? meta.title : null,
        sourceName: meta.ok ? meta.authorName : null,
      },
    };
  });
}

/** Adds a playable recording to a song. Never makes it the primary. */
export async function addRecording(input: unknown): Promise<ActionResult<Recording>> {
  return withPermission(MANAGE, async (viewer) => {
    const parsed = addRecordingSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { songId, url, ...details } = parsed.data;
    const found = parseRecordingUrl(url);
    if (!found) return { ok: false, error: copy.errors.unsupported };
    const meta = await youtubeOembed(found.canonicalUrl);
    if (!meta.ok && meta.reason === "not-found") return { ok: false, error: copy.errors.notFound };
    if (!meta.ok && meta.reason === "not-embeddable") return { ok: false, error: copy.errors.notEmbeddable };

    const saved = await insertRecording(
      viewer.env,
      {
        songId,
        provider: found.provider.id,
        mediaId: found.mediaId,
        sourceUrl: found.canonicalUrl,
        ...details,
        sourceName: details.sourceName ?? (meta.ok ? meta.authorName : null),
      },
      viewer.userId,
    );
    if (!saved.ok) return { ok: false, error: copy.errors.duplicate };
    refreshRecordings();
    return { ok: true, value: saved.recording, message: copy.messages.added };
  });
}

/** Changes a recording's title, source, notes, key or who can see it. */
export async function updateRecording(input: unknown): Promise<ActionResult<Recording>> {
  return withPermission(MANAGE, async (viewer) => {
    const parsed = updateRecordingSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { id, ...details } = parsed.data;
    const saved = await storeUpdate(viewer.env, id, details, viewer.userId);
    if (!saved) return { ok: false, error: copy.errors.gone };
    refreshRecordings();
    return { ok: true, value: saved, message: copy.messages.updated };
  });
}

/** Deletes a recording. A song whose primary it was is left with none. */
export async function deleteRecording(input: unknown): Promise<ActionResult> {
  return withPermission(MANAGE, async (viewer) => {
    const parsed = deleteSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const removed = await removeRecording(viewer.env, parsed.data.id);
    if (!removed) return { ok: false, error: copy.errors.gone };
    // A published service that chose it now shows that the recording is gone.
    updateTag(SCHEDULE_TAG);
    refreshRecordings();
    return { ok: true, value: null, message: copy.messages.deleted };
  });
}

/** Makes a recording the song's primary, or (null) leaves the song with none. */
export async function setPrimaryRecording(input: unknown): Promise<ActionResult> {
  return withPermission(MANAGE, async (viewer) => {
    const parsed = primarySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { songId, recordingId } = parsed.data;
    const done = await storePrimary(viewer.env, songId, recordingId, viewer.userId);
    if (!done) return { ok: false, error: copy.errors.gone };
    refreshRecordings();
    return { ok: true, value: null, message: recordingId ? copy.messages.primary : copy.messages.primaryCleared };
  });
}

/** Adds an external media link - opened on its own site, never played or put in a playlist. */
export async function addMediaLink(input: unknown): Promise<ActionResult<MediaLink>> {
  return withPermission(MANAGE, async (viewer) => {
    const parsed = addLinkSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const url = safeLinkUrl(parsed.data.url);
    if (!url) return { ok: false, error: copy.errors.badLink };
    const saved = await insertMediaLink(viewer.env, { ...parsed.data, url, source: linkSource(url) }, viewer.userId);
    refreshRecordings();
    return { ok: true, value: saved, message: copy.messages.linkAdded };
  });
}

export async function editMediaLink(input: unknown): Promise<ActionResult<MediaLink>> {
  return withPermission(MANAGE, async (viewer) => {
    const parsed = updateLinkSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const url = safeLinkUrl(parsed.data.url);
    if (!url) return { ok: false, error: copy.errors.badLink };
    const { id, ...rest } = parsed.data;
    const saved = await updateMediaLink(viewer.env, id, { ...rest, url, source: linkSource(url) }, viewer.userId);
    if (!saved) return { ok: false, error: copy.errors.gone };
    refreshRecordings();
    return { ok: true, value: saved, message: copy.messages.linkUpdated };
  });
}

export async function removeMediaLink(input: unknown): Promise<ActionResult> {
  return withPermission(MANAGE, async (viewer) => {
    const parsed = deleteSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const removed = await deleteMediaLink(viewer.env, parsed.data.id);
    if (!removed) return { ok: false, error: copy.errors.gone };
    refreshRecordings();
    return { ok: true, value: null, message: copy.messages.linkDeleted };
  });
}

/**
 * Chooses the recording one place of one service uses instead of the song's
 * primary - or (null) goes back to the primary. The song's own primary is
 * never touched. Refused when the service was saved by anyone since the page
 * was read, or the recording is of a different song. On a published service
 * it takes effect at once: it is preparation material, not part of the
 * published song list, so the service stays published (as with its leaders).
 */
export async function setServiceRecording(input: unknown): Promise<ActionResult> {
  return withPermission(PLAN, async (viewer) => {
    const parsed = serviceRecordingSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { anchor, placeId, planRevision, recordingId } = parsed.data;
    const where = parseAnchor(anchor);
    if (!where) return { ok: false, error: recordingsContent.manage.errors.gone };

    const plan = await getPlan(viewer.env, where.date, where.slot);
    if (!plan) return { ok: false, error: copy.errors.unsaved };
    if (plan.status === "cancelled" || isLocked(plan.startsAt, Date.now())) return { ok: false, error: copy.errors.gone };
    if (plan.revision !== planRevision) return { ok: false, error: servicePlannerContent.workspace.conflict };
    const index = plan.places.indexOf(placeId);
    const song = index >= 0 ? plan.slots[index] : null;
    if (!song) return { ok: false, error: copy.errors.gone };
    const songId = songIdentity(song);

    if (recordingId) {
      const recording = await getRecording(viewer.env, recordingId);
      if (!recording) return { ok: false, error: copy.errors.gone };
      if (recording.songId !== songId) return { ok: false, error: copy.errors.notThisSong };
    }

    const saved = await saveSelection(viewer.env, { ...where, placeId, songId, recordingId }, planRevision, viewer.userId);
    if (!saved.ok) return { ok: false, error: servicePlannerContent.workspace.conflict };
    refreshRecordings();
    return { ok: true, value: null, message: recordingId ? copy.messages.selected : copy.messages.selectionCleared };
  });
}
