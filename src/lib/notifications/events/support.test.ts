import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES } from "@/lib/auth/permissions";

import { TEAM, notificationStore } from "../__fixtures__/notifications";
import type { Directory } from "../audience";
import { buildPushPayload } from "../push";
import { notify } from "../service";
import { currentAudience, supportAcknowledgment, supportNotice, type SupportEventFacts } from "./support";

const SECRET = "Pastor's private phone number is 555-0100";
const request: SupportEventFacts["request"] = { publicId: "R-7K3F9Q2M", submitterId: "user_john", assigneeId: null, category: "wrong_key" };
const event = (kind: SupportEventFacts["event"]["kind"], actorId: string, from: string | null = null, to: string | null = null, visibility: "public" | "internal" = "public") => ({
  id: `event-${kind}-${to}`,
  kind,
  actorId,
  from,
  to,
  visibility,
});

const recipients = async (facts: SupportEventFacts, team = TEAM) => {
  const { deps, rows } = notificationStore(team);
  const notice = supportNotice(facts);
  if (notice) await notify(notice, deps);
  return rows.map((row) => row.recipient).sort();
};

describe("support notifications", () => {
  it("tell every manager about a new request, but not its sender", async () => {
    // The director, the assistant (both Music Director) and the administrator manage requests.
    expect(await recipients({ event: event("created", "user_john"), request })).toEqual(["user_admin", "user_assistant", "user_director"]);
    expect(await recipients({ event: event("created", "user_director"), request: { ...request, submitterId: "user_director" } })).toEqual([
      "user_admin",
      "user_assistant",
    ]);
  });

  it("tell the submitter about a manager's reply, and the assignee (or every manager) about the submitter's", async () => {
    expect(await recipients({ event: event("replied", "user_director", "manager", "keep"), request })).toEqual(["user_john"]);
    expect(await recipients({ event: event("replied", "user_john", "submitter", "reply"), request: { ...request, assigneeId: "user_assistant" } })).toEqual([
      "user_assistant",
    ]);
    expect(await recipients({ event: event("replied", "user_john", "submitter", "reply"), request })).toEqual(["user_admin", "user_assistant", "user_director"]);
  });

  it("never tell anyone about an internal note, a priority or an in-progress change", async () => {
    expect(supportNotice({ event: event("replied", "user_director", "manager", "internal", "internal"), request })).toBeNull();
    expect(supportNotice({ event: event("priority_changed", "user_director", "normal", "urgent", "internal"), request })).toBeNull();
    expect(supportNotice({ event: event("waiting_changed", "user_director", "management", "submitter", "internal"), request })).toBeNull();
    expect(supportNotice({ event: event("status_changed", "user_director", "open", "in_progress"), request })).toBeNull();
  });

  it("never tell people about their own action", async () => {
    // The director replies to a request they sent themselves.
    expect(await recipients({ event: event("replied", "user_director", "manager", "keep"), request: { ...request, submitterId: "user_director" } })).toEqual([]);
    expect(await recipients({ event: event("assigned", "user_director", null, "user_director", "internal"), request })).toEqual([]);
  });

  it("carry nothing anyone wrote, and lead only to the request's page", () => {
    for (const kind of ["created", "resolved", "reopened", "closed"] as const) {
      const notice = supportNotice({ event: event(kind, "user_director"), request })!;
      const payload = buildPushPayload(
        { notificationId: 1, eventId: 1, userId: "user_john", title: notice.title, body: notice.body ?? "", actionUrl: notice.actionUrl ?? null, priority: "normal", tag: "t", folds: true },
        1,
      );
      expect(JSON.stringify([notice.title, notice.body, payload])).not.toContain(SECRET);
      expect(notice.body).toBe("R-7K3F9Q2M · Wrong key");
      expect(notice.actionUrl).toBe("/contact/requests/R-7K3F9Q2M");
      expect(notice.payload).toBeUndefined();
    }
  });

  it("are told once, however often the same event is told", async () => {
    const { deps, rows } = notificationStore(TEAM);
    const notice = supportNotice({ event: event("replied", "user_director", "manager", "request_info"), request })!;
    expect(notice.dedupeKey).toBe("support:event-replied-request_info");
    await notify(notice, deps);
    await notify(notice, deps);
    expect(rows).toHaveLength(1);
    expect(notice.event).toBe("support.info_requested");
  });

  it("email only people who switched email on for support requests", async () => {
    const { deps, outbox } = notificationStore(TEAM);
    await notify(supportNotice({ event: event("created", "user_john"), request })!, deps);
    expect(outbox).toHaveLength(0);
    await deps.setPreference({ userId: "user_director", category: "sheet_music_report", channel: "email", enabled: true });
    await notify(supportNotice({ event: { ...event("created", "user_john"), id: "another" }, request: { ...request, publicId: "R-AAAAAAAA" } })!, deps);
    expect(outbox.map((row) => row.userId)).toEqual(["user_director"]);
    expect(outbox[0].text).not.toContain(SECRET);
  });
});

