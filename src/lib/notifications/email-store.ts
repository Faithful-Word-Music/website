import "server-only";

import { after } from "next/server";

import { siteConfig } from "@/config/site";
import { listAccounts } from "@/lib/auth/clerk";
import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { isEmailConfigured, sendNotificationEmail } from "@/lib/resend";

import {
  classifyProviderError,
  drainEmailOutbox,
  EXPIRY_HOURS,
  LEASE_SECONDS,
  type DrainResult,
  type EmailDeps,
  type OutboxRow,
} from "./email-delivery";
import { notificationSql } from "./store";

/**
 * The outbox and the provider behind email-delivery.ts, for one environment.
 *
 * Sending is OFF unless NOTIFICATION_EMAIL_ENABLED is "1" in this deployment
 * (and RESEND_API_KEY is set): rows are still written - people's choices are
 * kept - but nothing is taken from the outbox, so a local or preview copy of
 * the site never emails anyone by accident.
 */

export function emailSendingEnabled(): boolean {
  return process.env.NOTIFICATION_EMAIL_ENABLED === "1" && isEmailConfigured();
}

/** The address links in an email lead to: this deployment's own. */
export function siteOrigin(): string {
  if (process.env.VERCEL_ENV === "production") return siteConfig.url;
  const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : "http://localhost:3000";
}

interface ClaimedRow {
  id: string;
  event_id: string | number;
  notification_id: string | number | null;
  clerk_user_id: string;
  subject: string;
  text_body: string;
  html_body: string;
  attempts: number;
  max_attempts: number;
}

export function emailDeps(env: ClerkEnv): EmailDeps {
  return {
    enabled: emailSendingEnabled,
    now: () => Date.now(),

    // One statement each. First, rows too old to send safely are given up -
    // one that may already have gone out (taken, never settled) says so.
    // ("unknown": it was handed to the provider and no answer was recorded - it may have been
    // delivered; "failed": it never was.) Then due rows are taken, each by one worker only (SKIP LOCKED), for a
    // short lease, its attempt counted before it is made.
    async claim(limit) {
      const sql = await notificationSql(env);
      await sql.query(
        `UPDATE notification_email_outbox
            SET status = CASE WHEN status = 'sending' THEN 'unknown' ELSE 'failed' END, updated_at = now(), lease_until = NULL,
                last_error = CASE WHEN status = 'sending' THEN 'outcome unknown; not sent again' ELSE 'expired before it could be sent' END
          WHERE clerk_env = $1 AND status IN ('pending', 'sending')
            AND created_at < now() - make_interval(hours => $2::int)
            AND (status = 'pending' OR lease_until < now())`,
        [env, EXPIRY_HOURS],
      );
      const rows = (await sql.query(
        `UPDATE notification_email_outbox o
            SET status = 'sending', attempts = o.attempts + 1, updated_at = now(),
                lease_until = now() + make_interval(secs => $3::int)
          WHERE o.id IN (
            SELECT id FROM notification_email_outbox
             WHERE clerk_env = $1
               AND ((status = 'pending' AND next_attempt_at <= now()) OR (status = 'sending' AND lease_until < now()))
             ORDER BY next_attempt_at
             LIMIT $2
             FOR UPDATE SKIP LOCKED
          )
          RETURNING o.id::text AS id, o.event_id, o.notification_id, o.clerk_user_id, o.subject, o.text_body, o.html_body,
                    o.attempts, o.max_attempts`,
        [env, limit, LEASE_SECONDS],
      )) as ClaimedRow[];
      return rows.map(
        (row): OutboxRow => ({
          id: row.id,
          eventId: Number(row.event_id),
          notificationId: row.notification_id === null ? null : Number(row.notification_id),
          userId: row.clerk_user_id,
          subject: row.subject,
          text: row.text_body,
          html: row.html_body,
          attempts: row.attempts,
          maxAttempts: row.max_attempts,
        }),
      );
    },

    // From Clerk, which is where addresses live: the primary address, once verified.
    // A disabled or locked account is emailed nothing.
    async addresses(userIds) {
      const accounts = await listAccounts({ userIds: [...userIds], limit: 500, offset: 0 });
      if (!accounts.ok) throw new Error("accounts unavailable");
      const byId = new Map(accounts.value.accounts.map((account) => [account.id, account]));
      return new Map(
        userIds.map((id) => {
          const account = byId.get(id);
          return [id, account && !account.banned && !account.locked ? account.verifiedEmail : null] as const;
        }),
      );
    },

    async send(message) {
      const result = await sendNotificationEmail(message);
      if (result.ok) return { ok: true, providerId: result.id };
      if (result.reason === "not-configured") return { ok: false, kind: "transient", statusCode: null, error: "email is not configured" };
      return {
        ok: false,
        kind: classifyProviderError(result.statusCode, result.name),
        statusCode: result.statusCode,
        error: result.name ?? "refused",
      };
    },

    // The row and one notification_deliveries row per attempt, together. Only the claim still
    // current is settled - still 'sending', and still at this worker's attempt number: a worker so
    // slow that its lease ran out and another took the row over cannot overwrite what that one found.
    async settle(row, settlement) {
      const sql = await notificationSql(env);
      const status = settlement.status;
      const error = status === "sent" ? null : settlement.error;
      const statusCode = status === "pending" || status === "failed" ? settlement.statusCode : null;
      await sql.query(
        `WITH settled AS (
           UPDATE notification_email_outbox
              SET status = $3, updated_at = now(), lease_until = NULL,
                  next_attempt_at = COALESCE($4::timestamptz, next_attempt_at),
                  provider_id = COALESCE($5, provider_id),
                  last_error = $6, last_status_code = $7,
                  sent_at = CASE WHEN $3 = 'sent' THEN now() ELSE sent_at END
            WHERE clerk_env = $1 AND id = $2::uuid AND status = 'sending' AND attempts = $11
            RETURNING id
         )
         INSERT INTO notification_deliveries
           (clerk_env, event_id, notification_id, recipient_user_id, channel, status, status_code, error, delivered_at)
         SELECT $1, $8, $9, $10, 'email', CASE WHEN $3 = 'sent' THEN 'sent' ELSE 'failed' END, $7, $6,
                CASE WHEN $3 = 'sent' THEN now() END
           FROM settled`,
        [
          env,
          row.id,
          status,
          status === "pending" ? new Date(settlement.retryAt).toISOString() : null,
          status === "sent" ? settlement.providerId : null,
          error,
          statusCode,
          row.eventId,
          row.notificationId ?? 0,
          row.userId,
          row.attempts,
        ],
      );
    },
  };
}

/** Sends what is due in this environment's outbox. Never throws. */
export async function drainEmail(env: ClerkEnv, limit?: number): Promise<DrainResult | null> {
  try {
    return await drainEmailOutbox(emailDeps(env), { limit });
  } catch (error) {
    console.error("[notifications] The email outbox could not be drained:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

/**
 * What notify() hands email over to: send it after the response (a server
 * action, a route), or straight away outside one. The rows are already
 * written; if this never runs, the next drain sends them.
 */
export function emailHandoff(env: ClerkEnv): { origin(): string; dispatch(ids: readonly string[]): void } {
  return {
    origin: siteOrigin,
    dispatch() {
      if (!emailSendingEnabled()) return;
      const task = async () => {
        await drainEmail(env);
      };
      try {
        after(task);
      } catch {
        void task();
      }
    },
  };
}
