/**
 * Song leading's notifications: what a change to who leads what tells each
 * person it affects. Pure, so every rule is unit tested.
 *
 *   TELL EACH PERSON ABOUT THEIR OWN PART, ONCE PER SAVE.
 *
 *   newly leading       "You're leading songs 2 and 5 at Sunday Evening"
 *   leading other songs "Your songs at Sunday Evening changed"
 *   no longer leading   "You're no longer leading at Sunday Evening"
 *   cancelled/restored  the people leading, in their own words (the general
 *                       cancellation notice leaves them out - one message each)
 *
 * A former leader and a new one are told different things. Songs that only
 * moved change nothing for anyone (the change is by place, not position).
 * Nobody is told about what they did themselves, and a service already under
 * way says nothing. A song's title or key is never in any of it - a draft's
 * songs are not the leader's to see; the Dashboard shows them once published.
 *
 * Every notice carries a dedupe key made of the change and the person, so
 * telling the same change again (a retry) tells nobody twice.
 */

import { notificationsContent } from "@/content/notifications";
import { serviceDay } from "@/lib/availability/format";
import { diffAssignments, leadersIn, positionsLabel, type RosterSnapshot } from "@/lib/leadership/model";
import { serviceTitle } from "@/lib/service-planner/format";
import { serviceAnchor } from "@/lib/site-search";
import type { ServiceSlot } from "@/types/song-list";

import { AUDIENCES, users } from "../audience";
import type { NotifyInput } from "../service";
import { fill } from "./text";

const copy = notificationsContent.events.songLeading;

export interface LeadershipServiceRef {
  date: string;
  slot: ServiceSlot;
  startsAt: string;
  label: string | null;
  /** As the service stands now: whether its songs can be seen yet. */
  status: "not-started" | "draft" | "published" | "cancelled";
}

export interface LeadershipChangeRef {
  id: string;
  cause: "assignment" | "songs" | "status";
  actor: string | null;
  before: RosterSnapshot;
  after: RosterSnapshot;
  status?: { from: string | null; to: string };
}

const words = (service: LeadershipServiceRef) => ({ service: serviceTitle(service), date: serviceDay(service) });
const entityOf = (service: LeadershipServiceRef) => ({ type: "service_leading", id: serviceAnchor(service.date, service.slot) });

/** Positions a person leads in a roster (1-based), in order. */
function positionsOf(roster: RosterSnapshot, userId: string): number[] {
  return roster.places.flatMap((place, index) => (place.userId === userId ? [index + 1] : []));
}

/**
 * What a change says, person by person. Empty when it says nothing to
 * anyone. `now` decides whether the service is still to come.
 */
export function leadershipChangeNotices(input: {
  change: LeadershipChangeRef;
  service: LeadershipServiceRef;
  now: number;
}): NotifyInput[] {
  const { change, service } = input;
  if (Date.parse(service.startsAt) <= input.now) return [];
  const told = (userId: string) => userId !== change.actor;
  const base = (userId: string) => ({
    audience: users(userId),
    actorUserId: change.actor,
    entity: entityOf(service),
    dedupeKey: `leadership:${change.id}:${userId}`,
  });

  if (change.cause === "status" && change.status) {
    const to = change.status.to;
    if (to === "cancelled") {
      return leadersIn(change.before).filter(told).map((userId) => ({
        ...base(userId),
        event: "song_leading.service_cancelled" as const,
        title: fill(copy.cancelled.title, words(service)),
        body: fill(copy.cancelled.body, { ...words(service), before: positionsLabel(positionsOf(change.before, userId)) }),
        payload: { anchor: entityOf(service).id, positions: positionsOf(change.before, userId) },
      }));
    }
    if (change.status.from === "cancelled") {
      return leadersIn(change.after).filter(told).map((userId) => ({
        ...base(userId),
        event: "song_leading.service_restored" as const,
        title: fill(copy.restored.title, words(service)),
        body: fill(copy.restored.body, { ...words(service), songs: positionsLabel(positionsOf(change.after, userId)) }),
        payload: { anchor: entityOf(service).id, positions: positionsOf(change.after, userId) },
      }));
    }
    return [];
  }

  // A cancelled service's leaders are not told of edits to it.
  if (service.status === "cancelled") return [];
  const seeing = service.status === "published" ? copy.published : copy.notPublished;

  return diffAssignments(change.before, change.after)
    .filter((delta) => told(delta.userId))
    .map((delta): NotifyInput => {
      const songs = positionsLabel(delta.positionsAfter);
      const before = positionsLabel(delta.positionsBefore);
      const payload = { anchor: entityOf(service).id, before: delta.positionsBefore, after: delta.positionsAfter };
      if (delta.before.length === 0) {
        return {
          ...base(delta.userId),
          event: "song_leading.assigned",
          title: fill(copy.assigned.title, { ...words(service), songs }),
          body: `${fill(copy.assigned.body, { ...words(service), songs })} ${seeing}`,
          payload,
        };
      }
      if (delta.after.length === 0) {
        return {
          ...base(delta.userId),
          event: "song_leading.removed",
          title: fill(copy.removed.title, words(service)),
          body: fill(copy.removed.body, { ...words(service), before }),
          payload,
        };
      }
      return {
        ...base(delta.userId),
        event: "song_leading.changed",
        title: fill(copy.changed.title, words(service)),
        body: `${fill(copy.changed.body, { ...words(service), songs, before })} ${seeing}`,
        payload,
      };
    });
}

/**
 * For the schedulers: someone assigned to lead songs in a service is now
 * unavailable for it. One per service, however many songs they lead. The
 * person themself is not told (they made the change, or were told of it).
 */
export function leaderUnavailableNotice(input: {
  actorId: string;
  leader: { id: string; name: string };
  service: LeadershipServiceRef;
  positions: readonly number[];
  now: number;
}): NotifyInput | null {
  const { service } = input;
  if (input.positions.length === 0 || service.status === "cancelled" || Date.parse(service.startsAt) <= input.now) return null;
  const values = { ...words(service), name: input.leader.name, songs: positionsLabel(input.positions) };
  return {
    event: "song_leading.leader_unavailable",
    audience: AUDIENCES.planners,
    title: fill(copy.unavailable.title, values),
    body: fill(copy.unavailable.body, values),
    actionUrl: `/service-planner/${serviceAnchor(service.date, service.slot)}`,
    actorUserId: input.actorId,
    except: [input.actorId, input.leader.id],
    // The availability notice's own entity (events/availability.ts), so the two fold into one.
    entity: { type: "availability", id: `${input.leader.id}:${serviceAnchor(service.date, service.slot)}` },
    payload: { anchor: serviceAnchor(service.date, service.slot), leader: input.leader.id, positions: [...input.positions] },
  };
}
