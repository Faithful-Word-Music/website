import "server-only";

import { unstable_cache } from "next/cache";

import { listAccounts } from "@/lib/auth/clerk";
import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { effectiveAvailability } from "@/lib/availability/effective";
import { addDays, churchDate, regularKeyFor, serviceOccurrences } from "@/lib/availability/occurrences";
import { listExceptions, loadRosterRecords } from "@/lib/availability/store";
import { emptySlots, positionalPlaceIds, type StoredPlan } from "@/lib/service-planner/model";
import { listPlans } from "@/lib/service-planner/store";
import { serviceAnchor } from "@/lib/site-search";

import { LEADER_PERMISSION } from "./access";
import { indexBoardExceptions, type Board, type BoardPerson, type BoardService } from "./board";
import { GUEST_LEADER, GUEST_NAME, type Leadership } from "./model";
import { getLeadership, leadershipKey, listLeadership, listServiceChanges, type StoredChange } from "./store";

/**
 * The reads behind song leaders outside the planner: the Dashboard, the song
 * list's signed-in extras, the notifications. What is read here is the
 * scheduler's whole view - every reader passes it through
 * src/lib/leadership/access.ts before anything reaches a browser.
 */

/** Invalidated whenever a service's leaders, songs or status change (src/app/service-planner/actions.ts). */
export const LEADERSHIP_TAG = "leadership";

/** How far ahead the Dashboard and the song list look for leaders. */
export const LEADERSHIP_DAYS = 120;

/**
 * Every service from `from` to `to` with its places and leaders - stored or
 * not yet (a regular service nobody has planned yet has five places, "p1"
 * to "p5"). Only a PUBLISHED service carries its songs.
 */
