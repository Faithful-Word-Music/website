import { DEFAULT_ROLES, type Permission, type PermissionOverride } from "@/lib/auth/permissions";

import type { DeliveryRecord, StoredSubscription } from "../delivery";
import { CHANNELS, DEFAULT_CATEGORIES, type NotificationCategory, type NotificationItem } from "../model";
import type { PushPayload } from "../push";
import type { NotificationActor, NotificationDeps, NotificationWrite, PolicyRow, PreferenceRow } from "../service";

/**
 * For the tests: notifications kept in lists, behind the same doors the
 * database gives (src/lib/notifications/store.ts) - a notification is reached
 * only as its recipient. It starts with the default categories and policies,
 * and the starting roles with their starting permissions.
 */
export function notificationStore(
  options: {
    /** Who holds which roles. */
    userRoles?: Record<string, string[]>;
    overrides?: Record<string, PermissionOverride[]>;
    /** Every account, including people with no role at all. */
    accountIds?: string[];
  } = {},
) {
  const categories: NotificationCategory[] = DEFAULT_CATEGORIES.map((category, index) => ({
    key: category.key,
    name: category.name,
    description: category.description,
    active: true,
    sortOrder: index + 1,
  }));
  const policies: PolicyRow[] = DEFAULT_CATEGORIES.flatMap((category) =>
    CHANNELS.map((channel) => ({ category: category.key, channel, policy: category.policies[channel] })),
  );
  const preferences: PreferenceRow[] = [];
  const events: Array<NotificationWrite & { id: number }> = [];
  const rows: Array<NotificationItem & { recipient: string; inApp: boolean; eventId: number }> = [];
  let nextRowId = 0;
  /** The devices people receive push on, as push_subscriptions holds them. */
  const subscriptions: Array<StoredSubscription & { failures: number; seen: number }> = [];
  let nextSubscriptionId = 0;
  let seen = 0;
  /** Every message handed to the push service, in order. */
  const sent: Array<{ subscriptionId: number; userId: string; payload: PushPayload; urgency: string; collapse: string | null }> = [];
  const deliveries: DeliveryRecord[] = [];
  /**
   * The push service: whether the site has its keys, and what it answers for
   * a device (by subscription id) - a status, null for no answer, or "throw".
   * Anything not listed is accepted (201).
   */
  const push: { configured: boolean; answers: Record<number, number | null | "throw"> } = { configured: true, answers: {} };
  /** How many times the full list of accounts was asked for. */
  const calls = { accounts: 0 };
  let clock = Date.parse("2026-10-06T12:00:00.000Z");
  const tick = () => new Date((clock += 1000)).toISOString();
  /** Lets time pass, for what depends on how old a notification is. */
  const advance = (minutes: number) => {
    clock += minutes * 60_000;
  };

  const deps: NotificationDeps = {
    listCategories: async () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    listPolicies: async () => policies.map((row) => ({ ...row })),
    setPolicy: async (write) => {
      const row = policies.find((item) => item.category === write.category && item.channel === write.channel);
      if (row) row.policy = write.policy;
      else policies.push({ category: write.category, channel: write.channel, policy: write.policy });
    },
    listPreferences: async (userIds) => preferences.filter((row) => userIds.includes(row.userId)).map((row) => ({ ...row })),
    setPreference: async (write) => {
      const row = preferences.find((item) => item.userId === write.userId && item.category === write.category && item.channel === write.channel);
      if (row) row.enabled = write.enabled;
      else preferences.push({ ...write });
    },
    loadDirectory: async () => ({
      userRoles: new Map(Object.entries(options.userRoles ?? {})),
      rolePermissions: new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]])),
      overrides: new Map(Object.entries(options.overrides ?? {})),
      accountIds: [],
    }),
    listAccountIds: async () => {
      calls.accounts += 1;
      return options.accountIds ?? Object.keys(options.userRoles ?? {});
    },
    record: async (write) => {
      const id = events.length + 1;
      events.push({ ...write, id });
      // As the database does: an unread notification of the same family about the same thing, young enough, is replaced.
      const fold = write.coalesce;
      const replaced = new Set<string>();
      if (fold) {
        const since = clock - fold.windowMinutes * 60_000;
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          const row = rows[index];
          const event = events.find((item) => item.id === row.eventId)!;
          const same =
            event.coalesce?.family === fold.family && event.entityType === write.entityType && event.entityId === write.entityId;
          if (!same || !row.inApp || row.readAt !== null || Date.parse(row.createdAt) < since) continue;
          if (!write.recipients.some((recipient) => recipient.userId === row.recipient)) continue;
          replaced.add(row.recipient);
          rows.splice(index, 1);
        }
      }
      const notifications: Array<{ userId: string; id: number; replaced: boolean }> = [];
      for (const recipient of write.recipients) {
        const folded = fold && replaced.has(recipient.userId);
        notifications.push({ userId: recipient.userId, id: nextRowId + 1, replaced: Boolean(folded) });
        rows.push({
          id: (nextRowId += 1),
          eventId: id,
          recipient: recipient.userId,
          inApp: recipient.inApp,
          category: write.category,
          title: folded ? fold.title : write.title,
          body: folded ? fold.body : write.body,
          actionUrl: write.actionUrl,
          priority: write.priority,
          readAt: null,
          createdAt: tick(),
        });
      }
      return { eventId: id, notifications };
    },
    list: async (userId, { before, limit }) =>
      rows
        .filter((row) => row.recipient === userId && row.inApp && (before === null || row.id < before))
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map(
          (row): NotificationItem => ({
            id: row.id,
            category: row.category,
            title: row.title,
            body: row.body,
            actionUrl: row.actionUrl,
            priority: row.priority,
            readAt: row.readAt,
            createdAt: row.createdAt,
          }),
        ),
    countUnread: async (userId) => rows.filter((row) => row.recipient === userId && row.inApp && row.readAt === null).length,
    setRead: async (userId, id, read) => {
      const row = rows.find((item) => item.id === id && item.recipient === userId && item.inApp);
      if (!row) return false;
      row.readAt = read ? (row.readAt ?? tick()) : null;
      return true;
    },
    setAllRead: async (userId) => {
      for (const row of rows) if (row.recipient === userId && row.inApp && row.readAt === null) row.readAt = tick();
    },
    actionUrlOf: async (userId, id) => {
      const row = rows.find((item) => item.id === id && item.recipient === userId);
      return row ? row.actionUrl : undefined;
    },
    push: {
      configured: () => push.configured,
      // At once: a test sees what was sent as soon as notify() returns.
      defer: (task) => task(),
      listSubscriptions: async (userIds) => subscriptions.filter((item) => userIds.includes(item.userId)).map((item) => ({ ...item })),
      countUnread: async (userIds) =>
        new Map(userIds.map((userId) => [userId, rows.filter((row) => row.recipient === userId && row.inApp && row.readAt === null).length])),
      send: async (subscription, payload, sendOptions) => {
        sent.push({ subscriptionId: subscription.id, userId: subscription.userId, payload: JSON.parse(payload) as PushPayload, ...sendOptions });
        const answer = push.answers[subscription.id] ?? 201;
        if (answer === "throw") throw new Error("the push service is away");
        return { statusCode: answer, error: answer !== null && answer < 300 ? null : "refused" };
      },
      recordDeliveries: async (records) => {
        deliveries.push(...records);
      },
      settle: async ({ failed, expired }) => {
        for (const item of subscriptions) if (failed.includes(item.id)) item.failures += 1;
        for (let index = subscriptions.length - 1; index >= 0; index -= 1) if (expired.includes(subscriptions[index].id)) subscriptions.splice(index, 1);
      },
      saveSubscription: async (write, max) => {
        const existing = subscriptions.find((item) => item.endpoint === write.endpoint);
        // An endpoint is held once: registered again by someone else, it is theirs.
        if (existing) Object.assign(existing, { userId: write.userId, p256dh: write.p256dh, auth: write.auth, device: write.device, seen: (seen += 1) });
        else subscriptions.push({ id: (nextSubscriptionId += 1), ...write, failures: 0, seen: (seen += 1) });
        const mine = subscriptions.filter((item) => item.userId === write.userId).sort((a, b) => b.seen - a.seen);
        for (const extra of mine.slice(max)) subscriptions.splice(subscriptions.indexOf(extra), 1);
      },
      seenSubscription: async (userId, endpoint) => {
        const found = subscriptions.find((item) => item.userId === userId && item.endpoint === endpoint);
        if (found) found.seen = seen += 1;
        return Boolean(found);
      },
      removeSubscription: async (userId, endpoint) => {
        const index = subscriptions.findIndex((item) => item.userId === userId && item.endpoint === endpoint);
        if (index >= 0) subscriptions.splice(index, 1);
        return index >= 0;
      },
    },
  };

  /** Registers a device straight into the list, as if the person had switched push on in it. */
  const device = (userId: string, name = "Chrome on Windows") => {
    const id = (nextSubscriptionId += 1);
    subscriptions.push({ id, userId, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: "p".repeat(87), auth: "a".repeat(22), device: name, failures: 0, seen: (seen += 1) });
    return id;
  };

  /** As deleting the account does (deleteNotificationData in store.ts). */
  const deleteAccount = (userId: string) => {
    for (const list of [subscriptions, deliveries] as Array<Array<{ userId: string }>>) {
      for (let index = list.length - 1; index >= 0; index -= 1) if (list[index].userId === userId) list.splice(index, 1);
    }
    for (let index = rows.length - 1; index >= 0; index -= 1) if (rows[index].recipient === userId) rows.splice(index, 1);
    for (let index = preferences.length - 1; index >= 0; index -= 1) if (preferences[index].userId === userId) preferences.splice(index, 1);
  };

  /** A person's stored choice exactly as kept, or undefined when they never made one. */
  const stored = (userId: string, category: string, channel: string) =>
    preferences.find((row) => row.userId === userId && row.category === category && row.channel === channel)?.enabled;

  return { deps, categories, policies, preferences, events, rows, calls, stored, advance, subscriptions, sent, deliveries, push, device, deleteAccount };
}

/**
 * A small ministry, for the tests of real events: two musicians' worth of
 * roles, two leaders, an administrator who is not on the music team, and
 * someone who only reviews account requests.
 */
export const TEAM = {
  userRoles: {
    user_john: ["musician"],
    user_mary: ["song_leader"],
    user_director: ["music_director"],
    user_assistant: ["music_director"],
    user_admin: ["administrator"],
  },
  overrides: { user_helper: [{ permission: "manage_users", effect: "grant" as const }] },
  accountIds: ["user_john", "user_mary", "user_director", "user_assistant", "user_admin", "user_helper", "user_member"],
};

export const actor = (userId: string, ...permissions: Permission[]): NotificationActor => ({
  userId,
  can: (permission) => permissions.includes(permission),
});

/** Someone who may configure notifications. */
export const director = actor("user_director", "manage_notifications");
/** An ordinary musician: their own notifications and choices, nothing more. */
export const john = actor("user_john");
export const mary = actor("user_mary");
