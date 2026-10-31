import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProviderSendResult } from "@/lib/email-retry";

/**
 * POST /api/contact with BotID and Resend replaced: what is sent, with which
 * idempotency keys, and what the visitor is told when either email fails.
 */

const resend = vi.hoisted(() => ({
  sendContactEmail: vi.fn<(values: unknown, key: string) => Promise<ProviderSendResult>>(),
  sendContactConfirmation: vi.fn<(values: unknown, key: string) => Promise<ProviderSendResult>>(),
}));
vi.mock("botid/server", () => ({ checkBotId: async () => ({ isBot: false }) }));
vi.mock("@/lib/resend", () => resend);
// The waits between tries are real timers in the route; keep them instant here.
vi.mock("@/lib/email-retry", async (original) => {
  const actual = await original<typeof import("@/lib/email-retry")>();
  return {
    ...actual,
    sendWithRetry: (attempt: () => Promise<ProviderSendResult>) => actual.sendWithRetry(attempt, { sleep: async () => {} }),
  };
});

const { POST } = await import("./route");

const body = {
  name: "Ruth",
  email: "ruth@example.com",
  subject: "Hymn 104",
  message: "Which key is it in?",
  submissionKey: "6f1c1b8e-4b8a-4e0a-9d4e-6a1f2b3c4d5e",
};
const post = (payload: unknown) =>
  POST(new Request("http://localhost/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));

beforeEach(() => {
  resend.sendContactEmail.mockReset().mockResolvedValue({ ok: true });
  resend.sendContactConfirmation.mockReset().mockResolvedValue({ ok: true });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/contact", () => {
  it("sends the ministry's copy, then the visitor's confirmation, each with its own idempotency key", async () => {
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const [, ministryKey] = resend.sendContactEmail.mock.calls[0];
    const [, confirmationKey] = resend.sendContactConfirmation.mock.calls[0];
    expect(ministryKey).toMatch(/^contact-ministry\//);
    expect(confirmationKey).toMatch(/^contact-confirmation\//);
  });

  it("uses the same keys when the same message is sent again, so it is delivered once", async () => {
    await post(body);
    await post(body);
    const keys = resend.sendContactEmail.mock.calls.map(([, key]) => key);
    expect(keys[0]).toBe(keys[1]);
    const confirmations = resend.sendContactConfirmation.mock.calls.map(([, key]) => key);
    expect(confirmations[0]).toBe(confirmations[1]);
  });

  it("still tells the visitor the message was sent when only the confirmation fails", async () => {
    resend.sendContactConfirmation.mockResolvedValue({ ok: false, reason: "send-failed", statusCode: 422, name: "validation_error" });
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(resend.sendContactConfirmation).toHaveBeenCalledTimes(1);
  });

  it("retries a confirmation that may pass, with the same key", async () => {
    resend.sendContactConfirmation
      .mockResolvedValueOnce({ ok: false, reason: "send-failed", statusCode: 500, name: "application_error" })
      .mockResolvedValueOnce({ ok: true });
    expect((await post(body)).status).toBe(200);
    const keys = resend.sendContactConfirmation.mock.calls.map(([, key]) => key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("reports a failure, and sends no confirmation, when the ministry's copy cannot be sent", async () => {
    resend.sendContactEmail.mockResolvedValue({ ok: false, reason: "send-failed", statusCode: 503, name: "application_error" });
    const response = await post(body);
    expect(response.status).toBe(502);
    expect(resend.sendContactEmail).toHaveBeenCalledTimes(3);
    expect(resend.sendContactConfirmation).not.toHaveBeenCalled();

    resend.sendContactEmail.mockReset().mockResolvedValue({ ok: false, reason: "not-configured" });
    expect((await post(body)).status).toBe(503);
  });

  it("sends nothing for a filled honeypot or an invalid message", async () => {
    expect((await post({ ...body, website: "https://spam.example" })).status).toBe(200);
    expect((await post({ ...body, email: "not an address" })).status).toBe(400);
    expect(resend.sendContactEmail).not.toHaveBeenCalled();
    expect(resend.sendContactConfirmation).not.toHaveBeenCalled();
  });

  it("drops a malformed form key rather than refusing the message", async () => {
    expect((await post({ ...body, submissionKey: "not-a-uuid" })).status).toBe(200);
    expect(resend.sendContactEmail).toHaveBeenCalledTimes(1);
  });
});
