import { describe, expect, it } from "vitest";

import { renderNotificationEmail } from "@/lib/notifications/email";
import { supportAcknowledgment } from "@/lib/notifications/events/support";

/**
 * The Support Center's acknowledgment as it reaches an inbox: a real
 * reference, a link to the request's own (signed-in) page on this site, and
 * no promise of a response time. (Who gets it, once, is in support.test.ts.)
 */

const facts = {
  event: { id: "event-1", kind: "created" as const, actorId: "user_john", from: null, to: null, visibility: "public" as const },
  request: {
    publicId: "R-7K3F9Q2M",
    submitterId: "user_john",
    assigneeId: null,
    category: "missing_sheet_music" as const,
    title: "Hymn 104 is missing",
    status: "open" as const,
  },
};

describe("the support acknowledgment email", () => {
  const notice = supportAcknowledgment(facts)!;
  const email = renderNotificationEmail({
    title: notice.title,
    body: notice.body ?? "",
    actionUrl: notice.actionUrl ?? null,
    categoryName: "Support request confirmations",
    origin: "https://faithfulwordmusic.com",
  });

  it("carries the request's reference and links to its signed-in page", () => {
    expect(email.text).toContain("R-7K3F9Q2M");
    expect(email.html).toContain("https://faithfulwordmusic.com/contact/requests/R-7K3F9Q2M");
  });

  it("promises no response time", () => {
    for (const text of [email.text, notice.body ?? ""]) {
      expect(text).not.toMatch(/\bwithin\b|\b\d+\s*(hours?|days?|business days?)\b|\b24\b/i);
    }
  });
});
