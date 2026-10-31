import "server-only";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { loadBoard } from "@/lib/leadership/load";
import { effectiveLeaders } from "@/lib/leadership/model";
import { getSchedule } from "@/lib/schedule";
import { getPlan } from "@/lib/service-planner/store";
import { parseAnchor, slotSongs } from "@/lib/service-planner/model";
import { fileLabel, findFile, type IndexSong } from "@/lib/sheet-music";
import { MEMBER_VIEWER, PUBLIC_VIEWER, canAccessFile } from "@/lib/sheet-music-access";
import { getSheetMusicIndex } from "@/lib/sheet-music-index";
import { songDirectory } from "@/lib/song-archive";
import { normalizeSongNumber, normalizeSongTitle, resolveSong, songIdentity, songUrlSlug, type IdentityEntry } from "@/lib/song-identity";
import type { DatedService, Song } from "@/types/song-list";

import type { SupportActor } from "./access";
import { SERVICE_DETAILS, type ContextInput, type ServiceState, type SongSnapshot, type SupportContext } from "./context";
import { SUPPORT_LIMITS, contextKinds, type Category } from "./model";

/**
 * Turns the references a browser sent (ContextInput) into a checked
 * snapshot (SupportContext), or refuses them. Every check is the one the
 * referenced page itself makes:
 *
 *   a service's songs   only when it is published (the public song list), or
 *                       for someone who plans services
 *   song leading        only a service the person leads songs in (or a
 *                       planner), and before publication only the positions
 *                       they lead - never the songs
 *   a sheet music file  only one the person may open (sheet-music-access.ts)
 *   a song              only one the site knows (the library and catalog)
 *
 * What is kept is what was there when it was reported. A place ID names a
 * place, so the song in it is snapshotted beside it: replacing that song
 * later never changes what the request is about.
 */

export type ContextResolution = { ok: true; context: SupportContext } | { ok: false; reason: "missing" | "changed" | "hidden" };

const deny = (reason: "missing" | "changed" | "hidden"): ContextResolution => ({ ok: false, reason });

interface ServiceFacts {
  anchor: string;
  date: string;
  slot: "AM" | "PM";
  label: string | null;
  startsAt: string | null;
  state: ServiceState;
  planRevision: number | null;
  /** Its places and songs, in order (empty places null), with each place's ID when it has one. */
  places: Array<{ placeId: string | null; song: Song | null }>;
}

const isPublic = (state: ServiceState) => state === "published" || state === "past";

async function serviceFacts(env: ClerkEnv, anchor: string, now: number): Promise<ServiceFacts | null> {
  const where = parseAnchor(anchor);
  if (!where) return null;
  const [plan, schedule] = await Promise.all([getPlan(env, where.date, where.slot), getSchedule()]);
  const published: DatedService | undefined = schedule.ok
    ? schedule.published.find((service) => service.date === where.date && service.slot === where.slot)
    : undefined;
  if (plan) {
    const state: ServiceState =
      plan.status === "published" ? (Date.parse(plan.startsAt) <= now ? "past" : "published") : plan.status === "cancelled" ? "cancelled" : "draft";
    return {
      anchor,
      ...where,
      label: plan.label,
      startsAt: plan.startsAt,
      state,
      planRevision: plan.revision,
      places: plan.slots.map((song, index) => ({ placeId: plan.places[index] ?? null, song: song ? slotSongs([song])[0] : null })),
    };
  }
  if (published) {
    // Sung before the planner kept places: its songs, with no place IDs.
    return { anchor, ...where, label: published.label ?? null, startsAt: published.startsAt, state: "past", planRevision: null,
      places: published.songs.map((song) => ({ placeId: null, song })) };
  }
  return { anchor, ...where, label: null, startsAt: null, state: "not-started", planRevision: null, places: [] };
}

function songSnapshot(song: Song, entries: readonly IdentityEntry[]): SongSnapshot {
  const match = resolveSong(song, entries);
  return {
    songId: songIdentity(song, entries),
    title: match?.title ?? song.title,
    number: song.number ?? match?.number ?? null,
    collection: match?.collection ?? song.collection ?? null,
    ...(song.key !== undefined ? { key: song.key } : {}),
    ...(match ? {} : { unresolved: true }),
  };
}

