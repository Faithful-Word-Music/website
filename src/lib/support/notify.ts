import "server-only";

import { after } from "next/server";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { drainEmail } from "@/lib/notifications/email-store";
import { currentAudience, supportAcknowledgment, supportNotice } from "@/lib/notifications/events/support";
import { notify, type NotifyInput } from "@/lib/notifications/service";
import { notificationDeps } from "@/lib/notifications/store";

import { getEvent, getRequestById, listPendingEvents, markEventNotified } from "./store";

/**
 * Telling people about support requests - durably, the way song leading does
 * (src/lib/leadership/notify.ts), with no queue of its own:
 *
 *   1. Every change that someone should hear about is a support_events row
 *      with `notify`, written in the SAME transaction as the change.
 *   2. Straight after the response it is told (tellSupportEvent) through
 *      notify(), which writes the notification, the push and the email
 *      outbox row together, and the event is then marked notified_at.
 *   3. One never marked - the server stopped, the database was briefly
 *      away - is told by the next drain: after any later support change, and
 *      from the daily /api/cron/notifications job.
 *
 * The notice's dedupe key is the event's ID, so telling one twice tells
 * nobody twice. A new request's event also acknowledges it to its submitter
 * by email (supportAcknowledgment), under its own dedupe key. A failure here
 * never touches the request: it is saved already.
 */

/** Tells everyone one event concerns. True when it is told (now, or before) or there is nothing to tell. */
export async function tellSupportEvent(env: ClerkEnv, eventId: string): Promise<boolean> {
  const event = await getEvent(env, eventId);
  if (!event) return false;
  if (!event.notify || event.notifiedAt) return true;
  const request = await getRequestById(env, event.requestId);
  const deps = notificationDeps(env);
  // The managers' notice, and - for a new request only - the submitter's acknowledgment.
  const built = request ? [supportNotice({ event, request }), supportAcknowledgment({ event, request })] : [];
  const wanted = built.filter((notice): notice is NotifyInput => notice !== null);
  // Who may hear each is read again now, fresh from the database (events/support.ts).
  const directory = wanted.length > 0 && request ? await deps.loadDirectory() : null;
  for (const candidate of wanted) {
    const notice = directory && request ? currentAudience(candidate, directory, request) : null;
    if (!notice) continue;
    try {
      const result = await notify(notice, deps);
      // Refused (a category retired, say): telling it again would be refused again.
      if (!result.ok) console.warn(`[support] ${notice.event} was not sent: ${result.problem}.`);
    } catch (error) {
      // Not marked: the next drain tells it again, and the dedupe keys make sure whatever
      // was already recorded is not recorded twice.
      console.error(`[support] ${notice.event} could not be sent:`, error instanceof Error ? error.message : "unknown error");
      return false;
    }
  }
  await markEventNotified(env, event.id);
  return true;
}

/** Tells every support event still owed that is at least `olderThanMinutes` old. Never throws. */
export async function drainSupportEvents(env: ClerkEnv, olderThanMinutes = 2): Promise<{ told: number; pending: number }> {
  try {
    const pending = await listPendingEvents(env, olderThanMinutes);
    let told = 0;
    for (const event of pending) if (await tellSupportEvent(env, event.id)) told += 1;
    return { told, pending: pending.length - told };
  } catch (error) {
    console.error("[support] Events still owed could not be told:", error instanceof Error ? error.message : "unknown error");
    return { told: 0, pending: -1 };
  }
}

/**
 * Tells, after the response, what a change recorded - and, while the
 * database is awake anyway, whatever is still owed and any email waiting.
 */
export function tellSupportSoon(env: ClerkEnv, eventIds: readonly string[]): void {
  const task = async () => {
    for (const id of eventIds) {
      try {
        await tellSupportEvent(env, id);
      } catch (error) {
        console.error("[support] An event could not be told:", error instanceof Error ? error.message : "unknown error");
      }
    }
    await drainSupportEvents(env);
    await drainEmail(env);
  };
  try {
    after(task);
  } catch {
    void task();
  }
}
