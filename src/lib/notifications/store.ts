import "server-only";

import { listAccounts } from "@/lib/auth/clerk";
import type { ClerkEnv } from "@/lib/auth/clerk-env";
import type { PermissionOverride } from "@/lib/auth/permissions";
import { db, type Sql } from "@/lib/auth/store";

import type { Directory } from "./audience";
import {
  CHANNELS,
  DEFAULT_CATEGORIES,
  type Channel,
  type ChannelPolicy,
  type NotificationCategory,
  type NotificationItem,
  type NotificationPriority,
} from "./model";
import type { NotificationDeps, PolicyRow, PreferenceRow } from "./service";

/**
 * Where notifications are kept.
 *
 *   notification_categories         the kinds of notification: a stable key,
 *                                   a name and description, and whether it is
 *                                   still in use. Never deleted - a retired
 *                                   category keeps its history readable.
 *   notification_channel_policies   one row per category and channel: the
 *                                   administrator's policy for it
 *   user_notification_preferences   a person's own choice for a category and
 *                                   channel - ONLY when they made one. No row
 *                                   means "follow the policy". Changing a
 *                                   policy never touches this table.
 *   notification_events             what happened, once per event
 *   notifications                   one row per person told: the title and
 *                                   body as they were sent, and when it was
 *                                   read
 *
 * Created on first use, on top of the account tables (db() in
 * src/lib/auth/store.ts); every row carries the Clerk environment, so a test
 * notification sent locally never appears in production.
 *
 * An event's entity (what it was about) is plain text with no foreign key:
 * deleting a service or a request never deletes the notifications about it.
 * A person's notifications and choices go only when their account does
 * (deleteNotificationData).
 *
 * A notification is only ever reached through its recipient: every query
 * that takes an id also takes the person asking. Who may configure what is
 * decided in service.ts, which is the only caller.
 */