/** The same song, however each was written down: by identity, never by title alone. */
function sameIdentity(song: Song, songId: string, entries: readonly IdentityEntry[]): boolean {
  return songIdentity(song, entries).toLowerCase() === songIdentity({ songId, title: "" }, entries).toLowerCase();
}

export async function resolveContext(
  env: ClerkEnv,
  actor: SupportActor,
  category: Category,
  input: ContextInput,
  now: number = Date.now(),
): Promise<ContextResolution> {
  const kinds = contextKinds(category);
  const context: SupportContext = { v: 1 };
  const plans = actor.can(SERVICE_DETAILS);
  const entries = input.songId || input.service ? await songDirectory() : [];

  if (input.service) {
    const facts = await serviceFacts(env, input.service, now);
    if (!facts) return deny("missing");
    const visible = isPublic(facts.state) || plans;

    if (input.leadership && kinds.includes("leadership")) {
      const board = await loadBoard(env, now);
      const service = board.services.find((item) => item.anchor === facts.anchor);
      if (!service) return deny("missing");
      const positions = effectiveLeaders(service.places, service.leadership)
        .filter((place) => place.userId === actor.userId)
        .map((place) => place.position);
      if (positions.length === 0 && !plans) return deny("hidden");
      context.leadership = { revision: service.leadership.revision, positions };
    } else if (!visible) {
      return deny("hidden");
    }

    context.service = {
      anchor: facts.anchor,
      date: facts.date,
      slot: facts.slot,
      // A draft's name is the planners' until it is published.
      label: visible ? facts.label : null,
      startsAt: facts.startsAt,
      state: facts.state,
      planRevision: facts.planRevision,
    };
    if (!isPublic(facts.state)) context.restricted = true;

    if (kinds.includes("occurrence") && (input.placeId || input.position)) {
      if (!visible) return deny("hidden");
      let index: number;
      if (input.placeId) {
        index = facts.places.findIndex((place) => place.placeId === input.placeId);
        if (index < 0) return deny("changed");
      } else {
        // The song list counts songs only (empty places are "to be announced"): find the nth song.
        const filled = facts.places.flatMap((place, at) => (place.song ? [at] : []));
        index = filled[input.position! - 1] ?? -1;
        if (index < 0) return deny("changed");
        const song = facts.places[index].song!;
        if (!input.songId || !sameIdentity(song, input.songId, entries)) return deny("changed");
      }
      const place = facts.places[index];
      context.place = { placeId: place.placeId, position: index + 1, song: place.song ? songSnapshot(place.song, entries) : null };
    }
  }

  if (input.songId && !context.place) {
    const match = resolveSong({ songId: input.songId, title: "" }, entries);
    if (!match) return deny("missing");
    context.song = { songId: match.id, title: match.title, number: match.number, collection: match.collection };
    if (input.file) {
      const index = await getSheetMusicIndex();
      const song: IndexSong | undefined = index.ok ? index.index.songs.find((item) => item.id.toLowerCase() === match.id.toLowerCase()) : undefined;
      const found = song ? findFile(song, input.file) : null;
      if (!song || !found) return deny("missing");
      // Only a file this person could open themselves.
      if (!canAccessFile(song, found.file, actor.can("view_sheet_music") ? MEMBER_VIEWER : PUBLIC_VIEWER)) return deny("hidden");
      context.sheetMusic = { file: input.file, label: fileLabel(found.version), format: found.file.format };
    }
  }

  if (input.page) context.page = { path: input.page };
  if (JSON.stringify(context).length > SUPPORT_LIMITS.contextBytes) return deny("missing");
  return { ok: true, context };
}

// ---------------------------------------------------------------------------
// The form's choices
// ---------------------------------------------------------------------------

export interface ServiceChoice {
  anchor: string;
  date: string;
  slot: "AM" | "PM";
  label: string | null;
  startsAt: string;
}

/** How far back and ahead the form offers published services. */
const CHOICE_DAYS = { back: 56, ahead: 60 };

