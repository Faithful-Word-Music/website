import { describe, expect, it } from "vitest";

import {
  classifyProviderError,
  drainEmailOutbox,
  EXPIRY_HOURS,
  LEASE_SECONDS,
  RETRY_MINUTES,
  settlementFor,
  type EmailDeps,
  type OutboxRow,
  type ProviderOutcome,
  type Settlement,
} from "./email-delivery";
import { renderNotificationEmail } from "./email";

/**
 * The outbox and the provider, in memory, behaving as the real ones do
 * (email-store.ts; Resend): a claim takes due rows for a lease, a settle only
 * settles a row still held, and the provider delivers each idempotency key
 * once. Nothing here can reach a real inbox.
 */
function world(options: { env?: "development" | "production" } = {}) {
  let clock = Date.parse("2026-11-01T12:00:00Z");
  type Row = OutboxRow & {
    env: string;
    status: "pending" | "sending" | "sent" | "failed" | "skipped" | "unknown";
    nextAttemptAt: number;
    leaseUntil: number | null;
    createdAt: number;
    error: string | null;
  };
  const rows: Row[] = [];
  /** Every email the provider accepted, by idempotency key, and how many times it was asked. */
  const delivered = new Map<string, number>();
  const asked: string[] = [];
  const answers: ProviderOutcome[] = [];
  const addresses = new Map<string, string | null>([["user_mary", "mary@example.test"], ["user_john", null]]);
  const state = { enabled: true, settleFails: false, accountsDown: false };
  const env = options.env ?? "production";

  const add = (userId: string, extra: Partial<Row> = {}) => {
    const row: Row = {
      id: `row-${rows.length + 1}`,
      eventId: 1,
      notificationId: 1,
      userId,
      subject: "You're leading song 5 at Sunday Evening",
      text: "text",
      html: "<p>html</p>",
      attempts: 0,
      maxAttempts: 5,
      env,
      status: "pending",
      nextAttemptAt: clock,
      leaseUntil: null,
      createdAt: clock,
      error: null,
      ...extra,
    };
    rows.push(row);
    return row;
  };

  const deps = (forEnv: string = env): EmailDeps => ({
    enabled: () => state.enabled,
    now: () => clock,
    async claim(limit) {
      for (const row of rows) {
        if (row.env !== forEnv) continue;
        const stale = row.createdAt < clock - EXPIRY_HOURS * 3_600_000;
        if (stale && (row.status === "pending" || (row.status === "sending" && row.leaseUntil! < clock))) {
          row.error = row.status === "sending" ? "outcome unknown; not sent again" : "expired before it could be sent";
          row.status = row.status === "sending" ? "unknown" : "failed";
        }
      }
      const due = rows
        .filter((row) => row.env === forEnv)
        .filter((row) => (row.status === "pending" && row.nextAttemptAt <= clock) || (row.status === "sending" && row.leaseUntil! < clock))
        .slice(0, limit);
      for (const row of due) {
        row.status = "sending";
        row.attempts += 1;
        row.leaseUntil = clock + LEASE_SECONDS * 1000;
      }
      return due.map((row) => ({ ...row }));
    },
    async addresses(userIds) {
      if (state.accountsDown) throw new Error("accounts unavailable");
      return new Map(userIds.map((id) => [id, addresses.get(id) ?? null]));
    },
    async send(message) {
      asked.push(message.idempotencyKey);
      const answer = answers.shift() ?? { ok: true, providerId: `re_${message.idempotencyKey}` };
      // The provider delivers each idempotency key once, however often it is asked.
      if (answer.ok) delivered.set(message.idempotencyKey, 1);
      return answer;
    },
    async settle(row, settlement: Settlement) {
      if (state.settleFails) throw new Error("the database went away");
      const stored = rows.find((item) => item.id === row.id)!;
      // As the database does: only the claim still current (its attempt number) is settled.
      if (stored.status !== "sending" || stored.attempts !== row.attempts) return;
      stored.status = settlement.status === "pending" ? "pending" : settlement.status;
      stored.leaseUntil = null;
      if (settlement.status === "pending") stored.nextAttemptAt = settlement.retryAt;
      stored.error = settlement.status === "sent" ? null : settlement.error;
    },
  });

  return {
    rows,
    add,
    deps,
    delivered,
    asked,
    answers,
    addresses,
    state,
    advance: (minutes: number) => {
      clock += minutes * 60_000;
    },
  };
}

