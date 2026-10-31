/**
 * Song leaders across services: what the Dashboard and the song list are
 * built from. Pure - the server loads the pieces (src/lib/leadership/load.ts)
 * and hands them here - so every rule about what is shown, to whom, is tested.
 *
 * A LeadershipBoard is the scheduler's whole view. Nothing leaves it for a
 * browser except through visibleLeadership() (src/lib/leadership/access.ts):
 * a draft's songs are never in it at all, only whether each place is filled.
 */

import type { ServiceAvailability } from "@/lib/auth/profile-options";
import { effectiveAvailability, type ExceptionStatus } from "@/lib/availability/effective";
import type { Permission } from "@/lib/auth/permissions";
import type { ServiceSlot } from "@/types/song-list";

import { visibleLeadership, type ServiceState, type VisibleLeadership } from "./access";
import {
  effectiveLeaders,
  leaderConflicts,
  summarize,
  type EffectivePlace,
  type Leadership,
  GUEST_LEADER,
  type LeaderConflict,
  type LeadershipSummary,
} from "./model";

export interface BoardService {
  /** "2026-11-08-pm". */
  anchor: string;
  date: string;
  slot: ServiceSlot;
  startsAt: string;
  label: string | null;
  status: ServiceState;
  /** The availability kind of service ("sunday_pm", "special"): what normal availability is matched by. */
  normalKey: ServiceAvailability;
  places: string[];
  /**
   * The songs, place by place - ONLY for a published service (what the
   * public song list shows anyway). Null for every other service.
   */
  songs: Array<{ title: string; number: string | null; key: string | null } | null> | null;
  leadership: Leadership;
}

/** Someone who leads, or was assigned to. */
export interface BoardPerson {
  id: string;
  name: string;
  /** Holds lead_songs on purpose and has a usable account (not disabled, not deleted). */
  eligible: boolean;
  normal: ServiceAvailability[];
}

export interface BoardException {
  userId: string;
  date: string;
  slot: ServiceSlot;
  status: ExceptionStatus;
}

export interface Board {
  services: BoardService[];
  people: Map<string, BoardPerson>;
  /** "userId|date|slot" -> exception. */
  exceptions: Map<string, ExceptionStatus>;
}

export function indexBoardExceptions(rows: readonly BoardException[]): Map<string, ExceptionStatus> {
  return new Map(rows.map((row) => [`${row.userId}|${row.date}|${row.slot}`, row.status]));
}

/** Whether someone is available for a service: by the availability rules; null when they are unknown. */
export function availableFor(board: Pick<Board, "people" | "exceptions">, service: Pick<BoardService, "date" | "slot" | "normalKey">) {
  return (userId: string): boolean | null => {
    // A guest has no availability to check (GUEST_LEADER).
    if (userId === GUEST_LEADER) return null;
    const person = board.people.get(userId);
    if (!person || !person.eligible) return null;
    const exception = board.exceptions.get(`${userId}|${service.date}|${service.slot}`) ?? null;
    return effectiveAvailability(person.normal, service, exception).effective;
  };
}

/** One service's leaders, worked out: who leads each place, who is away, and the counts. */
export interface ServiceLeaders {
  effective: EffectivePlace[];
  conflicts: LeaderConflict[];
  summary: LeadershipSummary;
}

export function serviceLeaders(board: Pick<Board, "people" | "exceptions">, service: BoardService): ServiceLeaders {
  const effective = effectiveLeaders(service.places, service.leadership);
  const available = availableFor(board, service);
  const eligible = (userId: string) => board.people.get(userId)?.eligible ?? false;
  return { effective, conflicts: leaderConflicts(effective, available), summary: summarize(effective, available, eligible) };
}

// ---------------------------------------------------------------------------
// One viewer's part
// ---------------------------------------------------------------------------

export interface Viewer {
  userId: string;
  can(permission: Permission): boolean;
}

