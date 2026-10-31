/**
 * Who leads the singing: the model. Pure - no server-only import, no clock -
 * so the planner's editor, the server and the tests all use the same rules.
 *
 * A service may have a DEFAULT leader, who leads every song unless a song
 * says otherwise. A song (a place - src/lib/service-planner/places.ts) may
 * say otherwise with an OVERRIDE:
 *
 *   assigned     this person leads it
 *   unassigned   no one is set to lead it, whatever the default
 *   (none)       it follows the default - or no one, when there is no default
 *
 * Nothing about any day, number of songs, person or "the last song" is
 * assumed: a Sunday may be one default and one override, a Wednesday five
 * overrides and no default. Overrides belong to places, not songs, so moving
 * or replacing a song never moves its leader; removing a place removes its
 * override.
 */

export type LeaderOverride = { kind: "assigned"; userId: string } | { kind: "unassigned" };

/**
 * A guest song leader: someone from outside the church's accounts. Stored as a
 * leader whose ID is this word (as a default or an assigned song), so no table
 * changes for it. A guest has no account: they are never notified or emailed,
 * have no availability, and are never "no longer eligible".
 */
export const GUEST_LEADER = "guest";

/** How a guest is named on the cards ("Led by a guest"). A printout says "Guest". */
export const GUEST_NAME = "a guest";

/** A service's song leaders as stored. */
export interface Leadership {
  defaultUserId: string | null;
  /** By place ID. A place with none follows the default. */
  overrides: Record<string, LeaderOverride>;
  /** Bumped on every change, so two people assigning at once never overwrite each other. 0: never set. */
  revision: number;
}

export const NO_LEADERSHIP: Leadership = { defaultUserId: null, overrides: {}, revision: 0 };

export type LeaderSource = "assigned" | "default" | "unassigned" | "none";

/** Who leads one place, all things considered. */
export interface EffectivePlace {
  placeId: string;
  /** 1-based, as people count songs. */
  position: number;
  userId: string | null;
  /** Why: an override, the default, an override saying no one, or no default to follow. */
  source: LeaderSource;
}

/** Who leads each place, in order. Overrides for places that no longer exist are ignored. */
export function effectiveLeaders(places: readonly string[], leadership: Pick<Leadership, "defaultUserId" | "overrides">): EffectivePlace[] {
  return places.map((placeId, index) => {
    const override = Object.hasOwn(leadership.overrides, placeId) ? leadership.overrides[placeId] : undefined;
    if (override?.kind === "assigned") return { placeId, position: index + 1, userId: override.userId, source: "assigned" };
    if (override?.kind === "unassigned") return { placeId, position: index + 1, userId: null, source: "unassigned" };
    return leadership.defaultUserId
      ? { placeId, position: index + 1, userId: leadership.defaultUserId, source: "default" }
      : { placeId, position: index + 1, userId: null, source: "none" };
  });
}

/** The overrides for places that exist, and the places whose override is dropped because they do not. */
export function pruneOverrides(
  overrides: Record<string, LeaderOverride>,
  places: readonly string[],
): { overrides: Record<string, LeaderOverride>; dropped: string[] } {
  const live = new Set(places);
  const kept: Record<string, LeaderOverride> = {};
  const dropped: string[] = [];
  for (const [placeId, override] of Object.entries(overrides)) {
    if (live.has(placeId)) kept[placeId] = override;
    else dropped.push(placeId);
  }
  return { overrides: kept, dropped };
}