const ENV = `clerk_env text NOT NULL CHECK (clerk_env IN ('development', 'production'))`;
const CHANNEL = `channel text NOT NULL CHECK (channel IN ('in_app', 'push', 'email'))`;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS notification_categories (
     ${ENV},
     key         text        NOT NULL,
     name        text        NOT NULL,
     description text        NOT NULL DEFAULT '',
     active      boolean     NOT NULL DEFAULT true,
     sort_order  integer     NOT NULL DEFAULT 0,
     created_at  timestamptz NOT NULL DEFAULT now(),
     updated_at  timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, key)
   )`,
  `CREATE TABLE IF NOT EXISTS notification_channel_policies (
     ${ENV},
     category_key text        NOT NULL,
     ${CHANNEL},
     policy       text        NOT NULL CHECK (policy IN ('mandatory', 'default_on', 'default_off', 'unavailable')),
     updated_by   text,
     updated_at   timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, category_key, channel),
     FOREIGN KEY (clerk_env, category_key) REFERENCES notification_categories (clerk_env, key)
   )`,
  `CREATE TABLE IF NOT EXISTS user_notification_preferences (
     ${ENV},
     clerk_user_id text        NOT NULL,
     category_key  text        NOT NULL,
     ${CHANNEL},
     enabled       boolean     NOT NULL,
     created_at    timestamptz NOT NULL DEFAULT now(),
     updated_at    timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, clerk_user_id, category_key, channel),
     FOREIGN KEY (clerk_env, category_key) REFERENCES notification_categories (clerk_env, key)
   )`,
  `CREATE TABLE IF NOT EXISTS notification_events (
     id            bigserial   PRIMARY KEY,
     ${ENV},
     category_key  text        NOT NULL,
     event_key     text        NOT NULL,
     actor_user_id text,
     entity_type   text,
     entity_id     text,
     payload       jsonb       NOT NULL DEFAULT '{}',
     created_at    timestamptz NOT NULL DEFAULT now(),
     FOREIGN KEY (clerk_env, category_key) REFERENCES notification_categories (clerk_env, key)
   )`,
  `CREATE INDEX IF NOT EXISTS notification_events_entity
     ON notification_events (clerk_env, entity_type, entity_id, created_at DESC) WHERE entity_type IS NOT NULL`,
  // in_app: whether it shows in the bell and the history. Always true while
  // the app is the only channel that delivers; a later channel can deliver
  // to someone who has the app's switched off without changing this table.
  `CREATE TABLE IF NOT EXISTS notifications (
     id                bigserial   PRIMARY KEY,
     ${ENV},
     event_id          bigint      NOT NULL REFERENCES notification_events (id) ON DELETE CASCADE,
     recipient_user_id text        NOT NULL,
     category_key      text        NOT NULL,
     title             text        NOT NULL,
     body              text        NOT NULL DEFAULT '',
     action_url        text,
     priority          text        NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'critical')),
     in_app            boolean     NOT NULL DEFAULT true,
     read_at           timestamptz,
     created_at        timestamptz NOT NULL DEFAULT now()
   )`,
  // The history, newest first, a page at a time (ids rise with time).
  `CREATE INDEX IF NOT EXISTS notifications_recipient
     ON notifications (clerk_env, recipient_user_id, id DESC) WHERE in_app`,
  // The unread count the bell asks for: only ever the unread rows.
  `CREATE INDEX IF NOT EXISTS notifications_unread
     ON notifications (clerk_env, recipient_user_id) WHERE in_app AND read_at IS NULL`,
];

let schemaReady = false;
const seeded = new Set<ClerkEnv>();

async function notificationSql(env: ClerkEnv): Promise<Sql> {
  const sql = await db(env);
  if (!schemaReady) {
    for (const statement of SCHEMA) await sql.query(statement);
    schemaReady = true;
  }
  if (!seeded.has(env)) {
    await seedDefaults(sql, env);
    seeded.add(env);
  }
  return sql;
}

/**
 * Writes the starting categories and their policies. Only what is missing is
 * written, so a category added to the code later arrives by itself, and
 * nothing an administrator has changed is ever put back.
 */
async function seedDefaults(sql: Sql, env: ClerkEnv): Promise<void> {
  const categories = DEFAULT_CATEGORIES.map((category, index) => ({
    key: category.key,
    name: category.name,
    description: category.description,
    sort_order: index + 1,
  }));
  const policies = DEFAULT_CATEGORIES.flatMap((category) =>
    CHANNELS.map((channel) => ({ category_key: category.key, channel, policy: category.policies[channel] })),
  );
  await sql.query(
    `INSERT INTO notification_categories (clerk_env, key, name, description, sort_order)
     SELECT $1, c.key, c.name, c.description, c.sort_order
       FROM jsonb_to_recordset($2::jsonb) AS c(key text, name text, description text, sort_order integer)
     ON CONFLICT DO NOTHING`,
    [env, JSON.stringify(categories)],
  );
  await sql.query(
    `INSERT INTO notification_channel_policies (clerk_env, category_key, channel, policy)
     SELECT $1, p.category_key, p.channel, p.policy
       FROM jsonb_to_recordset($2::jsonb) AS p(category_key text, channel text, policy text)
     ON CONFLICT DO NOTHING`,
    [env, JSON.stringify(policies)],
  );
}

interface NotificationRow {
  id: string | number;
  category_key: string;
  title: string;
  body: string;
  action_url: string | null;
  priority: NotificationPriority;
  read_at: Date | string | null;
  created_at: Date | string;
}

const COLUMNS = `id, category_key, title, body, action_url, priority, read_at, created_at`;

const toItem = (row: NotificationRow): NotificationItem => ({
  id: Number(row.id),
  category: row.category_key,
  title: row.title,
  body: row.body,
  actionUrl: row.action_url,
  priority: row.priority,
  readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
  createdAt: new Date(row.created_at).toISOString(),
});

/** Clerk returns at most this many accounts at a time. */
const ACCOUNT_PAGE = 500;

/** The database behind the notification rules (service.ts), for one environment. */
export function notificationDeps(env: ClerkEnv): NotificationDeps {
  return {
    async listCategories() {
      const sql = await notificationSql(env);
      const rows = (await sql.query(
        `SELECT key, name, description, active, sort_order FROM notification_categories
          WHERE clerk_env = $1 ORDER BY sort_order, name`,
        [env],
      )) as Array<{ key: string; name: string; description: string; active: boolean; sort_order: number }>;
      return rows.map(
        (row): NotificationCategory => ({
          key: row.key,
          name: row.name,
          description: row.description,
          active: row.active,
          sortOrder: row.sort_order,
        }),
      );
    },

    async listPolicies() {
      const sql = await notificationSql(env);
      const rows = (await sql.query(
        `SELECT category_key, channel, policy FROM notification_channel_policies WHERE clerk_env = $1`,
        [env],
      )) as Array<{ category_key: string; channel: Channel; policy: ChannelPolicy }>;
      return rows.map((row): PolicyRow => ({ category: row.category_key, channel: row.channel, policy: row.policy }));
    },

    async setPolicy(write) {
      const sql = await notificationSql(env);
      await sql.query(
        `INSERT INTO notification_channel_policies (clerk_env, category_key, channel, policy, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (clerk_env, category_key, channel) DO UPDATE SET
           policy = EXCLUDED.policy, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [env, write.category, write.channel, write.policy, write.userId],
      );
    },

    async listPreferences(userIds) {
      if (userIds.length === 0) return [];
      const sql = await notificationSql(env);
      const rows = (await sql.query(
        `SELECT clerk_user_id, category_key, channel, enabled FROM user_notification_preferences
          WHERE clerk_env = $1 AND clerk_user_id = ANY($2::text[])`,
        [env, userIds],
      )) as Array<{ clerk_user_id: string; category_key: string; channel: Channel; enabled: boolean }>;
      return rows.map(
        (row): PreferenceRow => ({ userId: row.clerk_user_id, category: row.category_key, channel: row.channel, enabled: row.enabled }),
      );
    },

    async setPreference(write) {
      const sql = await notificationSql(env);
      await sql.query(
        `INSERT INTO user_notification_preferences (clerk_env, clerk_user_id, category_key, channel, enabled)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (clerk_env, clerk_user_id, category_key, channel) DO UPDATE SET
           enabled = EXCLUDED.enabled, updated_at = now()`,
        [env, write.userId, write.category, write.channel, write.enabled],
      );
    },

    // The same three lists the availability board reads (loadRosterRecords), in one round trip.
    async loadDirectory() {
      const sql = await notificationSql(env);
      const [row] = (await sql.query(
        `SELECT
           COALESCE((SELECT json_agg(json_build_object('user', clerk_user_id, 'role', role_key))
                       FROM user_roles WHERE clerk_env = $1), '[]') AS user_roles,
           COALESCE((SELECT json_agg(json_build_object('role', role_key, 'permission', permission))
                       FROM role_permissions WHERE clerk_env = $1), '[]') AS role_permissions,
           COALESCE((SELECT json_agg(json_build_object('user', clerk_user_id, 'permission', permission, 'effect', effect))
                       FROM user_permission_overrides WHERE clerk_env = $1), '[]') AS overrides`,
        [env],
      )) as Array<{
        user_roles: Array<{ user: string; role: string }>;
        role_permissions: Array<{ role: string; permission: string }>;
        overrides: Array<PermissionOverride & { user: string }>;
      }>;

      const userRoles = new Map<string, string[]>();
      for (const { user, role } of row.user_roles) userRoles.set(user, [...(userRoles.get(user) ?? []), role]);
      const rolePermissions = new Map<string, string[]>();
      for (const { role, permission } of row.role_permissions) {
        rolePermissions.set(role, [...(rolePermissions.get(role) ?? []), permission]);
      }
      const overrides = new Map<string, PermissionOverride[]>();
      for (const { user, permission, effect } of row.overrides) {
        overrides.set(user, [...(overrides.get(user) ?? []), { permission, effect }]);
      }
      return { userRoles, rolePermissions, overrides, accountIds: [] } satisfies Directory;
    },

    // Accounts belong to Clerk. If it cannot be asked, the notification is
    // not sent to a guessed list: the caller hears that it failed.
    async listAccountIds() {
      const ids: string[] = [];
      for (let offset = 0; ; offset += ACCOUNT_PAGE) {
        const page = await listAccounts({ limit: ACCOUNT_PAGE, offset });
        if (!page.ok) throw new Error("The list of accounts could not be read from Clerk.");
        ids.push(...page.value.accounts.map((account) => account.id));
        if (page.value.accounts.length < ACCOUNT_PAGE || ids.length >= page.value.total) return ids;
      }
    },

    // The event and every recipient's notification in one statement: either all of it is there, or none.
    async record(write) {
      const sql = await notificationSql(env);
      const [row] = (await sql.query(
        `WITH event AS (
           INSERT INTO notification_events (clerk_env, category_key, event_key, actor_user_id, entity_type, entity_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           RETURNING id
         ), sent AS (
           INSERT INTO notifications (clerk_env, event_id, recipient_user_id, category_key, title, body, action_url, priority, in_app)
           SELECT $1, event.id, r.user_id, $2, $8, $9, $10, $11, r.in_app
             FROM event CROSS JOIN jsonb_to_recordset($12::jsonb) AS r(user_id text, in_app boolean)
           RETURNING 1
         )
         SELECT event.id, (SELECT count(*) FROM sent) AS sent FROM event`,
        [
          env,
          write.category,
          write.eventKey,
          write.actorUserId,
          write.entityType,
          write.entityId,
          JSON.stringify(write.payload),
          write.title,
          write.body,
          write.actionUrl,
          write.priority,
          JSON.stringify(write.recipients.map((recipient) => ({ user_id: recipient.userId, in_app: recipient.inApp }))),
        ],
      )) as Array<{ id: string | number }>;
      return { eventId: Number(row.id) };
    },

    async list(userId, { before, limit }) {
      const sql = await notificationSql(env);
      const rows = (await sql.query(
        `SELECT ${COLUMNS} FROM notifications
          WHERE clerk_env = $1 AND recipient_user_id = $2 AND in_app AND ($3::bigint IS NULL OR id < $3::bigint)
          ORDER BY id DESC LIMIT $4`,
        [env, userId, before, limit],
      )) as NotificationRow[];
      return rows.map(toItem);
    },

    async countUnread(userId) {
      const sql = await notificationSql(env);
      const [row] = (await sql.query(
        `SELECT count(*) AS unread FROM notifications
          WHERE clerk_env = $1 AND recipient_user_id = $2 AND in_app AND read_at IS NULL`,
        [env, userId],
      )) as Array<{ unread: string | number }>;
      return Number(row?.unread ?? 0);
    },

    // Matched on the recipient as well as the id - never another person's. Reading
    // again keeps the first time it was read.
    async setRead(userId, id, read) {
      const sql = await notificationSql(env);
      const rows = (await sql.query(
        `UPDATE notifications SET read_at = CASE WHEN $4 THEN COALESCE(read_at, now()) ELSE NULL END
          WHERE clerk_env = $1 AND recipient_user_id = $2 AND id = $3 AND in_app RETURNING id`,
        [env, userId, id, read],
      )) as unknown[];
      return rows.length > 0;
    },

    async setAllRead(userId) {
      const sql = await notificationSql(env);
      await sql.query(
        `UPDATE notifications SET read_at = now()
          WHERE clerk_env = $1 AND recipient_user_id = $2 AND in_app AND read_at IS NULL`,
        [env, userId],
      );
    },
  };
}

/** A person's notifications and choices, for when their account is deleted. */
export async function deleteNotificationData(env: ClerkEnv, userId: string): Promise<void> {
  const sql = await notificationSql(env);
  await sql.transaction((txn) => [
    txn.query(`DELETE FROM notifications WHERE clerk_env = $1 AND recipient_user_id = $2`, [env, userId]),
    txn.query(`DELETE FROM user_notification_preferences WHERE clerk_env = $1 AND clerk_user_id = $2`, [env, userId]),
  ]);
}
