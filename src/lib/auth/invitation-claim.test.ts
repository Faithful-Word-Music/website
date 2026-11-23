import { describe, expect, it, vi } from "vitest";

import {
  decisionClaimable,
  legacyInvitationMatch,
  runInvitationClaim,
  type ClaimDecision,
  type ClaimDeps,
  type ClaimInvitation,
} from "./invitation-claim";

const NOW = 1_800_000_000_000;
const EMAIL = "a@example.com";

const decision = (over: Partial<ClaimDecision> = {}): ClaimDecision => ({
  id: "dec_1",
  email: EMAIL,
  status: "open",
  invitationId: "inv_1",
  expiresAt: NOW + 1000,
  ...over,
});
const invitation = (over: Partial<ClaimInvitation> = {}): ClaimInvitation => ({
  id: "inv_1",
  email: EMAIL,
  status: "accepted",
  createdAt: NOW - 5000,
  ...over,
});

describe("decisionClaimable", () => {
  const claimable = (d: ClaimDecision, i: ClaimInvitation | null = invitation(), emails = [EMAIL]) =>
    decisionClaimable({ decision: d, invitation: i, verifiedEmails: emails, now: NOW });

  it("accepts the exact accepted invitation for a verified address", () => {
    expect(claimable(decision())).toBe(true);
  });

  it.each(["consumed", "revoked", "expired", "superseded", "review"] as const)("refuses a %s decision", (status) => {
    expect(claimable(decision({ status }))).toBe(false);
  });

  it("refuses an expired decision", () => {
    expect(claimable(decision({ expiresAt: NOW }))).toBe(false);
  });

  it("refuses a decision never bound to an invitation", () => {
    expect(claimable(decision({ invitationId: null }))).toBe(false);
  });

  it("refuses when the address is on the account but not verified", () => {
    expect(claimable(decision(), invitation(), ["other@example.com"])).toBe(false);
  });

  it("refuses a different invitation", () => {
    expect(claimable(decision(), invitation({ id: "inv_2" }))).toBe(false);
  });

  it.each(["pending", "revoked", "expired"] as const)("refuses a Clerk invitation that is %s", (status) => {
    expect(claimable(decision(), invitation({ status }))).toBe(false);
  });

  it("refuses an invitation sent to another address", () => {
    expect(claimable(decision(), invitation({ email: "b@example.com" }))).toBe(false);
  });

  it("refuses when the invitation cannot be found", () => {
    expect(claimable(decision(), null)).toBe(false);
  });
});

describe("legacyInvitationMatch", () => {
  const match = (over: Partial<Parameters<typeof legacyInvitationMatch>[0]> = {}) =>
    legacyInvitationMatch({
      rows: [{ invitationId: "inv_1", email: EMAIL }],
      invitations: [invitation()],
      verifiedEmails: [EMAIL],
      userCreatedAt: NOW,
      ...over,
    });

  it("matches one accepted invitation for a verified address", () => {
    expect(match()).toBe("inv_1");
  });

  it("ignores a pending row for an unverified address", () => {
    expect(match({ verifiedEmails: ["other@example.com"] })).toBeNull();
  });

  it.each(["pending", "revoked", "expired"] as const)("refuses a %s invitation", (status) => {
    expect(match({ invitations: [invitation({ status })] })).toBeNull();
  });

  it("refuses when a newer invitation exists for the address", () => {
    expect(match({ invitations: [invitation(), invitation({ id: "inv_2", status: "revoked", createdAt: NOW - 1000 })] })).toBeNull();
  });

  it("refuses an invitation created after the account", () => {
    expect(match({ userCreatedAt: NOW - 9000 })).toBeNull();
  });

  it("refuses when two invitations could apply", () => {
    expect(
      match({
        rows: [{ invitationId: "inv_1", email: EMAIL }, { invitationId: "inv_2", email: "b@example.com" }],
        invitations: [invitation(), invitation({ id: "inv_2", email: "b@example.com" })],
        verifiedEmails: [EMAIL, "b@example.com"],
      }),
    ).toBeNull();
  });
});