/** Whether two leaderships say the same thing (the revision aside). */
export function sameLeadership(
  a: Pick<Leadership, "defaultUserId" | "overrides">,
  b: Pick<Leadership, "defaultUserId" | "overrides">,
): boolean {
  if ((a.defaultUserId ?? null) !== (b.defaultUserId ?? null)) return false;
  const keys = new Set([...Object.keys(a.overrides), ...Object.keys(b.overrides)]);
  for (const key of keys) {
    const x = a.overrides[key];
    const y = b.overrides[key];
    if (!x || !y || x.kind !== y.kind) return false;
    if (x.kind === "assigned" && y.kind === "assigned" && x.userId !== y.userId) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Changes - what a save did to who leads what, person by person
// ---------------------------------------------------------------------------

/** Who led which place, at one moment: what a change is recorded as. */
export interface RosterSnapshot {
  defaultUserId: string | null;
  places: Array<{ id: string; userId: string | null }>;
}

export function snapshot(places: readonly string[], leadership: Pick<Leadership, "defaultUserId" | "overrides">): RosterSnapshot {
  return {
    defaultUserId: leadership.defaultUserId,
    places: effectiveLeaders(places, leadership).map((place) => ({ id: place.placeId, userId: place.userId })),
  };
}

/** One person's part in a service before and after a change. */
export interface AssignmentDelta {
  userId: string;
  /** The places (IDs) they led before, and lead now. */
  before: string[];
  after: string[];
  /** Where those places stand now (1-based); for places that are gone, where they stood. */
  positionsBefore: number[];
  positionsAfter: number[];
}

/**
 * Everyone whose part changed, by place - not by position: a song moved up
 * or down is still the song they lead, and changes nothing for anyone.
 */
export function diffAssignments(before: RosterSnapshot, after: RosterSnapshot): AssignmentDelta[] {
  const byUser = (roster: RosterSnapshot) => {
    const map = new Map<string, Array<{ id: string; position: number }>>();
    roster.places.forEach((place, index) => {
      if (!place.userId) return;
      map.set(place.userId, [...(map.get(place.userId) ?? []), { id: place.id, position: index + 1 }]);
    });
    return map;
  };
  const was = byUser(before);
  const now = byUser(after);
  const deltas: AssignmentDelta[] = [];
  for (const userId of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(userId) ?? [];
    const b = now.get(userId) ?? [];
    const same = a.length === b.length && a.every((place) => b.some((other) => other.id === place.id));
    if (same) continue;
    deltas.push({
      userId,
      before: a.map((place) => place.id),
      after: b.map((place) => place.id),
      positionsBefore: a.map((place) => place.position),
      positionsAfter: b.map((place) => place.position),
    });
  }
  return deltas.sort((x, y) => x.userId.localeCompare(y.userId));
}

/** Everyone who leads anything in a roster. */
export function leadersIn(roster: RosterSnapshot): string[] {
  return [...new Set(roster.places.flatMap((place) => (place.userId ? [place.userId] : [])))];
}

// ---------------------------------------------------------------------------
// Problems - who is not there, who can no longer lead, what has no leader
// ---------------------------------------------------------------------------

/** One person assigned to songs in a service they are not available for. */
export interface LeaderConflict {
  userId: string;
  positions: number[];
  placeIds: string[];
}

/**
 * Leaders who are unavailable for the service, ONE per person however many
 * songs they lead. `available` answers from the availability rules
 * (src/lib/availability/effective.ts): true, false, or null when unknown -
 * which is never reported as a conflict.
 */
export function leaderConflicts(
  effective: readonly EffectivePlace[],
  available: (userId: string) => boolean | null,
): LeaderConflict[] {
  const byUser = new Map<string, LeaderConflict>();
  for (const place of effective) {
    if (!place.userId || available(place.userId) !== false) continue;
    const conflict = byUser.get(place.userId) ?? { userId: place.userId, positions: [], placeIds: [] };
    conflict.positions.push(place.position);
    conflict.placeIds.push(place.placeId);
    byUser.set(place.userId, conflict);
  }
  return [...byUser.values()];
}

export interface LeadershipSummary {
  places: number;
  /** Places someone leads. */
  led: number;
  /** Places no one leads (no default, or an override saying no one). */
  unled: number;
  /** People unavailable for the service, however many songs each leads. */
  conflicts: number;
  /** People assigned who can no longer lead (account disabled or deleted, or no longer allowed). */
  ineligible: number;
}

export function summarize(
  effective: readonly EffectivePlace[],
  available: (userId: string) => boolean | null,
  eligible: (userId: string) => boolean,
): LeadershipSummary {
  const leaders = new Set(effective.flatMap((place) => (place.userId ? [place.userId] : [])));
  return {
    places: effective.length,
    led: effective.filter((place) => place.userId).length,
    unled: effective.filter((place) => !place.userId).length,
    conflicts: leaderConflicts(effective, available).length,
    ineligible: [...leaders].filter((userId) => !eligible(userId)).length,
  };
}

// ---------------------------------------------------------------------------
// Editing - what the planner's controls do
// ---------------------------------------------------------------------------

/** What a place's control is set to: follow the default, no one, or a person. */
export type PlaceChoice = { kind: "inherit" } | { kind: "unassigned" } | { kind: "assigned"; userId: string };

export function placeChoice(leadership: Pick<Leadership, "overrides">, placeId: string): PlaceChoice {
  const override = Object.hasOwn(leadership.overrides, placeId) ? leadership.overrides[placeId] : undefined;
  return override ?? { kind: "inherit" };
}

export function withDefault<T extends Pick<Leadership, "defaultUserId" | "overrides">>(leadership: T, userId: string | null): T {
  return { ...leadership, defaultUserId: userId };
}

export function withPlaceChoice<T extends Pick<Leadership, "defaultUserId" | "overrides">>(
  leadership: T,
  placeId: string,
  choice: PlaceChoice,
): T {
  const overrides = { ...leadership.overrides };
  if (choice.kind === "inherit") delete overrides[placeId];
  else overrides[placeId] = choice.kind === "assigned" ? { kind: "assigned", userId: choice.userId } : { kind: "unassigned" };
  return { ...leadership, overrides };
}

/** Every song back to following the default. */
export function withoutOverrides<T extends Pick<Leadership, "defaultUserId" | "overrides">>(leadership: T): T {
  return { ...leadership, overrides: {} };
}

/** "song 3", "songs 2 and 5", "songs 1, 2 and 4". */
export function positionsLabel(positions: readonly number[]): string {
  const sorted = [...positions].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return `song ${sorted[0]}`;
  return `songs ${sorted.slice(0, -1).join(", ")} and ${sorted.at(-1)}`;
}
