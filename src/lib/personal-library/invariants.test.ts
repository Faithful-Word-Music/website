import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/errors", () => ({ isClerkAPIResponseError: () => false }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));

import { isDefinitiveDeleteRefusal } from "@/lib/auth/clerk";

import { isValidNoteContent, isValidRecentResource, MAX_NOTE_LENGTH } from "./store";

/** Source checks, so private records cannot quietly reach another feature. */

const ROOT = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(ROOT).map((path) => ({
  path: relative(ROOT, path).split(sep).join("/"),
  text: readFileSync(path, "utf8"),
}));

describe("Personal Library privacy", () => {
  it("is imported only by account deletion and its recovery", () => {
    const outside = files.filter((file) => !file.path.startsWith("lib/personal-library/"));
    const importers = outside.filter((file) => /personal-library\//.test(file.text)).map((file) => file.path).sort();
    expect(importers).toEqual(["app/admin/actions.ts", "app/api/cron/sync-archive/route.ts"]);
  });

  it("has its tables read nowhere else", () => {
    const tables = /user_song_favorites|user_library_recent|user_song_notes|personal_library_erasures/;
    const outside = files.filter((file) => !file.path.startsWith("lib/personal-library/") && tables.test(file.text));
    expect(outside.map((file) => file.path)).toEqual([]);
  });

  it("uses no shared cache and exposes no public route", () => {
    const own = files.filter((file) => file.path.startsWith("lib/personal-library/"));
    for (const file of own) expect(file.text, file.path).not.toMatch(/unstable_cache|"use cache"|"use server"/);
    expect(files.filter((file) => file.path.startsWith("app/") && /personal-library/i.test(file.path))).toEqual([]);
  });

  it("never grants or reads sheet music entitlement", () => {
    const own = files.filter((file) => file.path.startsWith("lib/personal-library/"));
    for (const file of own) expect(file.text, file.path).not.toMatch(/openDriveFile|decideSheetAccess|view_sheet_music|driveFileId/);
  });

  it("logs no note content or song identity", () => {
    const own = files.filter((file) => file.path.startsWith("lib/personal-library/"));
    for (const file of own) {
      for (const [call] of file.text.matchAll(/console\.\w+\([^\n]*/g)) {
        expect(call, file.path).not.toMatch(/content|songId|userId|storedIds/);
      }
    }
  });

  it("uses the gated boundary, never the profile-gate exemption", () => {
    const authorize = files.find((file) => file.path === "lib/personal-library/authorize.ts")!.text;
    expect(authorize).toMatch(/withPermission<T>\(null,/);
    expect(authorize).not.toMatch(/withPermissionExempt|profileGate/);
  });
});

describe("validation", () => {
  it("accepts blank and exactly maximum-length notes", () => {
    expect(isValidNoteContent("")).toBe(true);
    expect(isValidNoteContent("   ")).toBe(true);
    expect(isValidNoteContent("a".repeat(MAX_NOTE_LENGTH))).toBe(true);
  });

  it("counts characters as PostgreSQL does", () => {
    expect(isValidNoteContent("\u{1F3B5}".repeat(MAX_NOTE_LENGTH))).toBe(true);
    expect(isValidNoteContent("\u{1F3B5}".repeat(MAX_NOTE_LENGTH + 1))).toBe(false);
  });

  it("rejects what PostgreSQL could not store", () => {
    expect(isValidNoteContent("a".repeat(MAX_NOTE_LENGTH + 1))).toBe(false);
    expect(isValidNoteContent("a\u0000b")).toBe(false);
    expect(isValidNoteContent("\uD83D")).toBe(false);
    expect(isValidNoteContent(null)).toBe(false);
  });

  it("accepts only supported recent resources", () => {
    expect(isValidRecentResource("song", "SSSH1989-167")).toBe(true);
    expect(isValidRecentResource("sheet_file", `sf1_${"a".repeat(64)}`)).toBe(true);
    expect(isValidRecentResource("sheet_file", "1driveFileIdLooksLikeThis")).toBe(false);
    expect(isValidRecentResource("playlist", "x")).toBe(false);
    expect(isValidRecentResource("song", "")).toBe(false);
  });
});

describe("Clerk deletion outcomes", () => {
  it("counts only explicit refusals as definitive", () => {
    for (const status of [400, 401, 403, 422, 429]) expect(isDefinitiveDeleteRefusal(status)).toBe(true);
    for (const status of [404, 408, 409, 500, 502, 503, 504]) expect(isDefinitiveDeleteRefusal(status)).toBe(false);
  });
});