describe("sending the outbox", () => {
  it("sends what is due, once, to the person's verified address", async () => {
    const w = world();
    w.add("user_mary");
    expect(await drainEmailOutbox(w.deps())).toEqual({ sent: 1, retrying: 0, failed: 0, skipped: 0, held: false });
    expect(w.rows[0].status).toBe("sent");
    expect(w.delivered.get("row-1")).toBe(1);
    // Draining again sends nothing: it is done.
    expect(await drainEmailOutbox(w.deps())).toMatchObject({ sent: 0 });
    expect(w.asked).toEqual(["row-1"]);
  });

  it("holds everything where email is not switched on - nothing is taken, nothing sent", async () => {
    const w = world();
    w.add("user_mary");
    w.state.enabled = false;
    expect(await drainEmailOutbox(w.deps())).toMatchObject({ held: true, sent: 0 });
    expect(w.rows[0]).toMatchObject({ status: "pending", attempts: 0 });
    expect(w.asked).toEqual([]);
  });

  it("skips someone with no verified address, safely", async () => {
    const w = world();
    w.add("user_john");
    w.add("user_unknown");
    expect(await drainEmailOutbox(w.deps())).toMatchObject({ skipped: 2, sent: 0 });
    expect(w.rows.map((row) => row.status)).toEqual(["skipped", "skipped"]);
    expect(w.asked).toEqual([]);
  });

  it("tries again later after a failure that may pass, with growing waits", async () => {
    const w = world();
    w.add("user_mary");
    w.answers.push({ ok: false, kind: "transient", statusCode: 503, error: "application_error" });
    expect(await drainEmailOutbox(w.deps())).toMatchObject({ retrying: 1 });
    expect(w.rows[0].status).toBe("pending");
    // Not before its wait is over.
    expect(await drainEmailOutbox(w.deps())).toMatchObject({ sent: 0, retrying: 0 });
    w.advance(RETRY_MINUTES[0]);
    expect(await drainEmailOutbox(w.deps())).toMatchObject({ sent: 1 });
    expect(w.asked).toEqual(["row-1", "row-1"]);
  });

  it("fails for good on a refusal that will not pass", async () => {
    const w = world();
    w.add("user_mary");
    w.answers.push({ ok: false, kind: "permanent", statusCode: 422, error: "validation_error" });
    expect(await drainEmailOutbox(w.deps())).toMatchObject({ failed: 1 });
    w.advance(24 * 60);
    expect(await drainEmailOutbox(w.deps())).toMatchObject({ sent: 0 });
    expect(w.rows[0]).toMatchObject({ status: "failed", error: "validation_error" });
  });

  it("gives up after its last attempt", async () => {
    const w = world();
    w.add("user_mary", { maxAttempts: 3 });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      w.answers.push({ ok: false, kind: "transient", statusCode: null, error: "network" });
      await drainEmailOutbox(w.deps());
      w.advance(RETRY_MINUTES[attempt]);
    }
    expect(w.rows[0].status).toBe("failed");
    expect(w.rows[0].error).toMatch(/gave up after 3 attempts/);
    expect(w.asked).toHaveLength(3);
  });

  it("never lets two workers send the same row", async () => {
    const w = world();
    w.add("user_mary");
    w.add("user_mary");
    const [one, two] = await Promise.all([drainEmailOutbox(w.deps()), drainEmailOutbox(w.deps())]);
    expect(one.sent + two.sent).toBe(2);
    expect(w.asked.sort()).toEqual(["row-1", "row-2"]);
  });

  it("sends again with the same key when the provider's answer was lost - and it is delivered once", async () => {
    const w = world();
    w.add("user_mary");
    // Sent, but the outcome could not be recorded: the row stays taken.
    w.state.settleFails = true;
    await drainEmailOutbox(w.deps());
    expect(w.rows[0].status).toBe("sending");
    w.state.settleFails = false;
    // Its lease runs out; the next worker takes it and sends it again, with the same idempotency key.
    w.advance(LEASE_SECONDS / 60 + 1);
    await drainEmailOutbox(w.deps());
    expect(w.asked).toEqual(["row-1", "row-1"]);
    expect(w.delivered.size).toBe(1);
    expect(w.rows[0].status).toBe("sent");
  });

  it("lets a worker whose lease ran out record nothing over the worker that took its row", async () => {
    const w = world();
    w.add("user_mary");
    const slow = w.deps();
    const [claimed] = await slow.claim(10);
    // Its lease runs out mid-send; another worker takes the row over and delivers it.
    w.advance(LEASE_SECONDS / 60 + 1);
    expect(await drainEmailOutbox(w.deps())).toMatchObject({ sent: 1 });
    // The slow one's late answer (a refusal) changes nothing.
    await slow.settle(claimed, { status: "failed", error: "validation_error", statusCode: 422 });
    expect(w.rows[0]).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("lets a stale worker's late success record nothing over a newer claim's failure either", async () => {
    const w = world();
    w.add("user_mary");
    const slow = w.deps();
    const [claimed] = await slow.claim(10);
    w.advance(LEASE_SECONDS / 60 + 1);
    // The newer claim is refused for good.
    w.answers.push({ ok: false, kind: "permanent", statusCode: 422, error: "validation_error" });
    expect(await drainEmailOutbox(w.deps())).toMatchObject({ failed: 1 });
    await slow.settle(claimed, { status: "sent", providerId: "re_late" });
    expect(w.rows[0]).toMatchObject({ status: "failed", attempts: 2, error: "validation_error" });
  });

  it("does not send a row too old for the provider to recognise its key - it may have gone already", async () => {
    const w = world();
    w.add("user_mary");
    w.state.settleFails = true;
    await drainEmailOutbox(w.deps());
    w.state.settleFails = false;
    w.advance(EXPIRY_HOURS * 60 + 1);
    expect(await drainEmailOutbox(w.deps())).toMatchObject({ sent: 0 });
    expect(w.rows[0]).toMatchObject({ status: "unknown", error: "outcome unknown; not sent again" });
    expect(w.asked).toEqual(["row-1"]);
  });

  it("tries again later when accounts cannot be read, sending nothing to a guessed address", async () => {
    const w = world();
    w.add("user_mary");
    w.state.accountsDown = true;
    expect(await drainEmailOutbox(w.deps())).toMatchObject({ retrying: 1 });
    expect(w.asked).toEqual([]);
  });

  it("works on its own environment's rows only", async () => {
    const w = world({ env: "development" });
    w.add("user_mary");
    expect(await drainEmailOutbox(w.deps("production"))).toMatchObject({ sent: 0 });
    expect(w.rows[0].status).toBe("pending");
  });
});

describe("the rules behind it", () => {
  it("tells a failure that may pass from one that will not", () => {
    expect(classifyProviderError(null, null)).toBe("transient");
    expect(classifyProviderError(429, "rate_limit_exceeded")).toBe("transient");
    expect(classifyProviderError(500, "internal_server_error")).toBe("transient");
    expect(classifyProviderError(409, "concurrent_idempotent_requests")).toBe("transient");
    expect(classifyProviderError(422, "validation_error")).toBe("permanent");
    expect(classifyProviderError(403, "invalid_from_address")).toBe("permanent");
  });

  it("waits longer after each failure", () => {
    const now = 0;
    const fail: ProviderOutcome = { ok: false, kind: "transient", statusCode: 503, error: "x" };
    const waits = [1, 2, 3, 4].map((attempts) => {
      const settlement = settlementFor({ attempts, maxAttempts: 5 }, fail, now);
      return settlement.status === "pending" ? settlement.retryAt / 60_000 : null;
    });
    expect(waits).toEqual([...RETRY_MINUTES.slice(0, 4)]);
    expect(settlementFor({ attempts: 5, maxAttempts: 5 }, fail, now).status).toBe("failed");
  });
});

describe("the email itself", () => {
  const email = renderNotificationEmail({
    title: "You're leading songs 2 and 5 at Sunday Evening",
    body: "Sunday, November 8: you have been assigned to lead songs 2 and 5. The song list has not been published yet.",
    actionUrl: "/dashboard",
    categoryName: "Song leading",
    origin: "https://preview.example.test/",
  });

  it("says what the notification says, with an absolute link and a way to change what is sent", () => {
    expect(email.subject).toBe("You're leading songs 2 and 5 at Sunday Evening");
    expect(email.text).toContain("Open: https://preview.example.test/dashboard");
    expect(email.text).toContain("https://preview.example.test/notifications/settings");
    expect(email.html).toContain('href="https://preview.example.test/dashboard"');
    expect(email.html).toContain("leading songs 2 and 5 at Sunday Evening");
  });

  it("escapes what it is given, and links nowhere off the site", () => {
    const hostile = renderNotificationEmail({
      title: "<script>x</script>",
      body: "<img src=x onerror=alert(1)>",
      actionUrl: "//elsewhere.example",
      categoryName: "Song leading",
      origin: "https://faithfulwordmusic.com",
    });
    expect(hostile.html).not.toContain("<script>");
    expect(hostile.html).not.toContain("<img");
    expect(hostile.html).not.toContain("elsewhere.example");
  });
});
