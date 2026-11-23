import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES, PERMISSION_FIXUPS, fixupGrants, resolvePermissions } from "./permissions";

/** Source checks, so a new delivery path cannot quietly skip the sheet music policy. */

const ROOT = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(ROOT).map((path) => ({
  path: relative(ROOT, path).split(sep).join("/"),
  text: readFileSync(path, "utf8"),
}));
const using = (pattern: RegExp) => files.filter((file) => pattern.test(file.text)).map((file) => file.path).sort();

describe("sheet music policy invariants", () => {
  it("sends a file's bytes only from the two policy-checked routes", () => {
    expect(using(/\bopenDriveFile\(/).filter((path) => path !== "lib/sheet-music-index.ts")).toEqual([
      "app/dashboard/sheet-music/[service]/route.ts",
      "app/library/songs/[song]/sheet-music/[file]/route.ts",
    ]);
  });

  it("re-reads current rights in every route that sends bytes", () => {
    for (const path of using(/\bopenDriveFile\(/).filter((item) => item !== "lib/sheet-music-index.ts")) {
      const { text } = files.find((file) => file.path === path)!;
      expect(text, path).toMatch(/currentFileResource\(/);
      expect(text, path).toMatch(/decideSheetAccess\(/);
      expect(text, path).toMatch(/confirmDriveFile\(/);
    }
  });

  it("reads file contents without the policy only in the deferred AI lyrics indexer", () => {
    expect(using(/\breadDriveFile\(/).filter((path) => path !== "lib/sheet-music-index.ts" && !path.startsWith("app/dashboard/sheet-music/"))).toEqual([
      "lib/library-content/indexer.ts",
    ]);
  });

  it("has no viewer that opens every file", () => {
    expect(using(/MEMBER_VIEWER/)).toEqual([]);
  });

  it("always passes the policy mode when classifying the live index", () => {
    const calls = files.flatMap((file) => [...file.text.matchAll(/\bclassify\(([^)]*)\)/g)].map((match) => ({ path: file.path, args: match[1] })));
    const live = calls.filter((call) => call.path !== "lib/sheet-music.ts");
    expect(live.length).toBeGreaterThan(0);
    for (const call of live) expect(call.args.split(",").length, call.path).toBe(3);
  });

  it("never lets a permission fixup grant sheet music", () => {
    for (const fixup of PERMISSION_FIXUPS) expect(fixup.permissions).not.toContain("view_sheet_music");
    expect(PERMISSION_FIXUPS.flatMap((fixup) => fixupGrants(fixup.permissions)).some((grant) => grant.permission === "view_sheet_music")).toBe(false);
  });

  it("does not seed the Member role with sheet music", () => {
    expect(DEFAULT_ROLES.find((role) => role.key === "member")?.permissions).not.toContain("view_sheet_music");
  });

  it("ignores a stale Member sheet row when resolving permissions", () => {
    const stale = new Map([["member", ["view_sheet_music", "view_member_resources"]]]);
    const permissions = resolvePermissions([], stale);
    expect(permissions.has("view_sheet_music")).toBe(false);
    expect(permissions.has("view_member_resources")).toBe(true);
  });
});
