import "server-only";

import { randomUUID } from "node:crypto";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { db, listOptions, listRoles } from "@/lib/auth/store";

import { ANNOUNCEMENT_EVENT, parseSelection, EMPTY_SELECTION, type AnnouncementDraft, type DeliveryAttempt } from "./manual";
import type { AnnouncementRecord, ManualDeps, NotificationTemplate } from "./manual-service";
import type { NotificationPriority } from "./model";
import type { DeliveryStatus } from "./push";
import { everyAccount, notificationDeps, notificationSql } from "./store";

/**
 * The database behind announcements (manual-service.ts), for one Clerk
 * environment.
 *
 * Nothing here is a second record of a send. The history is read from the
 * tables every notification is written to (store.ts):
 *
 *   notification_events       one row per send (event_key "admin.announcement");
 *                             its payload is what was said and to whom
 *   notifications             who was told
 *   notification_deliveries   what became of each push, per device: its name
 *                             and the push service's answer. The device's
 *                             address and keys are not in that table at all,
 *                             so they cannot be read from here.
 *
 * The one table of its own is notification_templates.
 *
 * Roles and instruments are the site's own lists (src/lib/auth/store.ts), and
 * names are Clerk's: nobody's name is kept here.
 *
 * Who may call any of this is decided in manual-service.ts, the only caller.
 */

