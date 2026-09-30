import { describe, expect, it } from "vitest";

import { clerkUserIdSchema, profileSchema } from "@/lib/auth/forms";
import { missingProfileItems } from "@/lib/auth/profile-completeness";
import { normalizeEmail, statusFromInvitation } from "@/lib/auth/request-status";
import { accountRequestSchema } from "@/lib/validation";

describe("statusFromInvitation", () => {
  it("follows the Clerk invitation", () => {
    expect(statusFromInvitation("accepted")).toBe("active");
    expect(statusFromInvitation("revoked")).toBe("revoked");
    expect(statusFromInvitation("expired")).toBe("expired");
    expect(statusFromInvitation("pending")).toBe("invited");
  });

  it("leaves a request invited when the invitation cannot be found", () => {
    expect(statusFromInvitation(null)).toBe("invited");
  });
});

describe("normalizeEmail", () => {
  it("compares addresses case-insensitively", () => {
    expect(normalizeEmail("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
  });
});

describe("accountRequestSchema", () => {
  it("accepts a name and email, with the message optional", () => {
    const parsed = accountRequestSchema.safeParse({ name: " Jane ", email: "jane@example.com" });
    expect(parsed.success && parsed.data).toEqual({ name: "Jane", email: "jane@example.com", message: "" });
  });

  it("rejects a bad email, a missing name and a filled honeypot", () => {
    expect(accountRequestSchema.safeParse({ name: "Jane", email: "not-an-email" }).success).toBe(false);
    expect(accountRequestSchema.safeParse({ name: "", email: "jane@example.com" }).success).toBe(false);
    expect(accountRequestSchema.safeParse({ name: "Jane", email: "jane@example.com", website: "x" }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  const valid = {
    firstName: "Jane",
    middleName: "",
    lastName: "Doe",
    preferredName: "",
    bio: "",
    phone: "(602) 555-0100",
    voicePart: "alto",
    serviceAvailability: ["sunday_am"],
    learningStyle: 4,
    theoryLevel: "basics",
    readsSheetMusic: null,
    instruments: [{ instrumentId: 1, proficiency: "confident", isPrimary: true }],
  };

  it("accepts a complete profile", () => {
    expect(profileSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects values outside the fixed choices", () => {
    expect(profileSchema.safeParse({ ...valid, learningStyle: 9 }).success).toBe(false);
    expect(profileSchema.safeParse({ ...valid, voicePart: "baritone-ish" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...valid, phone: "call me <script>" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...valid, firstName: "" }).success).toBe(false);
  });
});

describe("clerkUserIdSchema", () => {
  it("accepts only Clerk user IDs", () => {
    expect(clerkUserIdSchema.safeParse("user_2abcDEF1234567890").success).toBe(true);
    expect(clerkUserIdSchema.safeParse("user_../../etc").success).toBe(false);
    expect(clerkUserIdSchema.safeParse("inv_2abcDEF1234567890").success).toBe(false);
  });
});

describe("missingProfileItems", () => {
  const base = {
    roleKeys: [] as string[],
    hasName: true,
    hasImage: true,
    instrumentCount: 0,
    learningStyle: null,
    theoryLevel: null,
    readsSheetMusic: null,
  };

  it("asks members only for a name and photo", () => {
    expect(missingProfileItems(base)).toEqual([]);
    expect(missingProfileItems({ ...base, hasImage: false })).toEqual(["A profile photo"]);
  });

  it("asks musicians about instruments and reading music", () => {
    expect(missingProfileItems({ ...base, roleKeys: ["musician"] })).toHaveLength(3);
  });

  it("asks song leaders whether they read sheet music", () => {
    expect(missingProfileItems({ ...base, roleKeys: ["song_leader"] })).toEqual(["Whether you read basic sheet music"]);
  });
});
