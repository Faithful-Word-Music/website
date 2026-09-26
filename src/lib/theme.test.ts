import { describe, expect, it } from "vitest";

import { parseTheme, resolveTheme, themeInitScript } from "@/lib/theme";

describe("parseTheme", () => {
  it("accepts only light and dark", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBeNull();
    expect(parseTheme("")).toBeNull();
    expect(parseTheme(null)).toBeNull();
  });
});

describe("resolveTheme", () => {
  it("follows the device when nothing is saved", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  it("lets a saved choice override the device", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("themeInitScript", () => {
  function run(stored: string | null, throws = false) {
    const attrs: Record<string, string> = {};
    const localStorage = {
      getItem: () => {
        if (throws) throw new Error("blocked");
        return stored;
      },
    };
    const document = {
      documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
    };
    new Function("localStorage", "document", themeInitScript)(localStorage, document);
    return attrs["data-theme"];
  }

  it("applies a saved theme", () => {
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
  });

  it("leaves the device in charge otherwise, even when storage is blocked", () => {
    expect(run(null)).toBeUndefined();
    expect(run("purple")).toBeUndefined();
    expect(run("dark", true)).toBeUndefined();
  });
});