export async function loadBoardServices(env: ClerkEnv, range: { from: string; to: string }): Promise<BoardService[]> {
  const [plans, leadership] = await Promise.all([listPlans(env, range), listLeadership(env, range)]);
  const byKey = new Map(plans.map((plan) => [leadershipKey(plan), plan]));
  const occurrences = serviceOccurrences(
    range.from,
    range.to,
    plans.map((plan) => ({ date: plan.date, slot: plan.slot, label: plan.label, startsAt: plan.startsAt, cancelled: plan.status === "cancelled" })),
  );

  const services: BoardService[] = occurrences.map((occurrence) => {
    const plan = byKey.get(leadershipKey(occurrence)) ?? null;
    return boardService(occurrence, plan, leadership.get(leadershipKey(occurrence)));
  });
  // Cancelled services are not occurrences any more, but their leaders still need telling.
  for (const plan of plans) {
    if (plan.status !== "cancelled") continue;
    services.push(
      boardService(
        { date: plan.date, slot: plan.slot, startsAt: plan.startsAt, label: plan.label, normalKey: "special" },
        plan,
        leadership.get(leadershipKey(plan)),
      ),
    );
  }
  return services.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

function boardService(
  occurrence: { date: string; slot: BoardService["slot"]; startsAt: string; label?: string | null; normalKey: BoardService["normalKey"] },
  plan: StoredPlan | null,
  leadership: BoardService["leadership"] | undefined,
): BoardService {
  const status = plan ? plan.status : "not-started";
  return {
    anchor: serviceAnchor(occurrence.date, occurrence.slot),
    date: occurrence.date,
    slot: occurrence.slot,
    startsAt: plan?.startsAt ?? occurrence.startsAt,
    label: plan?.label ?? occurrence.label ?? null,
    status,
    normalKey: occurrence.normalKey,
    places: plan ? plan.places : positionalPlaceIds(emptySlots().length),
    // A draft's songs never leave the planner - not even into this cache.
    songs:
      plan && status === "published"
        ? plan.slots.map((song) => (song ? { title: song.title, number: song.number, key: song.key } : null))
        : null,
    leadership: leadership ?? { defaultUserId: null, overrides: {}, revision: 0 },
  };
}

const cachedBoardServices = unstable_cache(loadBoardServices, ["leadership-board"], {
  // Every planner change that touches a service refreshes this tag (refreshPlanner / refreshEverything).
  tags: [LEADERSHIP_TAG],
  revalidate: 3600,
});

/**
 * Everyone who can lead (lead_songs, held on purpose), and anyone else named
 * in `assigned`, with their names and whether they may lead now. An account
 * that is disabled, locked or deleted - or no longer holds lead_songs - is
 * never treated as a valid leader, but stays known by name so the planner can
 * say who it was.
 */
export async function loadLeaderPeople(env: ClerkEnv, assigned: readonly string[] = []): Promise<BoardPerson[]> {
  const records = await loadRosterRecords(env, LEADER_PERMISSION);
  const holders = new Map(records.map((record) => [record.id, record]));
  const ids = [...new Set([...holders.keys(), ...assigned.filter((id) => id.startsWith("user_"))])];
  if (ids.length === 0) return [];
  const accounts = await listAccounts({ userIds: ids, limit: 500, offset: 0 });
  if (!accounts.ok) throw new Error("Could not read the song leaders' accounts.");
  const byId = new Map(accounts.value.accounts.map((account) => [account.id, account]));

  return ids
    .map((id) => {
      const record = holders.get(id);
      const account = byId.get(id);
      const first = record?.preferredName || account?.firstName || "";
      const name = [first, account?.lastName ?? ""].filter(Boolean).join(" ") || account?.fullName || "A former song leader";
      return {
        id,
        name,
        eligible: Boolean(record && account && !account.banned && !account.locked),
        normal: record?.normal ?? [],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The whole board from today (and the day before, so a service under way is
 * still there) to LEADERSHIP_DAYS ahead. Services and people are cached
 * between requests; availability exceptions are read fresh.
 */
export async function loadBoard(env: ClerkEnv, now: number = Date.now(), options: { exceptions?: boolean } = {}): Promise<Board> {
  const today = churchDate(now);
  const range = { from: addDays(today, -1), to: addDays(today, LEADERSHIP_DAYS) };
  const services = await cachedBoardServices(env, range);
  const assigned = [
    ...new Set(
      services.flatMap((service) => [
        ...(service.leadership.defaultUserId ? [service.leadership.defaultUserId] : []),
        ...Object.values(service.leadership.overrides).flatMap((override) => (override.kind === "assigned" ? [override.userId] : [])),
      ]),
    ),
  ].sort();
  // The song list needs no one's availability: it is not read for it (one query fewer per page).
  const [people, exceptions] = await Promise.all([
    // Read fresh, never inside unstable_cache: Clerk's client reads the request's headers, which a
    // cached function may not (it then fails, and no leaders show at all). The services above are
    // cached; names cost one Clerk call per page, as the availability board's do.
    loadLeaderPeople(env, assigned),
    options.exceptions === false ? Promise.resolve([]) : listExceptions(env, range.from, range.to),
  ]);
  return {
    services,
    // A guest leads under the name "a guest", and is always a valid choice (GUEST_LEADER).
    people: new Map([...people, { id: GUEST_LEADER, name: GUEST_NAME, eligible: true, normal: [] }].map((person) => [person.id, person])),
    exceptions: indexBoardExceptions(exceptions),
  };
}

/** Someone the planner can choose, or who is already chosen, with how they stand for this service. */
export interface LeaderOption {
  id: string;
  name: string;
  /** May be chosen: holds lead_songs and has a usable account. */
  eligible: boolean;
  /** Available for this service by the availability rules; null when unknown. */
  available: boolean | null;
}

export interface ServiceLeadersData {
  leadership: Leadership;
  people: LeaderOption[];
  changes: Array<{ at: string; actor: string | null; cause: StoredChange["cause"] }>;
}

/**
 * The workspace's song leaders for one service: who leads what, everyone
 * who could, each with their availability for it, and what changed. Read
 * fresh - this is where they are chosen. Null when it cannot be read (the
 * workspace then shows the songs and says the leaders are unavailable).
 */
export async function loadServiceLeaders(
  env: ClerkEnv,
  service: { date: string; slot: BoardService["slot"]; kind: "regular" | "special" },
): Promise<ServiceLeadersData | null> {
  try {
    const leadership = await getLeadership(env, service);
    const named = [
      ...(leadership.defaultUserId ? [leadership.defaultUserId] : []),
      ...Object.values(leadership.overrides).flatMap((override) => (override.kind === "assigned" ? [override.userId] : [])),
    ];
    const [people, exceptions, changes] = await Promise.all([
      loadLeaderPeople(env, named),
      listExceptions(env, service.date, service.date),
      listServiceChanges(env, service),
    ]);
    const normalKey = service.kind === "special" ? "special" : (regularKeyFor(service.date, service.slot) ?? "special");
    const byUser = new Map(exceptions.filter((row) => row.slot === service.slot).map((row) => [row.userId, row.status]));
    return {
      leadership,
      people: people.map((person) => ({
        id: person.id,
        name: person.name,
        eligible: person.eligible,
        available: person.eligible ? effectiveAvailability(person.normal, { normalKey }, byUser.get(person.id) ?? null).effective : null,
      })).concat([{ id: GUEST_LEADER, name: "Guest", eligible: true, available: null }]),
      changes: changes.map((change) => ({ at: change.at, actor: change.actor, cause: change.cause })),
    };
  } catch (error) {
    console.error("[leadership] Could not load a service's leaders:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}
