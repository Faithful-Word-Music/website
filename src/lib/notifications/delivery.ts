import {
  MAX_SUBSCRIPTIONS,
  buildPushPayload,
  classifyPushResult,
  deviceLabel,
  parseEndpoint,
  parseSubscription,
  pushUrgency,
  type DeliveryStatus,
  type PushMessage,
} from "./push";

/**
 * Push delivery: a notification already recorded, on its way to a person's
 * devices - and the devices themselves.
 *
 *   notify() (service.ts)       decides WHO gets a push: the category's
 *                               policy and the person's own choice
 *   dispatchPush()              hands them over, after the response is sent
 *   deliverPush()               for each person, every device they have
 *                               registered: one attempt each, one
 *                               notification_deliveries row each
 *
 * THE RULE, as for every notification: a push that cannot be sent never
 * fails anything. Not the action the notification is about (it is saved
 * before any of this runs), not the notification in the app (already
 * written), and not the push to the person's other devices. Everything here
 * catches its own failures and logs them.
 *
 * Nothing is retried. A failed attempt is recorded and left: retries and
 * their bookkeeping are a later phase (NOTIFICATIONS.md).
 *
 * A device belongs to whoever registered it, and that is always the person
 * asking: nothing in a request says whose a subscription is.
 *
 * What it needs comes in as `deps`, so every rule is unit tested without a
 * database or a push service (delivery.test.ts). push-store.ts supplies the
 * real ones.
 */

export interface StoredSubscription {
  id: number;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  /** "Chrome on Windows", as it was when registered. */
  device: string;
}

export interface PushSendResult {
  /** The push service's answer, or null when there was none. */
  statusCode: number | null;
  error: string | null;
}

/** One attempt to reach one device. */
export interface DeliveryRecord {
  eventId: number;
  notificationId: number;
  userId: string;
  subscriptionId: number;
  device: string;
  status: DeliveryStatus;
  statusCode: number | null;
  error: string | null;
}

export interface PushDeps {
  /** Whether the site has its push keys. Without them nothing is sent. */
  configured(): boolean;
  /** Runs a task once the response has gone, so no action waits on a push service. */
  defer(task: () => Promise<void>): Promise<void>;
  /** Every device these people have registered. */
  listSubscriptions(userIds: readonly string[]): Promise<StoredSubscription[]>;
  /** Each person's unread notifications in the app. Someone with none may be left out. */
  countUnread(userIds: readonly string[]): Promise<Map<string, number>>;
  send(
    subscription: StoredSubscription,
    payload: string,
    options: { urgency: "normal" | "high"; collapse: string | null },
  ): Promise<PushSendResult>;
  recordDeliveries(rows: readonly DeliveryRecord[]): Promise<void>;
  /** After a round of attempts: note the successes and failures, and retire what is gone for good. */
  settle(outcome: { sent: number[]; failed: number[]; expired: number[] }): Promise<void>;
  /**
   * Registers a device to this person. An endpoint is only ever held once:
   * if it was someone else's (the same browser, another account), it is
   * theirs no longer. Keeps at most `max` per person, dropping the least
   * recently seen.
   */
  saveSubscription(write: { userId: string; endpoint: string; p256dh: string; auth: string; device: string; userAgent: string }, max: number): Promise<void>;
  /** Whether THIS person holds this endpoint; notes that the device was seen. */
  seenSubscription(userId: string, endpoint: string): Promise<boolean>;
  /** Removes this person's hold on an endpoint. False when it was not theirs. */
  removeSubscription(userId: string, endpoint: string): Promise<boolean>;
}

const describe = (error: unknown) => (error instanceof Error ? error.message : "unknown error");

/**
 * Sends each message to every device its recipient has registered.
 *
 * One attempt per device, all at once; each is recorded. A device the push
 * service says is gone is retired; one that merely failed is kept. Never
 * throws.
 */
