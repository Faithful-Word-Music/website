import { describe, expect, it } from "vitest";

import type { Permission } from "@/lib/auth/permissions";
import { audienceFor, visibleProfile, type ProfileRecord } from "@/lib/auth/profile-visibility";

const profile: ProfileRecord = {
  firstName: "Ada",
  middleName: "",
  lastName: "Lovelace",
  preferredName: "Ada",
  imageUrl: "https://img.example/ada.png",
  email: "ada@example.com",
  bio: "Plays on Sunday mornings.",
  phone: "555-0100",
  voicePart: "alto",
  readsSheetMusic: true,
  theoryLevel: null,
  learningStyle: 4,
  serviceAvailability: ["sunday_am"],
  titles: [{ titleId: 1, label: "Pianist", isPrimary: true }],
  instruments: [{ instrumentId: 1, label: "Piano", proficiency: "confident", isPrimary: true }],
  roleLabels: ["Musician", "Member"],
};

describe("visibleProfile", () => {
  it("shows the owner everything", () => {
    expect(visibleProfile(profile, "self")).toEqual(profile);
  });

  it("shows staff everything the ministry needs, contact details included", () => {
    const seen = visibleProfile(profile, "staff");
    expect(seen.phone).toBe("555-0100");
    expect(seen.email).toBe("ada@example.com");
    expect(seen.instruments?.[0].proficiency).toBe("confident");
  });

  it("keeps contact details, music answers, availability, skill levels and roles from other members", () => {
    const seen = visibleProfile(profile, "members");
    for (const field of ["email", "phone", "readsSheetMusic", "theoryLevel", "learningStyle", "serviceAvailability", "roleLabels"]) {
      expect(seen).not.toHaveProperty(field);
    }
    expect(seen.instruments).toEqual([{ instrumentId: 1, label: "Piano", isPrimary: true }]);
  });

  it("shows other members who someone is in the ministry", () => {
    const seen = visibleProfile(profile, "members");
    expect(seen.firstName).toBe("Ada");
    expect(seen.titles?.[0].label).toBe("Pianist");
    expect(seen.bio).toBe("Plays on Sunday mornings.");
  });
});

describe("audienceFor", () => {
  const viewer = (userId: string, permissions: Permission[]) => ({
    userId,
    can: (permission: Permission) => permissions.includes(permission),
  });

  it("is self for the owner, whatever their permissions", () => {
    expect(audienceFor(viewer("u1", []), "u1")).toBe("self");
  });

  it("is staff for someone holding view_profiles", () => {
    expect(audienceFor(viewer("u2", ["view_profiles"]), "u1")).toBe("staff");
  });

  it("gives no access to anyone else - member profiles do not exist yet", () => {
    expect(audienceFor(viewer("u2", ["manage_users"]), "u1")).toBeNull();
  });
});
