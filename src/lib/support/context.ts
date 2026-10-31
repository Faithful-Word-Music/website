/**
 * What a support request points at: a service, one song's place in it, a
 * song, a file of its sheet music, the viewer's own song leading, or a page.
 *
 * The browser only ever sends REFERENCES (ContextInput). The server checks
 * each against what the person may see right now and keeps a SNAPSHOT of how
 * it stood (SupportContext, context-load.ts), so that a song replaced or a
 * place removed later never changes what was reported: a place ID names a
 * place in a service, not the song in it.
 *
 * A snapshot taken from something not public (a draft service) is marked
 * `restricted`, and redactContext() hides its details from anyone reading the
 * request who could not see that service themselves. Reading a request grants
 * nothing else: its links lead only to pages that check their own access.
 *
 * Pure - no server-only import.
 */

import type { Permission } from "@/lib/auth/permissions";
import { isSitePath } from "@/lib/page-origin";
import { PLACE_ID_PATTERN } from "@/lib/service-planner/places";

import { contextKinds, type Category } from "./model";

/** What the browser may send. Every field is checked on the server. */
export interface ContextInput {
  /** A service anchor, "2026-11-08-am". */
  service?: string;
  /** A place in that service (the planner knows place IDs). */
  placeId?: string;
  /** Or: which song of the published service, 1-based, with the song it showed (the song list). */
  position?: number;
  songId?: string;
  /** A sheet music file of the song, by its slug ("standard-1.pdf"). */
  file?: string;
  /** About the viewer's own song leading in that service. */
  leadership?: boolean;
  /** A page on this site (a website problem). */
  page?: string;
}

export interface SongSnapshot {
  /** Canonical or durable song identity (song-identity.ts). Never a title used as a key. */
  songId: string;
  title: string;
  number: string | null;
  collection: string | null;
  /** The key it was to be sung in, for an occurrence. */
  key?: string | null;
  /** The identity could not be settled (an older record): shown, never used to look anything up. */
  unresolved?: boolean;
}

export type ServiceState = "published" | "draft" | "not-started" | "cancelled" | "past";

export interface SupportContext {
  v: 1;
  service?: {
    anchor: string;
    date: string;
    slot: "AM" | "PM";
    label: string | null;
    startsAt: string | null;
    state: ServiceState;
    /** The songs' revision when it was reported (null for an archived service). */
    planRevision: number | null;
  };
  /** One song's place in that service, as it was. */
  place?: {
    /** The place's persistent ID, or null for an archived service that never had one. */
    placeId: string | null;
    position: number;
    song: SongSnapshot | null;
  };
  song?: SongSnapshot;
  sheetMusic?: { file: string; label: string; format: string };
  /** The reporter's own song leading in that service, as it was. */
  leadership?: { revision: number; positions: number[] };
  page?: { path: string };
  /**
   * Taken from something not public (a service not published): its songs and
   * places are shown only to people who could see it (SERVICE_DETAILS).
   */
  restricted?: boolean;
  /** Set only on a copy made for a reader (redactContext): details were left out. Never stored. */
  redacted?: boolean;
}

/** Who may see a restricted snapshot's songs and places: whoever may see unpublished services. */
export const SERVICE_DETAILS: Permission = "manage_service_plans";

const ANCHOR = /^\d{4}-\d{2}-\d{2}-(am|pm)$/;
const SONG_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const FILE_SLUG = /^[a-z0-9][a-z0-9.-]{0,119}$/;

/**
 * The references, tidied and limited to what the category takes. Anything
 * malformed is dropped (and the server then refuses a category that needs
 * it); nothing is trusted yet.
 */
export function parseContextInput(category: Category, raw: unknown): ContextInput {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  const kinds = contextKinds(category);
  const input: ContextInput = {};
  const wantsService = kinds.some((kind) => kind === "service" || kind === "occurrence" || kind === "leadership");
  if (wantsService && typeof value.service === "string" && ANCHOR.test(value.service)) input.service = value.service;
  if (input.service && kinds.includes("occurrence")) {
    if (typeof value.placeId === "string" && PLACE_ID_PATTERN.test(value.placeId)) input.placeId = value.placeId;
    else if (typeof value.position === "number" && Number.isInteger(value.position) && value.position >= 1 && value.position <= 50) {
      input.position = value.position;
    }
  }
  const wantsSong = kinds.includes("song") || kinds.includes("sheet_music") || kinds.includes("occurrence");
  if (wantsSong && typeof value.songId === "string" && SONG_ID.test(value.songId)) input.songId = value.songId;
  if (kinds.includes("sheet_music") && input.songId && typeof value.file === "string" && FILE_SLUG.test(value.file)) input.file = value.file;
  if (kinds.includes("leadership") && input.service && value.leadership === true) input.leadership = true;
  if (kinds.includes("page") && typeof value.page === "string" && value.page.length <= 300 && isSitePath(value.page)) input.page = value.page;
  return input;
}

/** Whether a context has anything in it. */
export function isEmptyContext(context: SupportContext): boolean {
  return !context.service && !context.place && !context.song && !context.sheetMusic && !context.leadership && !context.page;
}

/** A context as one reader may see it: a restricted snapshot loses its songs and places. */
export function redactContext(context: SupportContext, mayView: (permission: Permission) => boolean, isSubmitter: boolean): SupportContext {
  if (!context.restricted || isSubmitter || mayView(SERVICE_DETAILS)) return context;
  return {
    v: 1,
    // Before publication even who leads which song is for the planners and that leader alone.
    ...(context.service ? { service: { ...context.service, label: null } } : {}),
    ...(context.page ? { page: context.page } : {}),
    restricted: true,
    redacted: true,
  };
}

export function isRedacted(context: SupportContext): boolean {
  return context.redacted === true;
}

/** A song's page in the library. */
export function songHref(slug: string): string {
  return `/library/songs/${encodeURIComponent(slug)}`;
}

/**
 * Where the context can be looked at now - only routes this site has, each
 * of which checks its own access. Null when there is nowhere suitable.
 */
export function contextLinks(
  context: SupportContext,
  mayView: (permission: Permission) => boolean,
  slugFor: (song: SongSnapshot) => string | null,
): Array<{ kind: "service" | "planner" | "song" | "page"; href: string }> {
  const links: Array<{ kind: "service" | "planner" | "song" | "page"; href: string }> = [];
  const service = context.service;
  if (service && ANCHOR.test(service.anchor)) {
    if (service.state === "published" || service.state === "past") links.push({ kind: "service", href: `/song-list#${service.anchor}` });
    if (mayView("manage_service_plans")) links.push({ kind: "planner", href: `/service-planner/${service.anchor}` });
  }
  const song = context.song ?? context.place?.song ?? null;
  if (song && !song.unresolved && !isRedacted(context)) {
    const slug = slugFor(song);
    if (slug) links.push({ kind: "song", href: songHref(slug) });
  }
  if (context.page && isSitePath(context.page.path)) links.push({ kind: "page", href: context.page.path });
  return links;
}