describe("the submitter's acknowledgment", () => {
  const facts = { event: event("created", "user_john"), request: { ...request, title: "Hymn 104 is in the wrong key", status: "open" as const } };

  it("is made for a new request only - never for a reply, a reopening or any later change", () => {
    expect(supportAcknowledgment(facts)).not.toBeNull();
    const later: Array<ReturnType<typeof event>> = [
      event("replied", "user_john", "submitter", "reply"),
      event("replied", "user_john", "submitter", "reopen"),
      event("replied", "user_director", "manager", "keep"),
      event("replied", "user_director", "manager", "resolve"),
      event("assigned", "user_director", null, "user_assistant", "internal"),
      event("resolved", "user_director"),
      event("reopened", "user_director"),
      event("closed", "user_director"),
      event("status_changed", "user_director", "open", "in_progress"),
    ];
    for (const other of later) expect(supportAcknowledgment({ ...facts, event: other })).toBeNull();
  });

  it("goes to the submitter themself, with their title, the reference, the status and the request's page", () => {
    const notice = supportAcknowledgment(facts)!;
    expect(notice.event).toBe("support.request_received");
    expect(notice.audience).toEqual({ kind: "users", userIds: ["user_john"] });
    expect(notice.except).toBeUndefined();
    expect(notice.title).toBe("We received your support request");
    expect(notice.body).toContain("Request: Hymn 104 is in the wrong key");
    expect(notice.body).toContain("Reference: R-7K3F9Q2M");
    expect(notice.body).toContain("Status: Open");
    expect(notice.body).toContain("as soon as possible");
    expect(notice.actionUrl).toBe("/contact/requests/R-7K3F9Q2M");
    expect(notice.dedupeKey).toBe("support:event-created-null:ack");
  });

  it("is emailed by default, under its own category, with nothing in the bell or on a phone", async () => {
    const { deps, rows, outbox } = notificationStore(TEAM);
    await notify(supportAcknowledgment(facts)!, deps);
    expect(outbox.map((row) => row.userId)).toEqual(["user_john"]);
    expect(outbox[0].subject).toBe("We received your support request");
    expect(outbox[0].text).toMatch(/Open: https:\/\/[^\s]+\/contact\/requests\/R-7K3F9Q2M/);
    expect(rows.map((row) => [row.recipient, row.category, row.inApp])).toEqual([["user_john", "support_confirmation", false]]);
  });

  it("is not emailed to someone who turned it off", async () => {
    const { deps, outbox, rows } = notificationStore(TEAM);
    await deps.setPreference({ userId: "user_john", category: "support_confirmation", channel: "email", enabled: false });
    await notify(supportAcknowledgment(facts)!, deps);
    expect(outbox).toHaveLength(0);
    expect(rows).toHaveLength(0);
  });

  it("is recorded once beside the managers' notice, however often the event is told", async () => {
    const { deps, outbox } = notificationStore(TEAM);
    for (let time = 0; time < 3; time += 1) {
      await notify(supportNotice(facts)!, deps);
      await notify(supportAcknowledgment(facts)!, deps);
    }
    expect(outbox.map((row) => row.userId)).toEqual(["user_john"]);
  });
});

describe("who is told, checked again when it is told", () => {
  const directory = (overrides: Directory["overrides"] = new Map()): Directory => ({
    userRoles: new Map(Object.entries(TEAM.userRoles)),
    rolePermissions: new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]])),
    overrides,
    accountIds: [],
  });

  it("sends no acknowledgment to a submitter who can no longer use the Support Center", () => {
    const ack = supportAcknowledgment({ event: event("created", "user_john"), request: { ...request, title: "T", status: "open" } })!;
    expect(currentAudience(ack, directory(), request)).toBe(ack);
    const denied = directory(new Map([["user_john", [{ permission: "submit_support_requests", effect: "deny" as const }]]]));
    expect(currentAudience(ack, denied, request)).toBeNull();
  });

  it("drops a submitter who can no longer use the Support Center", () => {
    const notice = supportNotice({ event: event("resolved", "user_director"), request })!;
    expect(currentAudience(notice, directory(), request)).toBe(notice);
    const denied = directory(new Map([["user_john", [{ permission: "submit_support_requests", effect: "deny" as const }]]]));
    expect(currentAudience(notice, denied, request)).toBeNull();
  });

  it("sends a reply meant for an assignee who no longer manages requests to the managers instead", () => {
    const assigned = { ...request, assigneeId: "user_mary" };
    const replyNotice = supportNotice({ event: event("replied", "user_john", "submitter", "reply"), request: assigned })!;
    expect(currentAudience(replyNotice, directory(), assigned)?.audience).toEqual({ kind: "permission", permission: "manage_support_requests" });
    const assignNotice = supportNotice({ event: event("assigned", "user_director", null, "user_mary", "internal"), request })!;
    expect(currentAudience(assignNotice, directory(), request)).toBeNull();
  });
});