/** Published services near today, newest first: what the public song list shows. */
export async function serviceChoices(now: number = Date.now()): Promise<ServiceChoice[]> {
  const schedule = await getSchedule();
  if (!schedule.ok) return [];
  const from = now - CHOICE_DAYS.back * 86_400_000;
  const to = now + CHOICE_DAYS.ahead * 86_400_000;
  return schedule.published
    .filter((service) => {
      const at = Date.parse(service.startsAt);
      return at >= from && at <= to;
    })
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
    .map((service) => ({
      anchor: `${service.date}-${service.slot.toLowerCase()}`,
      date: service.date,
      slot: service.slot,
      label: service.label ?? null,
      startsAt: service.startsAt,
    }));
}

/** The services the person leads songs in from now on - positions only, never a draft's songs. */
export async function leadingChoices(env: ClerkEnv, userId: string, now: number = Date.now()): Promise<Array<ServiceChoice & { positions: number[] }>> {
  const board = await loadBoard(env, now);
  return board.services
    .filter((service) => service.status !== "cancelled" && Date.parse(service.startsAt) > now)
    .flatMap((service) => {
      const positions = effectiveLeaders(service.places, service.leadership)
        .filter((place) => place.userId === userId)
        .map((place) => place.position);
      return positions.length > 0
        ? [{ anchor: service.anchor, date: service.date, slot: service.slot, label: service.status === "published" ? service.label : null, startsAt: service.startsAt, positions }]
        : [];
    });
}

export interface SongChoice {
  /** For the song list (position + songId) and the planner (placeId). */
  position: number;
  placeId: string | null;
  songId: string;
  title: string;
  number: string | null;
  key: string | null;
}

/** The songs of a service the person may see the songs of; null when they may not. */
export async function serviceSongChoices(env: ClerkEnv, actor: SupportActor, anchor: string, now: number = Date.now()): Promise<SongChoice[] | null> {
  const facts = await serviceFacts(env, anchor, now);
  if (!facts || !(isPublic(facts.state) || actor.can(SERVICE_DETAILS))) return null;
  const entries = await songDirectory();
  let songNumber = 0;
  return facts.places.flatMap((place) => {
    if (!place.song) return [];
    songNumber += 1;
    return [
      {
        position: songNumber,
        placeId: place.placeId,
        songId: songIdentity(place.song, entries),
        title: place.song.title,
        number: place.song.number,
        key: place.song.key,
      },
    ];
  });
}

/** Songs the site knows whose title or hymn number matches, for the song search. */
export async function searchSongs(query: string, limit = 8): Promise<Array<{ songId: string; title: string; number: string | null; collection: string | null; slug: string }>> {
  const text = normalizeSongTitle(query);
  if (text.length < 2 && !/^\d+$/.test(query.trim())) return [];
  const number = /^\d+[a-z]?$/i.test(query.trim()) ? normalizeSongNumber(query) : null;
  const entries = await songDirectory();
  const scored = entries.flatMap((entry) => {
    const title = normalizeSongTitle(entry.title);
    const score = number && entry.number && normalizeSongNumber(entry.number) === number ? 0 : title.startsWith(text) ? 1 : title.includes(text) ? 2 : -1;
    return score < 0 ? [] : [{ entry, score }];
  });
  return scored
    .sort((a, b) => a.score - b.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map(({ entry }) => ({ songId: entry.id, title: entry.title, number: entry.number, collection: entry.collection, slug: songUrlSlug({ ...entry, songId: entry.id }) }));
}

/** A song's sheet music files the person may open, for "Which sheet music?". */
export async function songFileChoices(actor: SupportActor, songId: string): Promise<Array<{ file: string; label: string; format: string }>> {
  const index = await getSheetMusicIndex();
  if (!index.ok) return [];
  const song = index.index.songs.find((item) => item.id.toLowerCase() === songId.toLowerCase());
  if (!song) return [];
  const viewer = actor.can("view_sheet_music") ? MEMBER_VIEWER : PUBLIC_VIEWER;
  return song.versions.flatMap((version) =>
    version.files.filter((file) => canAccessFile(song, file, viewer)).map((file) => ({ file: file.slug, label: fileLabel(version), format: file.format })),
  );
}

/** A known song's library address, for a request's links. */
export async function songSlugs(): Promise<(song: SongSnapshot) => string | null> {
  const entries = await songDirectory();
  return (song) => {
    const match = resolveSong({ songId: song.songId, title: song.title, number: song.number, collection: song.collection }, entries);
    return match ? songUrlSlug({ ...match, songId: match.id }) : null;
  };
}
