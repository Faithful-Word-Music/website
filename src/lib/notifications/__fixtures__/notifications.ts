import { DEFAULT_ROLES, type Permission, type PermissionOverride } from "@/lib/auth/permissions";

import { CHANNELS, DEFAULT_CATEGORIES, type NotificationCategory, type NotificationItem } from "../model";
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
  const rows: Array<NotificationItem & { recipient: string; inApp: boolean }> = [];
  /** How many times the full list of accounts was asked for. */
  const calls = { accounts: 0 };
  let clock = Date.parse("2026-10-06T12:00:00.000Z");
  const tick = () => new Date((clock += 1000)).toISOString();

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
      for (const recipient of write.recipients) {
        rows.push({
          id: rows.length + 1,
          recipient: recipient.userId,
          inApp: recipient.inApp,
          category: write.category,
          title: write.title,
          body: write.body,
          actionUrl: write.actionUrl,
          priority: write.priority,
          readAt: null,
          createdAt: tick(),
        });
      }
      return { eventId: id };
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
  };

  /** A person's stored choice exactly as kept, or undefined when they never made one. */
  const stored = (userId: string, category: string, channel: string) =>
    preferences.find((row) => row.userId === userId && row.category === category && row.channel === channel)?.enabled;

  return { deps, categories, policies, preferences, events, rows, calls, stored };
}

export const actor = (userId: string, ...permissions: Permission[]): NotificationActor => ({
  userId,
  can: (permission) => permissions.includes(permission),
});

/** Someone who may configure notifications. */
export const director = actor("user_director", "manage_notifications");
/** An ordinary musician: their own notifications and choices, nothing more. */
export const john = actor("user_john");
export const mary = actor("user_mary");
