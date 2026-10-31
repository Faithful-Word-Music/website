/**
 * Trying an email again, briefly, inside the request that sends it - for the
 * public contact form, which keeps nothing in the database to retry from
 * later. (Notifications and support acknowledgments retry from their outbox
 * over hours instead: src/lib/notifications/email-delivery.ts.)
 *
 * Only a failure that may pass is tried again - no answer, too many requests,
 * the provider's own trouble, the same idempotency key still in flight - by
 * the same rule the outbox uses (classifyProviderError). A refusal that will
 * not pass (a bad address, a sender not verified) stops at once. Every try
 * carries the same idempotency key, so a try whose answer was lost is never
 * delivered twice.
 *
 * Pure: the waiting is passed in, so the tests do not wait.
 */

import { classifyProviderError } from "@/lib/notifications/email-delivery";

/** What one try to send gave. */
export type ProviderSendResult =
  | { ok: true }
  | { ok: false; reason: "not-configured" }
  /** There was no address to send to: nothing was tried. */
  | { ok: false; reason: "no-address" }
  /** Refused, or not reached at all (statusCode null). */
  | { ok: false; reason: "send-failed"; statusCode: number | null; name: string | null };

export interface RetryOptions {
  /** Tries in all, the first included. */
  tries?: number;
  /** The wait before the 2nd try, the 3rd, ... (the last repeats). */
  delaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}

export const CONTACT_RETRY = { tries: 3, delaysMs: [300, 1000] } as const;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Whether a failed try is worth another. */
export function isRetryable(result: ProviderSendResult): boolean {
  return !result.ok && result.reason === "send-failed" && classifyProviderError(result.statusCode, result.name) === "transient";
}

/**
 * Tries `attempt` until it succeeds, fails for good, or the tries run out.
 * A try that throws counts as one not reached. Never throws.
 */
export async function sendWithRetry(
  attempt: () => Promise<ProviderSendResult>,
  options: RetryOptions = {},
): Promise<ProviderSendResult & { tries: number }> {
  const tries = Math.max(1, options.tries ?? CONTACT_RETRY.tries);
  const delays = options.delaysMs ?? CONTACT_RETRY.delaysMs;
  const sleep = options.sleep ?? realSleep;

  let result: ProviderSendResult = { ok: false, reason: "send-failed", statusCode: null, name: null };
  for (let n = 1; n <= tries; n += 1) {
    try {
      result = await attempt();
    } catch (error) {
      result = { ok: false, reason: "send-failed", statusCode: null, name: error instanceof Error ? error.name : null };
    }
    if (!isRetryable(result) || n === tries) return { ...result, tries: n };
    await sleep(delays[Math.min(n - 1, delays.length - 1)] ?? 0);
  }
  return { ...result, tries };
}
