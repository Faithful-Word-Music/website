import "server-only";

import { createHash } from "node:crypto";

import { after } from "next/server";
import { WebPushError, sendNotification } from "web-push";

import { siteConfig } from "@/config/site";
import type { ClerkEnv } from "@/lib/auth/clerk-env";
import type { Sql } from "@/lib/auth/store";

import type { PushDeps, StoredSubscription } from "./delivery";
import { isVapidPublicKey } from "./push";

/**
 * Push, for real: the site's keys, the push services, and the two tables
 * (created in store.ts, with the rest of the notification schema).
 *
 *   push_subscriptions        one row per browser or installed app a person
 *                             switched push on in: the push service's
 *                             address for it and the two keys a message to it
 *                             is encrypted with. An address is held ONCE,
 *                             whoever's it is - the same browser signed in as
 *                             someone else moves to them.
 *   notification_deliveries   one row per attempt to reach one device: which
 *                             notification, which device, what the push
 *                             service said. Never the address itself.
 *
 * Standard Web Push (VAPID) through the web-push package, straight to the
 * browsers' own push services. No third party holds the notifications.
 *
 * A subscription's address and keys are treated as secrets: they are never
 * logged, never sent to a browser, and never written to the delivery history.
 */

/**
 * The site's push keys (VAPID), or null when they are not set - push is then
 * simply not set up: nothing is sent, and the settings page says so.
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY   handed to browsers when they subscribe
 *   VAPID_PRIVATE_KEY              signs every message. Server only.
 *   VAPID_SUBJECT                  who a push service may contact about this
 *                                  site: "mailto:..." or an https address.
 *                                  Defaults to the site's own address.
 */
export function vapidConfig(): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!isVapidPublicKey(publicKey) || !privateKey || !/^[A-Za-z0-9_-]{43}$/.test(privateKey)) return null;
  const given = process.env.VAPID_SUBJECT?.trim();
  const subject = given && /^(mailto:.+@.+|https:\/\/.+)/.test(given) ? given : siteConfig.url;
  return { subject, publicKey, privateKey };
}

/** How long a push service keeps a message for a device that is off or out of reach: three days. */
const TTL_SECONDS = 72 * 60 * 60;
/** How long one push service is waited for. */
const SEND_TIMEOUT_MS = 5_000;

/**
 * A folding tag as a Web Push "Topic": the push service keeps only the latest
 * undelivered message of a topic, so a phone that was off receives one
 * notification about a service, not five. A topic is at most 32 URL-safe
 * characters, hence the hash.
 */
function topicOf(tag: string): string {
  return createHash("sha256").update(tag).digest("base64url").slice(0, 32);
}

interface SubscriptionRow {
  id: string | number;
  clerk_user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  device: string;
}

