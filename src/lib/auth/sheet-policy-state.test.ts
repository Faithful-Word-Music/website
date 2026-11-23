import { describe, expect, it } from "vitest";

import { resolveSheetPolicyMode } from "./sheet-policy-state";

describe("resolveSheetPolicyMode", () => {
  it("stays legacy when the environment has no policy state", () => {
    expect(resolveSheetPolicyMode({ setting: null, latched: false })).toBe("legacy");
    expect(resolveSheetPolicyMode({ setting: undefined, latched: false })).toBe("legacy");
  });

  it("stays legacy while the environment is being prepared", () => {
    expect(resolveSheetPolicyMode({ setting: { state: "prepared" }, latched: false })).toBe("legacy");
  });

  it("enforces when the state says so", () => {
    expect(resolveSheetPolicyMode({ setting: { state: "enforcing" }, latched: false })).toBe("enforcing");
  });

  it.each([[{ state: "off" }], [{ state: 1 }], [{}], ["enforcing"], [7], [true], [[]]])(
    "fails closed to enforcing on the malformed state %j",
    (setting) => {
      expect(resolveSheetPolicyMode({ setting, latched: false })).toBe("enforcing");
    },
  );

  it.each([[null], [{ state: "prepared" }], [{ state: "off" }]])("enforces once latched, whatever the setting says (%j)", (setting) => {
    expect(resolveSheetPolicyMode({ setting, latched: true })).toBe("enforcing");
  });
});
