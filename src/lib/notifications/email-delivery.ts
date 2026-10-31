/**
 * Email delivery: sending what the outbox holds (notification_email_outbox,
 * written with each notification - store.ts). The rules live here and take
 * their database and provider as `deps`, so every one is tested without
 * either (email-delivery.test.ts); email-store.ts supplies the real ones.
 *
 *   claim      a worker takes rows that are due - new, waiting to be tried
 *              again, or taken by a worker that never finished - and holds
 *              them for a short lease. Two workers never hold the same row.
 *   address    looked up when sending, from the person's account: their
 *              primary address, and only once it is verified. Nobody else's,
 *              and never one stored with the row.
 *   send       with the row's ID as the provider's idempotency key, so the
 *              same row sent twice - its first answer lost - is delivered once.
 *   settle     sent; or tried again later (a failure that may pass); or
 *              failed for good (one that will not, or too many tries);
 *              or skipped (no verified address).
 *
 * The provider remembers an idempotency key for a day, so a row is never
 * sent once it is more than EXPIRY_HOURS old: an answer lost that long ago
 * cannot be told from no answer, and sending again could deliver it twice.
 * Such a row is given up as "unknown" (it may well have been delivered),
 * never as "failed" (which always means it was not); a row that expired
 * before any attempt was made is "failed". The outcomes are therefore:
 * sent (accepted by the provider), failed, skipped, superseded, unknown, or
 * still pending.
 * Delivery is therefore at most once per row, and nearly always exactly once
 * - never claimed as more. A failure here never touches the change the
 * notification was about: that was saved long before.
 */

/** Minutes before each retry: after the 1st failure, the 2nd, ... */
export const RETRY_MINUTES = [1, 5, 30, 120, 720] as const;
/** How long a worker holds the rows it took. */
export const LEASE_SECONDS = 120;
/** Older than this, a row is not sent at all (see above). */
export const EXPIRY_HOURS = 23;

export interface OutboxRow {
  id: string;
  eventId: number;
  notificationId: number | null;
  userId: string;
  subject: string;
  text: string;
  html: string;
  /** Including the one just started. */
  attempts: number;
  maxAttempts: number;
}

export type ProviderOutcome =
  | { ok: true; providerId: string | null }
  | { ok: false; kind: "transient" | "permanent"; statusCode: number | null; error: string };

export type Settlement =
  | { status: "sent"; providerId: string | null }
  | { status: "pending"; retryAt: number; error: string; statusCode: number | null }
  | { status: "failed"; error: string; statusCode: number | null }
  | { status: "skipped"; error: string };

export interface EmailDeps {
  /** Whether email may be sent here at all (configured, and switched on for this deployment). */
  enabled(): boolean;
  /** Takes up to `limit` due rows, and gives up rows too old to send safely. */
  claim(limit: number): Promise<OutboxRow[]>;
  /** Each person's verified primary address, or null. Throws when accounts cannot be read. */
  addresses(userIds: readonly string[]): Promise<Map<string, string | null>>;
  send(message: { to: string; subject: string; text: string; html: string; idempotencyKey: string }): Promise<ProviderOutcome>;
  settle(row: OutboxRow, settlement: Settlement): Promise<void>;
  now(): number;
}

/**
 * Whether a provider's refusal may pass: no answer, too many requests, the
 * provider's own trouble, or the same key still being handled - try again.
 * Anything else it refused (a bad address, a sender it will not send for) -
 * the same request will be refused again.
 */
export function classifyProviderError(statusCode: number | null, name: string | null): "transient" | "permanent" {
  if (statusCode === null) return "transient";
  if (name === "concurrent_idempotent_requests" || name === "rate_limit_exceeded") return "transient";
  if (name === "daily_quota_exceeded" || name === "monthly_quota_exceeded") return "transient";
  if (statusCode === 429 || statusCode >= 500) return "transient";
  return "permanent";
}

/** What becomes of a row after one attempt. */
export function settlementFor(row: Pick<OutboxRow, "attempts" | "maxAttempts">, outcome: ProviderOutcome, now: number): Settlement {
  if (outcome.ok) return { status: "sent", providerId: outcome.providerId };
  if (outcome.kind === "permanent") return { status: "failed", error: outcome.error, statusCode: outcome.statusCode };
  if (row.attempts >= row.maxAttempts) {
    return { status: "failed", error: `gave up after ${row.attempts} attempts: ${outcome.error}`, statusCode: outcome.statusCode };
  }
  const wait = RETRY_MINUTES[Math.min(row.attempts, RETRY_MINUTES.length) - 1] ?? RETRY_MINUTES.at(-1)!;
  return { status: "pending", retryAt: now + wait * 60_000, error: outcome.error, statusCode: outcome.statusCode };
}

export interface DrainResult {
  sent: number;
  retrying: number;
  failed: number;
  skipped: number;
  /** Email is not switched on here: nothing was taken. */
  held: boolean;
}

/**
 * Sends what is due, up to `limit` rows. Never throws for one row's sake:
 * each is settled on its own. Safe to run anywhere at any time, as often as
 * wanted - after a notification, from the daily job, side by side.
 */
export async function drainEmailOutbox(deps: EmailDeps, options: { limit?: number } = {}): Promise<DrainResult> {
  const result: DrainResult = { sent: 0, retrying: 0, failed: 0, skipped: 0, held: false };
  if (!deps.enabled()) return { ...result, held: true };

  const rows = await deps.claim(options.limit ?? 20);
  if (rows.length === 0) return result;

  let addresses: Map<string, string | null> | null = null;
  try {
    addresses = await deps.addresses([...new Set(rows.map((row) => row.userId))]);
  } catch {
    addresses = null;
  }

  for (const row of rows) {
    let settlement: Settlement;
    if (!addresses) {
      // Accounts could not be read: nothing was sent, so try again later.
      settlement = settlementFor(row, { ok: false, kind: "transient", statusCode: null, error: "accounts unavailable" }, deps.now());
    } else {
      const to = addresses.get(row.userId) ?? null;
      if (!to) {
        settlement = { status: "skipped", error: "no verified email address" };
      } else {
        let outcome: ProviderOutcome;
        try {
          outcome = await deps.send({ to, subject: row.subject, text: row.text, html: row.html, idempotencyKey: row.id });
        } catch (error) {
          outcome = { ok: false, kind: "transient", statusCode: null, error: error instanceof Error ? error.name : "unknown error" };
        }
        settlement = settlementFor(row, outcome, deps.now());
      }
    }
    try {
      await deps.settle(row, settlement);
    } catch (error) {
      // Not settled: its lease runs out and it is tried again, with the same idempotency key.
      console.error("[notifications] An email's outcome could not be recorded:", error instanceof Error ? error.message : "unknown error");
    }
    if (settlement.status === "sent") result.sent += 1;
    else if (settlement.status === "pending") result.retrying += 1;
    else if (settlement.status === "failed") result.failed += 1;
    else result.skipped += 1;
  }
  return result;
}