/** A service the viewer leads songs in, as they may see it. */
export interface MyAssignment {
  anchor: string;
  date: string;
  slot: ServiceSlot;
  startsAt: string;
  label: string | null;
  published: boolean;
  /** The positions they lead (1-based). */
  positions: number[];
  /** Their songs - titles and keys - only once the song list is published. */
  songs: Array<{ position: number; title: string; number: string | null; key: string | null }> | null;
  /** They are marked unavailable for it. */
  unavailable: boolean;
}

/** The services from now on that the viewer leads songs in, soonest first. Cancelled ones are left out. */
export function myAssignments(board: Board, viewer: Viewer, now: number): MyAssignment[] {
  const mine: MyAssignment[] = [];
  for (const service of board.services) {
    if (service.status === "cancelled" || Date.parse(service.startsAt) <= now) continue;
    const effective = effectiveLeaders(service.places, service.leadership);
    const positions = effective.filter((place) => place.userId === viewer.userId).map((place) => place.position);
    if (positions.length === 0) continue;
    const published = service.status === "published";
    const songs =
      published && service.songs
        ? positions.flatMap((position) => {
            const song = service.songs![position - 1];
            return song ? [{ position, title: song.title, number: song.number, key: song.key }] : [];
          })
        : null;
    const exception = board.exceptions.get(`${viewer.userId}|${service.date}|${service.slot}`) ?? null;
    const person = board.people.get(viewer.userId);
    mine.push({
      anchor: service.anchor,
      date: service.date,
      slot: service.slot,
      startsAt: service.startsAt,
      label: service.label,
      published,
      positions,
      songs,
      unavailable: person ? !effectiveAvailability(person.normal, service, exception).effective : exception === "unavailable",
    });
  }
  return mine.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

// ---------------------------------------------------------------------------
// The song list: published services' leaders, by song, by name
// ---------------------------------------------------------------------------

/** One published service's leaders, as the song list shows them beside its songs. */
export interface SongListLeaders {
  anchor: string;
  /**
   * Every place of the service, in order, as the song list lays out its rows
   * (an empty place is a "to be announced" row: `title` null), with its
   * leader. The titles let a page drawn from an older copy of the song list
   * tell its rows no longer match, and show no leaders rather than wrong ones.
   */
  places: Array<{ title: string | null; leader: CardLeader | null }>;
}

/**
 * The leaders of the published services the viewer may see in full
 * (access "roster" or "manage"): names only - never an account ID, never a
 * place ID. Anyone else gets nothing here: their own part is on the Dashboard.
 */
export function songListLeaders(board: Board, viewer: Viewer, now: number): SongListLeaders[] {
  const result: SongListLeaders[] = [];
  for (const service of board.services) {
    if (service.status !== "published" || !service.songs || Date.parse(service.startsAt) <= now - 86_400_000) continue;
    const effective = effectiveLeaders(service.places, service.leadership);
    const visible = visibleLeadership(viewer, service.status, effective);
    if (!visible || visible.access === "own" || !visible.places) continue;
    const places = service.songs.map((song, at) => {
      const userId = visible.places![at]?.userId ?? null;
      const person = userId ? board.people.get(userId) : undefined;
      return {
        title: song?.title ?? null,
        leader: userId ? { name: person?.name ?? "A song leader", mine: userId === viewer.userId } : null,
      };
    });
    if (places.some((place) => place.leader)) result.push({ anchor: service.anchor, places });
  }
  return result;
}

/** One leader as a card shows them: a name, and whether it is the person looking. */
export interface CardLeader {
  name: string;
  mine: boolean;
}

/**
 * How a service card shows who leads - as quietly as it can while saying
 * exactly who leads what:
 *
 *   one person leads every song     once, for the service: `service`, and
 *                                   nothing on the songs
 *   anything else                   on each song (`rows`, by 1-based
 *                                   position), in its small grey line:
 *                                   "Led by Brian", "No leader yet" - so no
 *                                   song ever seems led by someone it is not
 *
 * Null when no song has a leader (nothing is shown at all).
 */
export interface CardLeaderView {
  service: CardLeader | null;
  rows: Record<number, CardLeader | null>;
}

export function cardLeaderView(rows: ReadonlyArray<CardLeader | null>): CardLeaderView | null {
  if (!rows.some(Boolean)) return null;
  const [first] = rows;
  if (first && rows.every((leader) => leader?.name === first.name)) return { service: first, rows: {} };
  return { service: null, rows: Object.fromEntries(rows.map((leader, index) => [index + 1, leader])) };
}

/** A leader in words: "Led by Alex Ball", "Led by you", or "No leader yet". */
export function captionText(leader: CardLeader | null, words: { ledBy: string; ledByYou: string; noLeader: string }): string {
  if (!leader) return words.noLeader;
  return leader.mine ? words.ledByYou : words.ledBy.replace("{name}", leader.name);
}

/**
 * A song list card's leaders (cardLeaderView), when the card's rows (as laid out: null for
 * an empty place) still match the answer place by place and title by title -
 * else null, so a card drawn from an older copy shows no leaders rather than
 * wrong ones.
 */
export function matchCardLeaders(service: SongListLeaders, rows: ReadonlyArray<{ title: string } | null>): CardLeaderView | null {
  if (rows.length !== service.places.length) return null;
  if (!service.places.every((place, index) => (rows[index]?.title ?? null) === place.title)) return null;
  return cardLeaderView(service.places.map((place) => place.leader));
}

// ---------------------------------------------------------------------------
// The scheduler's problems (Dashboard: Needs your attention)
// ---------------------------------------------------------------------------

export interface LeadershipProblem {
  anchor: string;
  startsAt: string;
  label: string | null;
  slot: ServiceSlot;
  unled: number;
  conflicts: Array<{ name: string; positions: number[] }>;
  ineligible: Array<{ name: string; positions: number[] }>;
}

/** Services from now until `until` whose leaders need attention. Cancelled services are left out. */
export function leadershipProblems(board: Board, now: number, until: number): LeadershipProblem[] {
  const problems: LeadershipProblem[] = [];
  for (const service of board.services) {
    const start = Date.parse(service.startsAt);
    if (service.status === "cancelled" || start <= now || start > until) continue;
    const { effective, conflicts } = serviceLeaders(board, service);
    const nameOf = (userId: string) => board.people.get(userId)?.name ?? "Someone";
    const ineligible = new Map<string, number[]>();
    for (const place of effective) {
      if (!place.userId || board.people.get(place.userId)?.eligible) continue;
      ineligible.set(place.userId, [...(ineligible.get(place.userId) ?? []), place.position]);
    }
    const unled = effective.filter((place) => !place.userId).length;
    if (unled === 0 && conflicts.length === 0 && ineligible.size === 0) continue;
    problems.push({
      anchor: service.anchor,
      startsAt: service.startsAt,
      label: service.label,
      slot: service.slot,
      unled,
      conflicts: conflicts.map((conflict) => ({ name: nameOf(conflict.userId), positions: conflict.positions })),
      ineligible: [...ineligible].map(([userId, positions]) => ({ name: nameOf(userId), positions })),
    });
  }
  return problems.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/**
 * Each service's leaders by anchor, by position, as the viewer may see them on
 * the Dashboard's Coming up cards: a published service's whole roster, and for
 * one not published yet only the viewer's own part - for a scheduler too (who
 * sees the rest in the planner).
 */
export function publishedRosters(board: Board, viewer: Viewer): Map<string, VisibleLeadership & { names: Array<string | null> }> {
  const rosters = new Map<string, VisibleLeadership & { names: Array<string | null> }>();
  for (const service of board.services) {
    const effective = effectiveLeaders(service.places, service.leadership);
    const visible = visibleLeadership(viewer, service.status, effective);
    if (!visible) continue;
    if (visible.access !== "own" && service.status !== "published") {
      if (visible.mine.length > 0) rosters.set(service.anchor, { access: "own", mine: visible.mine, places: null, names: [] });
      continue;
    }
    const names = (visible.places ?? []).map((place) => (place.userId ? (board.people.get(place.userId)?.name ?? "A song leader") : null));
    rosters.set(service.anchor, { ...visible, names });
  }
  return rosters;
}