interface TemplateRow {
  id: string | number;
  name: string;
  title: string;
  body: string;
  action_url: string | null;
  priority: NotificationPriority;
  audience: unknown;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const TEMPLATE_COLUMNS = `id, name, title, body, action_url, priority, audience, created_by, updated_by, created_at, updated_at`;

const toTemplate = (row: TemplateRow): NotificationTemplate => ({
  id: Number(row.id),
  name: row.name,
  draft: {
    title: row.title,
    body: row.body,
    actionUrl: row.action_url,
    priority: row.priority,
    audience: parseSelection(row.audience) ?? EMPTY_SELECTION,
  },
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
});

const templateValues = (draft: AnnouncementDraft) => [draft.title, draft.body, draft.actionUrl, draft.priority, JSON.stringify(draft.audience)];

export function manualDeps(env: ClerkEnv): ManualDeps {
  return {
    notifications: notificationDeps(env),

    async listRoles() {
      return (await listRoles(env)).map(({ key, label }) => ({ key, label }));
    },

    async listInstruments() {
      return (await listOptions(env, "instruments")).map(({ id, label, archived }) => ({ id, label, archived }));
    },

    async instrumentPlayers(instrumentIds) {
      if (instrumentIds.length === 0) return [];
      const sql = await db(env);
      const rows = (await sql.query(
        `SELECT DISTINCT clerk_user_id FROM user_instruments WHERE clerk_env = $1 AND instrument_id = ANY($2::int[])`,
        [env, instrumentIds],
      )) as Array<{ clerk_user_id: string }>;
      return rows.map((row) => row.clerk_user_id);
    },

    async listPeople() {
      return (await everyAccount()).map((account) => ({ id: account.id, name: account.fullName }));
    },

    newId: () => randomUUID(),

    async listAnnouncements({ before, limit }) {
      const sql = await notificationSql(env);
      const rows = (await sql.query(
        `SELECT e.id, e.actor_user_id, e.created_at, e.payload,
                COALESCE(d.sent, 0) AS sent, COALESCE(d.failed, 0) AS failed, COALESCE(d.expired, 0) AS expired
           FROM notification_events e
           LEFT JOIN LATERAL (
             SELECT count(*) FILTER (WHERE status = 'sent') AS sent,
                    count(*) FILTER (WHERE status = 'failed') AS failed,
                    count(*) FILTER (WHERE status = 'expired') AS expired
               FROM notification_deliveries
              WHERE clerk_env = $1 AND event_id = e.id
           ) d ON true
          WHERE e.clerk_env = $1 AND e.event_key = $2 AND ($3::bigint IS NULL OR e.id < $3::bigint)
          ORDER BY e.id DESC LIMIT $4`,
        [env, ANNOUNCEMENT_EVENT, before, limit],
      )) as Array<{
        id: string | number;
        actor_user_id: string | null;
        created_at: Date | string;
        payload: unknown;
        sent: string | number;
        failed: string | number;
        expired: string | number;
      }>;
      return rows.map(
        (row): AnnouncementRecord => ({
          id: Number(row.id),
          actorUserId: row.actor_user_id,
          createdAt: new Date(row.created_at).toISOString(),
          payload: row.payload,
          delivery: { sent: Number(row.sent), failed: Number(row.failed), expired: Number(row.expired) },
        }),
      );
    },

    // Matched on the event's kind as well as its id: no other event's payload can be read through here.
    async getAnnouncement(id) {
      const sql = await notificationSql(env);
      const [event] = (await sql.query(
        `SELECT id, actor_user_id, created_at, payload FROM notification_events WHERE clerk_env = $1 AND event_key = $2 AND id = $3`,
        [env, ANNOUNCEMENT_EVENT, id],
      )) as Array<{ id: string | number; actor_user_id: string | null; created_at: Date | string; payload: unknown }>;
      if (!event) return null;
      const [recipients, attempts] = (await Promise.all([
        sql.query(`SELECT recipient_user_id FROM notifications WHERE clerk_env = $1 AND event_id = $2 ORDER BY id`, [env, id]),
        sql.query(
          `SELECT recipient_user_id, device, status, attempted_at FROM notification_deliveries
            WHERE clerk_env = $1 AND event_id = $2 AND channel = 'push' ORDER BY id`,
          [env, id],
        ),
      ])) as [Array<{ recipient_user_id: string }>, Array<{ recipient_user_id: string; device: string; status: DeliveryStatus; attempted_at: Date | string }>];
      return {
        id: Number(event.id),
        actorUserId: event.actor_user_id,
        createdAt: new Date(event.created_at).toISOString(),
        payload: event.payload,
        recipientIds: recipients.map((row) => row.recipient_user_id),
        attempts: attempts.map(
          (row): DeliveryAttempt => ({
            userId: row.recipient_user_id,
            device: row.device,
            status: row.status,
            attemptedAt: new Date(row.attempted_at).toISOString(),
          }),
        ),
      };
    },

    async listTemplates() {
      const sql = await notificationSql(env);
      const rows = (await sql.query(`SELECT ${TEMPLATE_COLUMNS} FROM notification_templates WHERE clerk_env = $1 ORDER BY lower(name), id`, [
        env,
      ])) as TemplateRow[];
      return rows.map(toTemplate);
    },

    async getTemplate(id) {
      const sql = await notificationSql(env);
      const rows = (await sql.query(`SELECT ${TEMPLATE_COLUMNS} FROM notification_templates WHERE clerk_env = $1 AND id = $2`, [env, id])) as TemplateRow[];
      return rows.length > 0 ? toTemplate(rows[0]) : null;
    },

    async createTemplate({ name, draft, userId }) {
      const sql = await notificationSql(env);
      const [row] = (await sql.query(
        `INSERT INTO notification_templates (clerk_env, name, title, body, action_url, priority, audience, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8) RETURNING id`,
        [env, name, ...templateValues(draft), userId],
      )) as Array<{ id: string | number }>;
      return Number(row.id);
    },

    async updateTemplate({ id, name, draft, userId }) {
      const sql = await notificationSql(env);
      const rows = (await sql.query(
        `UPDATE notification_templates
            SET name = $3, title = $4, body = $5, action_url = $6, priority = $7, audience = $8::jsonb, updated_by = $9, updated_at = now()
          WHERE clerk_env = $1 AND id = $2 RETURNING id`,
        [env, id, name, ...templateValues(draft), userId],
      )) as unknown[];
      return rows.length > 0;
    },

    async deleteTemplate(id) {
      const sql = await notificationSql(env);
      const rows = (await sql.query(`DELETE FROM notification_templates WHERE clerk_env = $1 AND id = $2 RETURNING id`, [env, id])) as unknown[];
      return rows.length > 0;
    },
  };
}
