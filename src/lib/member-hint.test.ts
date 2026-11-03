import { describe, expect, it } from "vitest";

import { isMemberHint, MEMBER_ATTRIBUTE, memberInitScript } from "./member-hint";

/** Runs the <head> script against a pretend page; true if it marked <html>. */
function runScript(cookie: string, pathname: string): boolean {
  const attributes = new Map<string, string>();
  const document = { cookie, documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) } };
  new Function("document", "location", memberInitScript)(document, { pathname });
  return attributes.has(MEMBER_ATTRIBUTE);
}

const SIGNED_IN = "__client_uat=1790000000";

/** [cookie, pathname, expected] - checked against isMemberHint and the script alike. */
const CASES: [string, string, boolean][] = [
  // A Clerk sign-in time: a member, on any page.
  [SIGNED_IN, "/song-list", true],
  ["theme=dark; __client_uat_Xy1Z2=1790000000; other=1", "/library", true],
  [SIGNED_IN, "/", true],
  // Signed out, absent, empty or not a whole number: a visitor.
  ["__client_uat=0", "/song-list", false],
  ["__client_uat_Xy1Z2=0; theme=dark", "/library", false],
  ["", "/song-list", false],
  ["__client_uat=", "/song-list", false],
  ["__client_uat=false", "/song-list", false],
  ["__client_uat=true", "/song-list", false],
  ["__client_uat=1abc", "/song-list", false],
  ["__client_uat=-5", "/song-list", false],
  ["__client_uat=01", "/song-list", false],
  ["not__client_uat=1790000000", "/song-list", false],
  // A members' page is only ever open to a member, whatever the cookie says.
  ["", "/dashboard", true],
  ["", "/dashboard/sheet-music/2026-11-08-am", true],
  ["", "/admin/users/user_1", true],
  ["", "/contact/requests/R-12345678", true],
  // Path boundaries: look-alikes are public pages.
  ["", "/dashboardx", false],
  ["", "/dashboard-old", false],
  ["", "/accounts", false],
  ["", "/contact", false],
  ["", "/contact/requestsx", false],
  ["", "/song-list", false],
];

describe("isMemberHint", () => {
  it.each(CASES)("cookie %j on %s -> %s", (cookie, pathname, expected) => {
    expect(isMemberHint({ cookie, pathname })).toBe(expected);
  });
});

describe("memberInitScript", () => {
  it("is a self-contained script that parses", () => {
    expect(() => new Function(memberInitScript)).not.toThrow();
  });

  it.each(CASES)("cookie %j on %s -> %s, the same as isMemberHint", (cookie, pathname, expected) => {
    expect(runScript(cookie, pathname)).toBe(expected);
  });

  it("never throws on a page without cookies or storage", () => {
    expect(() => new Function("document", "location", memberInitScript)(undefined, undefined)).not.toThrow();
  });
});
