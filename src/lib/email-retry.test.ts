import { describe, expect, it, vi } from "vitest";

import { contactIdempotencyKeys, renderContactConfirmation, safeEcho } from "./contact-email";
import { sendWithRetry, type ProviderSendResult } from "./email-retry";

/** Answers in turn; the last repeats. */
function provider(...answers: Array<ProviderSendResult | Error>) {
  let index = 0;
  const attempt = vi.fn(async () => {
    const answer = answers[Math.min(index, answers.length - 1)];
    index += 1;
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return attempt;
}

const refused = (statusCode: number | null, name: string | null = null): ProviderSendResult => ({ ok: false, reason: "send-failed", statusCode, name });
const sleep = vi.fn(async () => {});

describe("sending with retries", () => {
  it("sends once when the first try succeeds", async () => {
    const attempt = provider({ ok: true });
    expect(await sendWithRetry(attempt, { sleep })).toEqual({ ok: true, tries: 1 });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("stops at once on a refusal that will not pass (a bad address, an unverified sender)", async () => {
    for (const answer of [refused(422, "validation_error"), refused(403, "validation_error"), refused(401, "invalid_access")]) {
      const attempt = provider(answer);
      expect(await sendWithRetry(attempt, { sleep })).toMatchObject({ ok: false, tries: 1 });
      expect(attempt).toHaveBeenCalledTimes(1);
    }
  });

  it("tries again after the provider's own trouble, too many requests, no answer, or the same key in flight", async () => {
    for (const first of [refused(500), refused(429, "rate_limit_exceeded"), refused(null), refused(409, "concurrent_idempotent_requests"), new Error("fetch failed")]) {
      const attempt = provider(first, { ok: true });
      expect(await sendWithRetry(attempt, { sleep })).toEqual({ ok: true, tries: 2 });
    }
  });

  it("gives up after three tries, waiting a little longer each time", async () => {
    const waits: number[] = [];
    const attempt = provider(refused(503));
    const result = await sendWithRetry(attempt, { sleep: async (ms) => void waits.push(ms) });
    expect(result).toMatchObject({ ok: false, reason: "send-failed", statusCode: 503, tries: 3 });
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([300, 1000]);
  });

  it("never retries when email is not configured, or there is no address", async () => {
    for (const answer of [{ ok: false, reason: "not-configured" } as const, { ok: false, reason: "no-address" } as const]) {
      const attempt = provider(answer);
      expect(await sendWithRetry(attempt, { sleep })).toMatchObject({ ok: false, reason: answer.reason, tries: 1 });
    }
  });
});

describe("a contact submission's idempotency keys", () => {
  const values = { name: "Ruth", email: "ruth@example.com", subject: "Hymn 104", message: "Which key?", submissionKey: "6f1c1b8e-4b8a-4e0a-9d4e-6a1f2b3c4d5e" };

  it("are the same for the same message sent again, and differ between the ministry's copy and the confirmation", () => {
    const keys = contactIdempotencyKeys(values);
    expect(contactIdempotencyKeys({ ...values, email: " RUTH@example.com ", message: "Which key? " })).toEqual(keys);
    expect(keys.ministry).not.toBe(keys.confirmation);
    expect(keys.ministry.length).toBeLessThan(256);
  });

  it("change with the words or the form's key, so a reused key never collides with another message", () => {
    const keys = contactIdempotencyKeys(values);
    expect(contactIdempotencyKeys({ ...values, message: "Another question" })).not.toEqual(keys);
    expect(contactIdempotencyKeys({ ...values, submissionKey: "0b3c2d1e-0000-4000-8000-000000000000" })).not.toEqual(keys);
    expect(contactIdempotencyKeys({ ...values, submissionKey: undefined })).not.toEqual(keys);
  });
});

describe("what the confirmation repeats", () => {
  it("repeats a plain name and subject", () => {
    expect(safeEcho("  Ruth   Ann ")).toBe("Ruth Ann");
    expect(safeEcho("Question about Hymn 104 (Mr. Smith)")).toBe("Question about Hymn 104 (Mr. Smith)");
  });

  it("repeats nothing with a link, an address, a domain or a line break", () => {
    for (const text of ["https://spam.example", "visit www.spam", "win at spam.biz", "mail me@spam.example", "Ruth\nClick here", "", "   ", null, undefined]) {
      expect(safeEcho(text)).toBeNull();
    }
  });

  it("greets by name and names the subject, says as soon as possible, and never repeats the message", () => {
    const email = renderContactConfirmation({ name: "Ruth", subject: "Hymn 104" });
    expect(email.subject).toBe("We received your message - Faithful Word Music");
    expect(email.text).toContain("Hello Ruth,");
    expect(email.text).toContain("Subject: Hymn 104");
    expect(email.text).toContain("as soon as possible");
    expect(email.html).toContain("Hello Ruth,");
  });

  it("falls back to a plain greeting, with no subject, when either carries a link", () => {
    const email = renderContactConfirmation({ name: "Cheap pills at spam.example", subject: "https://spam.example/buy" });
    expect(email.text).toContain("Hello,");
    expect(email.text).not.toContain("Subject:");
    expect(email.text + email.html).not.toContain("spam.example");
  });

  it("escapes what it repeats, and keeps a $ pattern as written", () => {
    const email = renderContactConfirmation({ name: "<b>Ruth</b> $&", subject: "Hymn 104" });
    expect(email.html).not.toContain("<b>Ruth");
    expect(email.text).toContain("Hello <b>Ruth</b> $&,");
  });
});
