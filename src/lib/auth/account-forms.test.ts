import { describe, expect, it } from "vitest";

import { aboutSchema, clerkUserIdSchema, musicSchema, profileSchema, sharedMusicSchema, songLeadingSchema } from "@/lib/auth/forms";
import { normalAvailabilitySchema } from "@/lib/availability/forms";
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

describe("profile sections", () => {
  it("requires a proficiency for every instrument - never filled in for the person", () => {
    expect(musicSchema.safeParse({ instruments: [{ instrumentId: 1, isPrimary: true }], learningStyle: null }).success).toBe(false);
    expect(
      musicSchema.safeParse({ instruments: [{ instrumentId: 1, proficiency: "learning", isPrimary: true }], learningStyle: null }).success,
    ).toBe(true);
  });

  it("requires exactly one primary instrument when any are listed", () => {
    const two = (a: boolean, b: boolean) => ({
      instruments: [
        { instrumentId: 1, proficiency: "confident", isPrimary: a },
        { instrumentId: 2, proficiency: "learning", isPrimary: b },
      ],
      learningStyle: 2,
    });
    expect(musicSchema.safeParse(two(false, false)).success).toBe(false);
    expect(musicSchema.safeParse(two(true, true)).success).toBe(false);
    expect(musicSchema.safeParse(two(true, false)).success).toBe(true);
    expect(musicSchema.safeParse({ instruments: [], learningStyle: null }).success).toBe(true);
  });

  it("refuses the same instrument twice", () => {
    const item = { instrumentId: 3, proficiency: "confident", isPrimary: true };
    expect(musicSchema.safeParse({ instruments: [item, { ...item, isPrimary: false }], learningStyle: 1 }).success).toBe(false);
  });

  it("keeps unanswered song-leading questions as null, and refuses made-up values", () => {
    const none = { experience: null, unfamiliarHymns: null, unaccompaniedLeading: null };
    expect(songLeadingSchema.parse(none)).toEqual(none);
    expect(songLeadingSchema.safeParse({ ...none, experience: "expert" }).success).toBe(false);
    expect(songLeadingSchema.safeParse({ experience: "beginner", unfamiliarHymns: "with_preparation", unaccompaniedLeading: "still_learning" }).success).toBe(true);
  });

  it("counts false as an answer to reading sheet music", () => {
    expect(sharedMusicSchema.parse({ readsSheetMusic: false, voicePart: null, theoryLevel: null }).readsSheetMusic).toBe(false);
  });

  it("checks names and phone in About you", () => {
    const about = { firstName: "Mary", middleName: "", lastName: "Smith", preferredName: "", bio: "", phone: "" };
    expect(aboutSchema.safeParse(about).success).toBe(true);
    expect(aboutSchema.safeParse({ ...about, lastName: " " }).success).toBe(false);
    expect(aboutSchema.safeParse({ ...about, phone: "<b>" }).success).toBe(false);
  });
});

describe("normal availability", () => {
  it("accepts an empty pattern only when none is confirmed", () => {
    expect(normalAvailabilitySchema.safeParse({ services: [] }).success).toBe(false);
    expect(normalAvailabilitySchema.safeParse({ services: [], confirmNone: false }).success).toBe(false);
    expect(normalAvailabilitySchema.safeParse({ services: [], confirmNone: true }).success).toBe(true);
    expect(normalAvailabilitySchema.safeParse({ services: ["sunday_am"] }).success).toBe(true);
  });
});
