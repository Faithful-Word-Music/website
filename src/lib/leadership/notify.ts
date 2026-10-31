import "server-only";

import { after } from "next/server";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import type { ServiceAvailability } from "@/lib/auth/profile-options";
import { effectiveAvailability, type ExceptionStatus } from "@/lib/availability/effective";
import { findOccurrence, occurrenceKey, serviceOccurrences } from "@/lib/availability/occurrences";
import { listExceptions } from "@/lib/availability/store";
import { drainEmail } from "@/lib/notifications/email-store";
import { leaderUnavailableNotice, leadershipChangeNotices, type LeadershipServiceRef } from "@/lib/notifications/events/leadership";
import { notifyBestEffort } from "@/lib/notifications/send";
import { notify } from "@/lib/notifications/service";
import { notificationDeps } from "@/lib/notifications/store";
import { getPlan } from "@/lib/service-planner/store";

import { loadBoardServices, loadLeaderPeople } from "./load";
import { effectiveLeaders } from "./model";
import { getChange, listUnnotifiedChanges, markChangeNotified, type StoredChange } from "./store";

/**
 * Telling people about a change to who leads what - durably.
 *
 *   1. The change is recorded (service_leadership_changes) in the SAME
 *      transaction as the change itself: a change saved is a change owed.
 *   2. Straight after the response, its notices are sent (tellChange), and
 *      only once every one of them is recorded is the change marked told.
 *   3. A change never marked - the server stopped, a notification could not
 *      be recorded - is told by the next drain (drainChanges): after any
 *      later save, and every day from the notifications job.
 *
 * Telling the same change twice tells nobody twice: each notice carries a
 * dedupe key of the change and the person (events/leadership.ts).
 */

async function serviceRef(env: ClerkEnv, change: Pick<StoredChange, "date" | "slot">): Promise<LeadershipServiceRef | null> {
  const plan = await getPlan(env, change.date, change.slot);
  if (plan) return { date: plan.date, slot: plan.slot, startsAt: plan.startsAt, label: plan.label, status: plan.status };
  const occurrence = findOccurrence(serviceOccurrences(change.date, change.date), change.date, change.slot);
  return occurrence
    ? { date: occurrence.date, slot: occurrence.slot, startsAt: occurrence.startsAt, label: occurrence.label ?? null, status: "not-started" }
    : null;
}

/** Tells everyone one change affects. True when it is told (now, or before). */
export async function tellChange(env: ClerkEnv, changeId: string, now: number = Date.now()): Promise<boolean> {
  const change = await getChange(env, changeId);
  if (!change) return false;
  if (change.notifiedAt) return true;

  const service = await serviceRef(env, change);
  const notices = service
    ? leadershipChangeNotices({
        change: {
          id: change.id,
          cause: change.cause,
          actor: change.actor,
          before: change.details.before,
          after: change.details.after,
          status: change.details.status,
        },
        service,
        now,
      })
    : [];

  // Told only to people who may lead now - read fresh, never from a cache: someone whose account
  // was disabled or deleted, or who no longer holds lead_songs, is not told (or emailed). If the
  // accounts cannot be read, nobody is told yet and the next drain tries again.
  const recipients = [...new Set(notices.flatMap((notice) => (notice.audience.kind === "users" ? notice.audience.userIds : [])))];
  const eligible = recipients.length > 0 ? new Set((await loadLeaderPeople(env, recipients)).filter((person) => person.eligible).map((person) => person.id)) : new Set<string>();
  const deliverable = notices.filter((notice) => notice.audience.kind === "users" && notice.audience.userIds.every((id) => eligible.has(id)));

  const deps = notificationDeps(env);
  let complete = true;
  for (const notice of deliverable) {
    try {
      const result = await notify(notice, deps);
      // Refused (a category retired, say): telling it again would be refused again.
      if (!result.ok) console.warn(`[leadership] ${notice.event} was not sent: ${result.problem}.`);
    } catch (error) {
      complete = false;
      console.error(`[leadership] ${notice.event} could not be sent:`, error instanceof Error ? error.message : "unknown error");
    }
  }
  if (!complete) return false;
  await markChangeNotified(env, change.id);
  return true;
}

/**
 * Tells, after the response, what a change did - and, while the database is
 * awake anyway, whatever earlier changes and emails are still owed. A failure
 * is logged; the next drain tries again.
 */
export function tellChangeSoon(env: ClerkEnv, changeId: string | null): void {
  const task = async () => {
    try {
      if (changeId) await tellChange(env, changeId);
    } catch (error) {
      console.error("[leadership] A change could not be told:", error instanceof Error ? error.message : "unknown error");
    }
    await drainChanges(env);
    await drainEmail(env);
  };
  try {
    after(task);
  } catch {
    void task();
  }
}

/** Tells every change still owed that is at least `olderThanMinutes` old. Never throws. */
export async function drainChanges(env: ClerkEnv, olderThanMinutes = 2): Promise<{ told: number; pending: number }> {
  try {
    const pending = await listUnnotifiedChanges(env, olderThanMinutes);
    let told = 0;
    for (const change of pending) if (await tellChange(env, change.id)) told += 1;
    return { told, pending: pending.length - told };
  } catch (error) {
    console.error("[leadership] Changes still owed could not be told:", error instanceof Error ? error.message : "unknown error");
    return { told: 0, pending: -1 };
  }
}

/**
 * After someone's availability changed: tells the schedulers about each
 * service from `from` to `to` they lead songs in and were available for, but
 * are not any more - one notice per service. Never throws, and never stops
 * the availability change (that is saved already).
 *
 * `before` is how they stood before the change (their normal services, and
 * their exceptions by occurrenceKey "date|slot"); how they stand now is read
 * fresh.
 */
export async function warnLeaderUnavailable(
  env: ClerkEnv,
  input: {
    actorId: string;
    /** Their name is only looked up when there is something to say. */
    person: { id: string; name: () => Promise<string> };
    range: { from: string; to: string };
    before: { normal: readonly ServiceAvailability[]; exceptions: ReadonlyMap<string, ExceptionStatus> };
    normalAfter: readonly ServiceAvailability[];
  },
): Promise<void> {
  try {
    const now = Date.now();
    const services = (await loadBoardServices(env, input.range)).filter(
      (service) =>
        service.status !== "cancelled" &&
        Date.parse(service.startsAt) > now &&
        effectiveLeaders(service.places, service.leadership).some((place) => place.userId === input.person.id),
    );
    if (services.length === 0) return;
    let name: string | null = null;

    const fresh = new Map(
      (await listExceptions(env, input.range.from, input.range.to))
        .filter((row) => row.userId === input.person.id)
        .map((row) => [occurrenceKey(row.date, row.slot), row.status] as const),
    );
    for (const service of services) {
      const key = occurrenceKey(service.date, service.slot);
      const was = effectiveAvailability(input.before.normal, service, input.before.exceptions.get(key) ?? null).effective;
      const is = effectiveAvailability(input.normalAfter, service, fresh.get(key) ?? null).effective;
      if (!was || is) continue;
      const positions = effectiveLeaders(service.places, service.leadership)
        .filter((place) => place.userId === input.person.id)
        .map((place) => place.position);
      name ??= await input.person.name();
      await notifyBestEffort(
        env,
        leaderUnavailableNotice({
          actorId: input.actorId,
          leader: { id: input.person.id, name },
          service: { date: service.date, slot: service.slot, startsAt: service.startsAt, label: service.label, status: service.status },
          positions,
          now,
        }),
      );
    }
  } catch (error) {
    console.error("[leadership] Could not check a leader's assignments:", error instanceof Error ? error.message : "unknown error");
  }
}
