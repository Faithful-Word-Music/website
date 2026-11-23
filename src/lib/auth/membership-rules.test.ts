import { describe, expect, it } from "vitest";

import { activationBlocker, affiliationRefusal, parseAffiliationChange } from "./membership-rules";

describe("affiliationRefusal", () => {
  const input = { actorId: "user_a", targetId: "user_b", actorIsAdmin: false, targetIsAdmin: false };

  it("lets someone with manage_users verify an ordinary account", () => {
    expect(affiliationRefusal(input)).toBeNull();
  });

  it("refuses verifying yourself, even as an Administrator", () => {
    expect(affiliationRefusal({ ...input, targetId: "user_a" })).toBe("self");
    expect(affiliationRefusal({ ...input, targetId: "user_a", actorIsAdmin: true, targetIsAdmin: true })).toBe("self");
  });

  it("refuses a non-Administrator changing an Administrator", () => {
    expect(affiliationRefusal({ ...input, targetIsAdmin: true })).toBe("admin-target");
  });

  it("lets an Administrator change another Administrator", () => {
    expect(affiliationRefusal({ ...input, actorIsAdmin: true, targetIsAdmin: true })).toBeNull();
  });
});

describe("parseAffiliationChange", () => {
  it("accepts a valid change, trimming the reason", () => {
    expect(parseAffiliationChange(null, "verified", "  Known member ")).toEqual({ expected: null, next: "verified", reason: "Known member" });
    expect(parseAffiliationChange("verified", "revoked", undefined)).toEqual({ expected: "verified", next: "revoked", reason: "" });
  });

  it.each([
    ["pending", "verified", ""],
    [null, "pending", ""],
    [null, null, ""],
    [null, "verified", 7],
    [null, "verified", "x".repeat(501)],
  ])("refuses %j -> %j", (expected, next, reason) => {
    expect(parseAffiliationChange(expected, next, reason)).toBeNull();
  });
});

describe("activationBlocker", () => {
  const report = { activated: false, files: { public: 1, restricted: 1, withheld: 3 } };

  it("allows a report with openable files", () => {
    expect(activationBlocker(report)).toBeNull();
  });

  it("refuses when already activated", () => {
    expect(activationBlocker({ ...report, activated: true })).toBe("already");
  });

  it("refuses when File Rights would withhold every file", () => {
    expect(activationBlocker({ activated: false, files: { public: 0, restricted: 0, withheld: 200 } })).toBe("no-file-rights");
  });
});
