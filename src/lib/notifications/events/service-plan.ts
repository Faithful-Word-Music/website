/**
 * The Service Planner's notifications: what each says, who hears it, and -
 * most of all - when there is nothing worth saying.
 *
 *   NOTIFY ABOUT WHAT PEOPLE MUST PREPARE, NOT ABOUT EDITING.
 *
 *   published              one notification per publication, however many
 *                          services were published together
 *   a published plan       only when a song was added, removed or replaced, a
 *   was saved              key changed, or the service's time moved. Songs put
 *                          in a different order, a save that changed nothing
 *                          and every save of a draft are silent
 *   returned to draft      people are told: the list they were given is gone
 *   the week's insert      silent, unless it returned published services to
 *   changed                draft - then ONE notification for all of them
 *   cancelled / restored   told to everyone who plays or sings, not only those
 *                          who read the song list
 *
 * A service already under way or over is history: nothing about it notifies.
 * Nobody is told about what they did themselves.
 *
 * Each builder returns what to hand notify(), or null for "say nothing". The
 * planner's actions pass the result to notifyBestEffort() (send.ts).
 *
 * Pure - no server-only import - so every rule here is unit tested.
 */

import { notificationsContent } from "@/content/notifications";
import { serviceDay } from "@/lib/availability/format";
import { plural } from "@/lib/plural";
import { serviceTitle } from "@/lib/service-planner/format";
import type { PlanStatus, SongChange } from "@/lib/service-planner/model";
import { formatChurchTime } from "@/lib/service-time";
import { serviceAnchor } from "@/lib/site-search";
import type { ServiceSlot } from "@/types/song-list";

import { AUDIENCES, anyOf } from "../audience";
import type { NotifyInput } from "../service";
import { fill, listOf } from "./text";

const copy = notificationsContent.events.servicePlan;

/** As much of a service as a notification needs. A stored plan will do. */
export interface ServiceRef {
  date: string;
  slot: ServiceSlot;
  startsAt: string;
  label: string | null;
}

/** How many services a publication names before it counts them instead. */
const NAMED_SERVICES = 3;

const anchorOf = (service: ServiceRef) => serviceAnchor(service.date, service.slot);
const linkTo = (service: ServiceRef) => `/song-list#${anchorOf(service)}`;
const words = (service: ServiceRef) => ({ service: serviceTitle(service), date: serviceDay(service) });
const upcoming = (service: ServiceRef, now: number) => Date.parse(service.startsAt) > now;
const entityOf = (service: ServiceRef) => ({ type: "service", id: anchorOf(service) });
const brief = (service: ServiceRef) => ({ anchor: anchorOf(service), startsAt: service.startsAt, label: service.label });

/**
 * The changes to a service's songs that alter what someone prepares: every
 * one except a song merely standing in a different place.
 */
export function preparationChanges(changes: readonly SongChange[]): SongChange[] {
  return changes.filter((change) => change.type !== "moved");
}

/** One publication: a service, or several published together. Only those still to come are announced. */
export function servicePlanPublished(input: {
  actorId: string;
  publicationId: string;
  services: readonly ServiceRef[];
  now: number;
}): NotifyInput | null {
  const services = input.services.filter((service) => upcoming(service, input.now));
  if (services.length === 0) return null;

  const [first] = services;
  const text =
    services.length === 1
      ? { title: fill(copy.publishedOne.title, words(first)), body: fill(copy.publishedOne.body, words(first)) }
      : {
          title: copy.publishedMany.title,
          body:
            services.length <= NAMED_SERVICES
              ? fill(copy.publishedMany.body, { services: listOf(services.map(serviceTitle), copy.and) })
              : fill(copy.publishedMany.bodyCount, { count: services.length }),
        };
  return {
    event: "service_plan.published",
    audience: AUDIENCES.servicePlanViewers,
    ...text,
    actionUrl: services.length === 1 ? linkTo(first) : undefined,
    actorUserId: input.actorId,
    except: [input.actorId],
    entity: { type: "service_publication", id: input.publicationId },
    payload: { services: services.map(brief) },
  };
}

/** One sentence for one change, or null when it takes more than one to say. */
function changeSentence(changes: readonly SongChange[], service: ServiceRef, timeChanged: boolean): string | null {
  const removed = changes.filter((change) => change.type === "removed");
  const added = changes.filter((change) => change.type === "added");
  if (!timeChanged && changes.length === 2 && removed.length === 1 && added.length === 1) {
    return fill(copy.updated.replaced, { removed: removed[0].title, added: added[0].title });
  }
  if (changes.length + Number(timeChanged) !== 1) return null;
  if (timeChanged) return fill(copy.updated.time, { time: formatChurchTime(service.startsAt) });
  const [change] = changes;
  if (change.type === "added") return fill(copy.updated.added, { song: change.title });
  if (change.type === "removed") return fill(copy.updated.removed, { song: change.title });
  if (change.type === "key") {
    return change.to ? fill(copy.updated.key, { song: change.title, key: change.to }) : fill(copy.updated.keyCleared, { song: change.title });
  }
  return null;
}

/**
 * A PUBLISHED service was saved. `changes` is what diffSlots() found;
 * `startsAtBefore` is when it started before the save.
 */
