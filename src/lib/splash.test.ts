import { describe, expect, it } from "vitest";

import { looksSignedIn, splashInitScript } from "./splash";

describe("looksSignedIn", () => {
  it("sees a Clerk sign-in time", () => {
    expect(looksSignedIn("__client_uat=1759300000")).toBe(true);
    expect(looksSignedIn("theme=dark; __client_uat_Xy1Z2=1759300000; other=1")).toBe(true);
  });

  it("ignores a signed-out cookie, or none", () => {
    expect(looksSignedIn("__client_uat=0")).toBe(false);
    expect(looksSignedIn("__client_uat_Xy1Z2=0; theme=dark")).toBe(false);
    expect(looksSignedIn("")).toBe(false);
    expect(looksSignedIn("not__client_uat=123")).toBe(false);
  });
});

describe("splashInitScript", () => {
  it("is a self-contained script that parses", () => {
    expect(() => new Function(splashInitScript)).not.toThrow();
  });
});