describe("runInvitationClaim", () => {
  function deps(over: Partial<ClaimDeps> = {}): ClaimDeps {
    return {
      installed: true,
      now: () => NOW,
      currentUser: vi.fn(async () => ({ verifiedEmails: [EMAIL], decisionId: "dec_1", createdAt: NOW })),
      findDecision: vi.fn(async () => decision()),
      invitationsFor: vi.fn(async () => [invitation()]),
      consumeDecision: vi.fn(async () => true),
      legacyRows: vi.fn(async () => []),
      applyLegacy: vi.fn(async () => 1),
      recordCheck: vi.fn(async () => {}),
      ...over,
    };
  }

  it("consumes a valid decision", async () => {
    const d = deps();
    expect(await runInvitationClaim(d)).toBe(true);
    expect(d.consumeDecision).toHaveBeenCalledWith("dec_1", "inv_1");
  });

  it("sends an unknown decision ID to admin review, granting nothing", async () => {
    const d = deps({ findDecision: vi.fn(async () => null) });
    expect(await runInvitationClaim(d)).toBe(false);
    expect(d.consumeDecision).not.toHaveBeenCalled();
    expect(d.recordCheck).toHaveBeenCalledWith("review", "dec_1");
  });

  it("sends a mismatched decision to admin review", async () => {
    const d = deps({ findDecision: vi.fn(async () => decision({ status: "superseded" })) });
    expect(await runInvitationClaim(d)).toBe(false);
    expect(d.recordCheck).toHaveBeenCalledWith("review", "dec_1");
  });

  it("does not fall back to email matching when a decision ID is present", async () => {
    const d = deps({ findDecision: vi.fn(async () => decision({ status: "revoked" })) });
    await runInvitationClaim(d);
    expect(d.legacyRows).not.toHaveBeenCalled();
    expect(d.applyLegacy).not.toHaveBeenCalled();
  });

  it("grants nothing and records nothing during a Clerk outage, so it retries", async () => {
    const d = deps({ invitationsFor: vi.fn(async () => null) });
    expect(await runInvitationClaim(d)).toBe(false);
    expect(d.consumeDecision).not.toHaveBeenCalled();
    expect(d.recordCheck).not.toHaveBeenCalled();
  });

  it("records review when another request already consumed the decision", async () => {
    const d = deps({ consumeDecision: vi.fn(async () => false) });
    expect(await runInvitationClaim(d)).toBe(false);
    expect(d.recordCheck).toHaveBeenCalledWith("review", "dec_1");
  });

  it("applies a legacy invitation's roles by its exact ID", async () => {
    const d = deps({
      currentUser: vi.fn(async () => ({ verifiedEmails: [EMAIL], decisionId: null, createdAt: NOW })),
      legacyRows: vi.fn(async () => [{ invitationId: "inv_1", email: EMAIL }]),
    });
    expect(await runInvitationClaim(d)).toBe(true);
    expect(d.applyLegacy).toHaveBeenCalledWith("inv_1");
    expect(d.consumeDecision).not.toHaveBeenCalled();
  });

  it("records none for an account with no invitation waiting", async () => {
    const d = deps({ currentUser: vi.fn(async () => ({ verifiedEmails: [EMAIL], decisionId: null, createdAt: NOW })) });
    expect(await runInvitationClaim(d)).toBe(false);
    expect(d.recordCheck).toHaveBeenCalledWith("none", null);
  });

  it("records review when a legacy row cannot be matched safely", async () => {
    const d = deps({
      currentUser: vi.fn(async () => ({ verifiedEmails: [EMAIL], decisionId: null, createdAt: NOW })),
      legacyRows: vi.fn(async () => [{ invitationId: "inv_1", email: EMAIL }]),
      invitationsFor: vi.fn(async () => [invitation({ status: "revoked" })]),
    });
    expect(await runInvitationClaim(d)).toBe(false);
    expect(d.applyLegacy).not.toHaveBeenCalled();
    expect(d.recordCheck).toHaveBeenCalledWith("review", null);
  });

  it("ignores a decision ID until the membership tables are installed", async () => {
    const d = deps({ installed: false, legacyRows: vi.fn(async () => []) });
    await runInvitationClaim(d);
    expect(d.findDecision).not.toHaveBeenCalled();
    expect(d.recordCheck).not.toHaveBeenCalled();
  });

  it("does nothing without a user", async () => {
    const d = deps({ currentUser: vi.fn(async () => null) });
    expect(await runInvitationClaim(d)).toBe(false);
    expect(d.recordCheck).not.toHaveBeenCalled();
  });
});