export function servicePlanUpdated(input: {
  actorId: string;
  service: ServiceRef;
  changes: readonly SongChange[];
  startsAtBefore: string;
  now: number;
}): NotifyInput | null {
  const { service } = input;
  if (!upcoming(service, input.now)) return null;
  const changes = preparationChanges(input.changes);
  const timeChanged = Date.parse(input.startsAtBefore) !== Date.parse(service.startsAt);
  if (changes.length === 0 && !timeChanged) return null;

  const body = (change: string) => fill(copy.updated.body, { date: serviceDay(service), change });
  return {
    event: "service_plan.updated",
    audience: AUDIENCES.servicePlanViewers,
    title: fill(copy.updated.title, words(service)),
    body: body(changeSentence(changes, service, timeChanged) ?? copy.updated.several),
    // A second save soon after is "several changes", whatever each one was.
    whenCoalesced: { body: body(copy.updated.several) },
    actionUrl: linkTo(service),
    actorUserId: input.actorId,
    except: [input.actorId],
    entity: entityOf(service),
    payload: { changes, timeChanged },
  };
}

/**
 * A service was saved (and perhaps published with it). What that means for
 * the people who prepare from it:
 *
 *   it was already published   -> what changed, if it changes their preparation
 *   it has just been published -> the publication
 *   it is a draft              -> nothing, however much was edited
 */
export function servicePlanSaved(input: {
  actorId: string;
  /** How it stood before this save; null when it was not stored yet. */
  statusBefore: PlanStatus | null;
  /** Its start before this save. */
  startsAtBefore: string;
  /** The publication, when this save published it too. */
  publicationId: string | null;
  service: ServiceRef;
  changes: readonly SongChange[];
  now: number;
}): NotifyInput | null {
  const { actorId, service, now } = input;
  if (input.statusBefore === "published") {
    return servicePlanUpdated({ actorId, service, changes: input.changes, startsAtBefore: input.startsAtBefore, now });
  }
  if (input.publicationId) return servicePlanPublished({ actorId, publicationId: input.publicationId, services: [service], now });
  return null;
}

/**
 * A service's status was changed other than by publishing it:
 *
 *   published -> draft       withdrawn: the song list people had is gone
 *   anything  -> cancelled   cancelled
 *   cancelled -> draft       restored (as a draft: its songs are not published)
 *   draft -> draft, or cancelled again: nothing happened
 */
export function servicePlanStatusChanged(input: {
  actorId: string;
  /** How it stood before; null when it was not stored yet. */
  before: PlanStatus | null;
  after: PlanStatus;
  service: ServiceRef;
  now: number;
}): NotifyInput | null {
  const { before, after } = input;
  const told = { actorId: input.actorId, service: input.service, now: input.now };
  if (before === after) return null;
  if (after === "cancelled") return servicePlanCancelled(told);
  if (before === "cancelled") return servicePlanRestored(told);
  return before === "published" && after === "draft" ? servicePlanWithdrawn(told) : null;
}

/** A published service was returned to draft by hand: it has left the song list. */
export function servicePlanWithdrawn(input: { actorId: string; service: ServiceRef; now: number }): NotifyInput | null {
  const { service } = input;
  if (!upcoming(service, input.now)) return null;
  return {
    event: "service_plan.withdrawn",
    audience: AUDIENCES.servicePlanViewers,
    title: fill(copy.withdrawn.title, words(service)),
    body: fill(copy.withdrawn.body, words(service)),
    actionUrl: linkTo(service),
    actorUserId: input.actorId,
    except: [input.actorId],
    entity: entityOf(service),
  };
}

/**
 * The week's insert changed (or was put back), and that returned these
 * published services to draft. None returned - only drafts were brought up
 * to date - is nothing to tell anyone. However many, it is one notification.
 */
export function servicePlansWithdrawnByInsert(input: {
  actorId: string;
  weekStart: string;
  services: readonly ServiceRef[];
  now: number;
}): NotifyInput | null {
  const services = input.services.filter((service) => upcoming(service, input.now));
  if (services.length === 0) return null;

  const [first] = services;
  const one = services.length === 1;
  return {
    event: "service_plan.withdrawn",
    audience: AUDIENCES.servicePlanViewers,
    title: one ? fill(copy.withdrawn.title, words(first)) : copy.withdrawn.manyTitle,
    body: one ? fill(copy.withdrawn.insertBody, words(first)) : plural(copy.withdrawn.manyBody, services.length),
    actionUrl: one ? linkTo(first) : undefined,
    actorUserId: input.actorId,
    except: [input.actorId],
    entity: one ? entityOf(first) : { type: "service_week", id: input.weekStart },
    payload: { weekStart: input.weekStart, services: services.map(brief) },
  };
}

/** Everyone who would have come to play or sing, as well as those who read the song list. */
const WHOLE_TEAM = anyOf(AUDIENCES.servicePlanViewers, AUDIENCES.musicTeam);

/** A service still to come was cancelled. */
export function servicePlanCancelled(input: { actorId: string; service: ServiceRef; now: number }): NotifyInput | null {
  const { service } = input;
  if (!upcoming(service, input.now)) return null;
  return {
    event: "service_plan.cancelled",
    audience: WHOLE_TEAM,
    title: fill(copy.cancelled.title, words(service)),
    body: fill(copy.cancelled.body, words(service)),
    actionUrl: "/availability",
    actorUserId: input.actorId,
    except: [input.actorId],
    entity: entityOf(service),
  };
}

/** A cancelled service still to come was restored - as a draft, so its songs are not published. */
export function servicePlanRestored(input: { actorId: string; service: ServiceRef; now: number }): NotifyInput | null {
  const { service } = input;
  if (!upcoming(service, input.now)) return null;
  return {
    event: "service_plan.restored",
    audience: WHOLE_TEAM,
    title: fill(copy.restored.title, words(service)),
    body: fill(copy.restored.body, words(service)),
    actionUrl: "/availability",
    actorUserId: input.actorId,
    except: [input.actorId],
    entity: entityOf(service),
  };
}
