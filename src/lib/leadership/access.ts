/**
 * Who may see which song leaders - THE ONE PLACE it is decided. Every reader
 * (the Dashboard, the song list's signed-in extras, the notifications) asks
 * this module and is handed only what it may show. Pure, so it is unit tested.
 *
 *   manage     manage_service_plans: everything, drafts included - they plan it.
 *   roster     a PUBLISHED service, for someone with view_service_plans: who
 *              leads every song, by name, beside the published songs.
 *   own        anyone else signed in, and every draft: only the places they
 *              lead themself. Before publication that is all a leader is
 *              told - not the songs, keys or inserts, not who else leads.
 *
 * A cancelled service shows nothing outside the planner. Redaction happens on
 * the server, before anything is serialized: what a browser is never sent it
 * can never reveal.
 */

import type { Permission } from "@/lib/auth/permissions";

import type { EffectivePlace } from "./model";

export const SCHEDULER_PERMISSION = "manage_service_plans" satisfies Permission;
export const LEADER_PERMISSION = "lead_songs" satisfies Permission;
export const ROSTER_PERMISSION = "view_service_plans" satisfies Permission;

export type LeadershipAccess = "manage" | "roster" | "own";

export type ServiceState = "not-started" | "draft" | "published" | "cancelled";

export function leadershipAccess(
  viewer: { can(permission: Permission): boolean },
  status: ServiceState,
): LeadershipAccess | null {
  if (viewer.can(SCHEDULER_PERMISSION)) return "manage";
  if (status === "cancelled") return null;
  if (status === "published" && viewer.can(ROSTER_PERMISSION)) return "roster";
  return "own";
}

/** What one viewer is shown of a service's leaders. */
export interface VisibleLeadership {
  access: LeadershipAccess;
  /** The positions (1-based) the viewer leads. */
  mine: number[];
  /** Every place, with its leader's ID - only for "manage" and "roster". */
  places: Array<{ position: number; userId: string | null }> | null;
}

/**
 * A service's leaders as one viewer may see them, or null when they may see
 * nothing (a cancelled service; or "own" with nothing of theirs in it).
 */
export function visibleLeadership(
  viewer: { userId: string; can(permission: Permission): boolean },
  status: ServiceState,
  effective: readonly EffectivePlace[],
): VisibleLeadership | null {
  const access = leadershipAccess(viewer, status);
  if (!access) return null;
  const mine = effective.filter((place) => place.userId === viewer.userId).map((place) => place.position);
  if (access === "own") return mine.length > 0 ? { access, mine, places: null } : null;
  return { access, mine, places: effective.map((place) => ({ position: place.position, userId: place.userId })) };
}