export async function deliverPush(messages: readonly PushMessage[], deps: PushDeps): Promise<void> {
  try {
    if (messages.length === 0 || !deps.configured()) return;
    const userIds = [...new Set(messages.map((message) => message.userId))];
    const subscriptions = await deps.listSubscriptions(userIds);
    // Wanting push and having no device to send it to is not a failure: there is simply nothing to do.
    if (subscriptions.length === 0) return;
    const unread = await deps.countUnread(userIds);

    const attempts = messages.flatMap((message) => {
      const payload = JSON.stringify(buildPushPayload(message, unread.get(message.userId) ?? 0));
      const options = { urgency: pushUrgency(message.priority), collapse: message.folds ? message.tag : null };
      return subscriptions
        .filter((subscription) => subscription.userId === message.userId)
        .map(async (subscription): Promise<DeliveryRecord> => {
          let result: PushSendResult;
          try {
            result = await deps.send(subscription, payload, options);
          } catch (error) {
            result = { statusCode: null, error: describe(error) };
          }
          return {
            eventId: message.eventId,
            notificationId: message.notificationId,
            userId: message.userId,
            subscriptionId: subscription.id,
            device: subscription.device,
            status: classifyPushResult(result.statusCode),
            statusCode: result.statusCode,
            error: result.error,
          };
        });
    });
    const records = await Promise.all(attempts);
    if (records.length === 0) return;

    const ids = (status: DeliveryStatus) => [...new Set(records.filter((record) => record.status === status).map((record) => record.subscriptionId))];
    const expired = ids("expired");
    // A device that answered once and failed once in the same round is working: it is not counted as failing.
    const sent = ids("sent").filter((id) => !expired.includes(id));
    const failed = ids("failed").filter((id) => !expired.includes(id) && !sent.includes(id));

    // The two writes do not depend on each other: a history that cannot be written still retires a dead device.
    const written = await Promise.allSettled([deps.recordDeliveries(records), deps.settle({ sent, failed, expired })]);
    for (const outcome of written) {
      if (outcome.status === "rejected") console.error("[notifications] A push delivery could not be recorded:", describe(outcome.reason));
    }
    const problems = records.filter((record) => record.status === "failed").length;
    if (problems > 0) console.warn(`[notifications] ${problems} of ${records.length} push deliveries failed.`);
  } catch (error) {
    console.error("[notifications] Push delivery failed:", describe(error));
  }
}

/**
 * What notify() calls: the push to these people is set going and nothing
 * waits for it. Whatever goes wrong is logged here and goes no further.
 */
export async function dispatchPush(messages: readonly PushMessage[], deps: PushDeps): Promise<void> {
  try {
    if (messages.length === 0 || !deps.configured()) return;
    await deps.defer(() => deliverPush(messages, deps));
  } catch (error) {
    console.error("[notifications] Push delivery could not be started:", describe(error));
  }
}

// ---------------------------------------------------------------------------
// A person's own devices
// ---------------------------------------------------------------------------

/** Whoever is asking. Their id comes from the session, never from a request. */
export interface DeviceOwner {
  userId: string;
}

export type DeviceResult = { ok: true; registered: boolean } | { ok: false; problem: "invalid" | "not-set-up" };

/**
 * Registers the browser asking to the person signed in on it. Whose it is
 * comes from the session alone: a `userId` in the input goes nowhere.
 */
export async function registerSubscription(
  owner: DeviceOwner,
  input: { subscription: unknown; userAgent: unknown },
  deps: PushDeps,
): Promise<DeviceResult> {
  if (!deps.configured()) return { ok: false, problem: "not-set-up" };
  const subscription = parseSubscription(input.subscription);
  if (!subscription) return { ok: false, problem: "invalid" };
  const userAgent = typeof input.userAgent === "string" ? input.userAgent.slice(0, 400) : "";
  await deps.saveSubscription({ userId: owner.userId, ...subscription, device: deviceLabel(userAgent), userAgent }, MAX_SUBSCRIPTIONS);
  return { ok: true, registered: true };
}

/** Whether the browser asking is registered to the person signed in on it. Someone else's reads as "no". */
export async function subscriptionStatus(owner: DeviceOwner, input: { endpoint: unknown }, deps: PushDeps): Promise<DeviceResult> {
  const endpoint = parseEndpoint(input.endpoint);
  if (!endpoint) return { ok: false, problem: "invalid" };
  return { ok: true, registered: await deps.seenSubscription(owner.userId, endpoint) };
}

/** Takes the browser asking off the signed-in person's devices. Their other devices, and anyone else's, are untouched. */
export async function removeSubscription(owner: DeviceOwner, input: { endpoint: unknown }, deps: PushDeps): Promise<DeviceResult> {
  const endpoint = parseEndpoint(input.endpoint);
  if (!endpoint) return { ok: false, problem: "invalid" };
  await deps.removeSubscription(owner.userId, endpoint);
  return { ok: true, registered: false };
}
