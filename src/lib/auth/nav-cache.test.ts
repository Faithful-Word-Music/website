import { describe, expect, it } from "vitest";

import { parseCachedNav, serializeCachedNav } from "@/lib/auth/nav-cache";

describe("nav permissions cache", () => {
  it("round-trips what it stores", () => {
    const value = { userId: "user_1", permissions: ["view_availability", "manage_service_plans"] as const };
    expect(parseCachedNav(serializeCachedNav({ ...value, permissions: [...value.permissions] }))).toEqual({
      userId: "user_1",
      permissions: ["manage_service_plans", "view_availability"],
    });
  });

  it("ignores nothing, junk and malformed values", () => {
    expect(parseCachedNav(null)).toBeNull();
    expect(parseCachedNav("")).toBeNull();
    expect(parseCachedNav("not json")).toBeNull();
    expect(parseCachedNav("null")).toBeNull();
    expect(parseCachedNav(JSON.stringify({ permissions: [] }))).toBeNull();
    expect(parseCachedNav(JSON.stringify({ userId: "user_1", permissions: "all" }))).toBeNull();
  });

  it("drops permissions that do not exist", () => {
    expect(parseCachedNav(JSON.stringify({ userId: "user_1", permissions: ["make_coffee", 3, "view_availability"] }))).toEqual({
      userId: "user_1",
      permissions: ["view_availability"],
    });
  });
});
