import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";

import { siteConfig } from "@/config/site";
import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { churchDate, monthRange } from "@/lib/availability/occurrences";
import { getPublishedPlans, SCHEDULE_TAG, scheduleEnv } from "@/lib/schedule";
import { weekStartOf } from "@/lib/service-planner/model";
import { plannerConfigured } from "@/lib/service-planner/store";

import type { MediaLink, Recording, RecordingSelection } from "./model";
import { buildPreparation, type PlaylistMonth } from "./playlist";
import { listMediaLinks, listPublishedSelections, listRecordings } from "./store";

/**
 * Reading recordings for public pages. Everything here is cached across
 * requests and refreshed by the actions that change it (RECORDINGS_TAG), so a
 * visitor never wakes the database. Only PUBLIC recordings and links are ever
 * read into these caches: a members-only one cannot reach a public page,
 * because it is never in what the page is built from. Members fetch theirs
 * from /api/recordings, privately.
 */

export const RECORDINGS_TAG = "recordings";

export interface PublicRecordings {
  recordings: Recording[];
  links: MediaLink[];
}

const EMPTY: PublicRecordings = { recordings: [], links: [] };

const cachedPublicRecordings = unstable_cache(
  async (env: ClerkEnv): Promise<PublicRecordings> => {
    const [recordings, links] = await Promise.all([
      listRecordings(env, { visibility: "public" }),
      listMediaLinks(env, { visibility: "public" }),
    ]);
    return { recordings, links };
  },
  ["public-recordings"],
  { tags: [RECORDINGS_TAG], revalidate: siteConfig.songList.dataRevalidateSeconds },
);

/** Every public recording and link. Empty when the database cannot be read: the pages still work. */
export const getPublicRecordings = cache(async (): Promise<PublicRecordings> => {
  if (!plannerConfigured()) return EMPTY;
  try {
    return await cachedPublicRecordings(scheduleEnv());
  } catch (error) {
    console.error("[recordings] Could not load recordings:", error instanceof Error ? error.message : "unknown error");
    return EMPTY;
  }
});

/** One song's public recordings and links. */
export async function getSongRecordings(songId: string): Promise<PublicRecordings> {
  const { recordings, links } = await getPublicRecordings();
  return {
    recordings: recordings.filter((recording) => recording.songId === songId),
    links: links.filter((link) => link.songId === songId),
  };
}

const cachedPublishedSelections = unstable_cache(
  (env: ClerkEnv, from: string): Promise<RecordingSelection[]> => listPublishedSelections(env, from),
  ["published-recording-selections"],
  // A selection is public once its service is: publishing, unpublishing and cancelling refresh it.
  { tags: [RECORDINGS_TAG, SCHEDULE_TAG], revalidate: siteConfig.songList.dataRevalidateSeconds },
);

export interface PreparationData {
  ok: boolean;
  months: PlaylistMonth[];
  /** Public recordings only; members add theirs in the browser. */
  recordings: Recording[];
}

/**
 * The Preparation Playlists: every upcoming published service, month by
 * month, with the public recordings they use. Read once per request.
 */
export const getPreparation = cache(async (): Promise<PreparationData> => {
  const plans = await getPublishedPlans();
  if (!plans) return { ok: false, months: [], recordings: [] };
  try {
    const now = Date.now();
    const from = weekStartOf(monthRange(churchDate(now).slice(0, 7)).from);
    const [selections, { recordings }] = await Promise.all([cachedPublishedSelections(scheduleEnv(), from), getPublicRecordings()]);
    return { ok: true, months: buildPreparation(plans, selections, now), recordings };
  } catch (error) {
    console.error("[recordings] Could not build the Preparation Playlists:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, months: [], recordings: [] };
  }
});
