import { describe, expect, it } from "vitest";

import { resolveClerkConfig } from "@/lib/auth/clerk-env";

const TEST = { publishableKey: "pk_test_abc", secretKey: "sk_test_abc" };
const LIVE = { publishableKey: "pk_live_abc", secretKey: "sk_live_abc" };

describe("resolveClerkConfig", () => {
  it("is missing, not broken, when no keys are set", () => {
    expect(resolveClerkConfig({ publishableKey: undefined, secretKey: undefined, vercelEnv: undefined })).toEqual({
      status: "missing",
    });
  });

  it("uses Development for test keys locally and in Preview", () => {
    expect(resolveClerkConfig({ ...TEST, vercelEnv: undefined })).toEqual({ status: "ready", env: "development" });
    expect(resolveClerkConfig({ ...TEST, vercelEnv: "development" })).toEqual({ status: "ready", env: "development" });
    expect(resolveClerkConfig({ ...TEST, vercelEnv: "preview" })).toEqual({ status: "ready", env: "development" });
  });

  it("uses Production for live keys on the Production deployment", () => {
    expect(resolveClerkConfig({ ...LIVE, vercelEnv: "production" })).toEqual({ status: "ready", env: "production" });
  });

  it("refuses Development keys on the Production deployment", () => {
    const result = resolveClerkConfig({ ...TEST, vercelEnv: "production" });
    expect(result.status).toBe("invalid");
  });

  it("refuses Production keys anywhere but Production", () => {
    for (const vercelEnv of [undefined, "development", "preview"]) {
      expect(resolveClerkConfig({ ...LIVE, vercelEnv }).status).toBe("invalid");
    }
  });

  it("refuses a mismatched or incomplete pair", () => {
    expect(resolveClerkConfig({ publishableKey: "pk_test_a", secretKey: "sk_live_a", vercelEnv: "production" }).status).toBe(
      "invalid",
    );
    expect(resolveClerkConfig({ publishableKey: "pk_test_a", secretKey: undefined, vercelEnv: undefined }).status).toBe(
      "invalid",
    );
    expect(resolveClerkConfig({ publishableKey: "nonsense", secretKey: "sk_test_a", vercelEnv: undefined }).status).toBe(
      "invalid",
    );
  });

  it("never puts a key in its reason", () => {
    const result = resolveClerkConfig({ publishableKey: "pk_live_SECRET1", secretKey: "sk_live_SECRET2", vercelEnv: "preview" });
    expect(result.status === "invalid" && result.reason).not.toMatch(/SECRET/);
  });
});