/** The devices and the push service behind delivery.ts, for one environment. */
export function pushDeps(env: ClerkEnv, connect: () => Promise<Sql>): PushDeps {
  return {
    configured: () => vapidConfig() !== null,

    // After the response where there is one (a server action, a route): the
    // person who published a service is not kept waiting on Apple or Google.
    // Outside a request there is nothing to wait behind, so it runs now.
    async defer(task) {
      try {
        after(task);
      } catch {
        await task();
      }
    },

    async listSubscriptions(userIds) {
      if (userIds.length === 0) return [];
      const sql = await connect();
      const rows = (await sql.query(
        `SELECT id, clerk_user_id, endpoint, p256dh, auth, device FROM push_subscriptions
          WHERE clerk_env = $1 AND clerk_user_id = ANY($2::text[])`,
        [env, userIds],
      )) as SubscriptionRow[];
      return rows.map(
        (row): StoredSubscription => ({
          id: Number(row.id),
          userId: row.clerk_user_id,
          endpoint: row.endpoint,
          p256dh: row.p256dh,
          auth: row.auth,
          device: row.device,
        }),
      );
    },

    async countUnread(userIds) {
      if (userIds.length === 0) return new Map();
      const sql = await connect();
      const rows = (await sql.query(
        `SELECT recipient_user_id, count(*) AS unread FROM notifications
          WHERE clerk_env = $1 AND recipient_user_id = ANY($2::text[]) AND in_app AND read_at IS NULL
          GROUP BY recipient_user_id`,
        [env, userIds],
      )) as Array<{ recipient_user_id: string; unread: string | number }>;
      return new Map(rows.map((row) => [row.recipient_user_id, Number(row.unread)]));
    },

    async send(subscription, payload, options) {
      const vapidDetails = vapidConfig();
      if (!vapidDetails) return { statusCode: null, error: "Push is not set up." };
      try {
        const result = await sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          {
            vapidDetails,
            TTL: TTL_SECONDS,
            urgency: options.urgency,
            timeout: SEND_TIMEOUT_MS,
            ...(options.collapse ? { topic: topicOf(options.collapse) } : {}),
          },
        );
        return { statusCode: result.statusCode, error: null };
      } catch (error) {
        // The push service's own words, cut short. Never the endpoint: it is a secret.
        if (error instanceof WebPushError) return { statusCode: error.statusCode, error: (error.body || error.message).slice(0, 300) };
        return { statusCode: null, error: (error instanceof Error ? error.message : "unknown error").slice(0, 300) };
      }
    },

    async recordDeliveries(rows) {
      if (rows.length === 0) return;
      const sql = await connect();
      await sql.query(
        `INSERT INTO notification_deliveries
           (clerk_env, event_id, notification_id, recipient_user_id, channel, push_subscription_id, device, status, status_code, error, delivered_at)
         SELECT $1, d.event_id, d.notification_id, d.user_id, 'push', d.subscription_id, d.device, d.status, d.status_code, d.error,
                CASE WHEN d.status = 'sent' THEN now() END
           FROM jsonb_to_recordset($2::jsonb)
             AS d(event_id bigint, notification_id bigint, user_id text, subscription_id bigint, device text, status text, status_code integer, error text)`,
        [
          env,
          JSON.stringify(
            rows.map((row) => ({
              event_id: row.eventId,
              notification_id: row.notificationId,
              user_id: row.userId,
              subscription_id: row.subscriptionId,
              device: row.device,
              status: row.status,
              status_code: row.statusCode,
              error: row.error,
            })),
          ),
        ],
      );
    },

    async settle({ sent, failed, expired }) {
      const sql = await connect();
      await sql.transaction((txn) => [
        txn.query(
          `UPDATE push_subscriptions SET last_success_at = now(), failure_count = 0 WHERE clerk_env = $1 AND id = ANY($2::bigint[])`,
          [env, sent],
        ),
        txn.query(`UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE clerk_env = $1 AND id = ANY($2::bigint[])`, [env, failed]),
        // Gone for good, the push service says: never tried again.
        txn.query(`DELETE FROM push_subscriptions WHERE clerk_env = $1 AND id = ANY($2::bigint[])`, [env, expired]),
      ]);
    },

    async saveSubscription(write, max) {
      const sql = await connect();
      await sql.transaction((txn) => [
        // ON CONFLICT (endpoint): the address is held once across everyone and both
        // environments, so a browser handed to another account is theirs alone.
        txn.query(
          `INSERT INTO push_subscriptions (clerk_env, clerk_user_id, endpoint, p256dh, auth, device, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (endpoint) DO UPDATE SET
             clerk_env = EXCLUDED.clerk_env, clerk_user_id = EXCLUDED.clerk_user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
             device = EXCLUDED.device, user_agent = EXCLUDED.user_agent, updated_at = now(), last_seen_at = now(), failure_count = 0`,
          [env, write.userId, write.endpoint, write.p256dh, write.auth, write.device, write.userAgent],
        ),
        txn.query(
          `DELETE FROM push_subscriptions WHERE clerk_env = $1 AND clerk_user_id = $2 AND id NOT IN (
             SELECT id FROM push_subscriptions WHERE clerk_env = $1 AND clerk_user_id = $2 ORDER BY last_seen_at DESC, id DESC LIMIT $3)`,
          [env, write.userId, max],
        ),
      ]);
    },

    async seenSubscription(userId, endpoint) {
      const sql = await connect();
      const rows = (await sql.query(
        `UPDATE push_subscriptions SET last_seen_at = now() WHERE clerk_env = $1 AND clerk_user_id = $2 AND endpoint = $3 RETURNING id`,
        [env, userId, endpoint],
      )) as unknown[];
      return rows.length > 0;
    },

    async removeSubscription(userId, endpoint) {
      const sql = await connect();
      const rows = (await sql.query(
        `DELETE FROM push_subscriptions WHERE clerk_env = $1 AND clerk_user_id = $2 AND endpoint = $3 RETURNING id`,
        [env, userId, endpoint],
      )) as unknown[];
      return rows.length > 0;
    },
  };
}
