import { describe, expect, it } from "vitest";

import { supportAttention } from "./providers";

const none = { awaitingMe: 0, needsAction: 0, unassigned: 0, assignedToMe: 0 };

describe("support requests in Needs your attention", () => {
  it("says nothing when nothing waits, or the counts could not be read", () => {
    expect(supportAttention(none, true)).toEqual([]);
    expect(supportAttention(null, true)).toEqual([]);
  });

  it("asks a member to reply to what the ministry asked them", () => {
    const [item] = supportAttention({ ...none, awaitingMe: 2 }, false);
    expect(item).toMatchObject({ id: "support:needs-reply", href: "/contact?view=mine" });
    expect(item.title).toContain("2");
  });

  it("shows managers the untaken and the waiting requests as one item each, and never to a member", () => {
    const counts = { ...none, needsAction: 3, unassigned: 1, assignedToMe: 1 };
    expect(supportAttention(counts, true).map((item) => item.id)).toEqual(["support:unassigned", "support:needs-action"]);
    expect(supportAttention(counts, true)[1].href).toBe("/contact?view=manage&queue=assigned_to_me");
    expect(supportAttention(counts, false)).toEqual([]);
  });
});
