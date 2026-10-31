import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The profile gate's audit, checked against the code itself
 * (docs/profile-requirements.md, "Where the gate applies").
 *
 * Pages and server actions are gated by default (requireViewer,
 * withPermission). Only the exemptions below may opt out - recovery, help,
 * and the places where a profile is finished - and a route that reads the
 * session itself (getViewer) must either check isProfileBlocked() or be one
 * of the exemptions too. A new route that forgets fails here.
 */

const ROOT = join(__dirname, "..", "..");

/** Files allowed to use PROFILE_GATE_EXEMPT or withPermissionExempt(), and why. */
const EXEMPT: Record<string, string> = {
  "app/welcome/page.tsx": "onboarding: where an overdue profile is finished",
  "app/profile/page.tsx": "the profile itself",
  "app/profile/edit/page.tsx": "the profile itself",
  "app/profile/actions.ts": "saving the profile and onboarding steps",
  "app/account/[[...account]]/page.tsx": "account security: sign-in, password, devices",
  "app/notifications/page.tsx": "notices, including about the person's own access",
  "app/notifications/settings/page.tsx": "notification and push settings (an onboarding step)",
  "app/notifications/actions.ts": "notification preferences",
  "app/availability/actions.ts": "only setNormalPattern: how the availability requirement is met",
  "app/contact/requests/[id]/page.tsx": "help: the person's own support request",
  "app/contact/actions.ts": "help: asking and replying (managing requests stays gated)",
  "app/admin/actions.ts": "administrator recovery",
  "app/admin/notifications/actions.ts": "administration",
};
const EXEMPT_PREFIXES = ["app/admin/"];

/** Routes that read the session themselves and are exempt (everything else must check the gate). */
const DIRECT_EXEMPT: Record<string, string> = {
  "app/api/account/me/route.ts": "reports the profile's state to the menu",
  "app/api/account/notifications/route.ts": "the bell",
  "app/api/account/notifications/unread/route.ts": "the bell",
  "app/api/account/push/route.ts": "push on this device (an onboarding step)",
  "app/notifications/open/[id]/route.ts": "marks read, then the target page checks for itself",
  "app/contact/page.tsx": "help: the Support Center",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const source = [...files(join(ROOT, "app")), join(ROOT, "lib", "ai", "conductor", "request.ts")].map((path) => ({
  path: relative(ROOT, path).split(sep).join("/"),
  text: readFileSync(path, "utf8"),
}));

const isExempt = (path: string) => path in EXEMPT || EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));

describe("the profile gate", () => {
  it("is opted out of only by the documented exemptions", () => {
    const optingOut = source.filter((file) => /PROFILE_GATE_EXEMPT|withPermissionExempt\(|profileGate:\s*false/.test(file.text)).map((file) => file.path);
    expect(optingOut.filter((path) => !isExempt(path))).toEqual([]);
  });

  it("is checked by every route that reads the session itself", () => {
    const direct = source.filter((file) => /\bgetViewer\(\)/.test(file.text));
    const unchecked = direct.filter((file) => !file.text.includes("isProfileBlocked(") && !(file.path in DIRECT_EXEMPT)).map((file) => file.path);
    expect(unchecked).toEqual([]);
  });

  it("keeps managing support requests gated while asking for help is not", () => {
    const actions = source.find((file) => file.path === "app/contact/actions.ts")!.text;
    const workflow = actions.slice(actions.indexOf("export async function updateSupportWorkflowAction"));
    expect(workflow.slice(0, workflow.indexOf("});"))).toMatch(/return withPermission\(/);
  });

  it("exempts only the normal-services action among availability's actions", () => {
    const actions = source.find((file) => file.path === "app/availability/actions.ts")!.text;
    expect(actions.match(/withPermissionExempt\(/g)).toHaveLength(1);
    expect(actions).toMatch(/withPermissionExempt\(PARTICIPANT_PERMISSION, \(viewer\) => changeNormalAvailability/);
  });

  it("gates every other page that requires a signed-in person", () => {
    const pages = source.filter((file) => /requireViewer\(|requireAnyPermission\(/.test(file.text) && !isExempt(file.path)).map((file) => file.path);
    // These remain gated by default: the normal features of the site.
    expect(pages).toEqual(
      expect.arrayContaining([
        "app/dashboard/page.tsx",
        "app/availability/page.tsx",
        "app/conductor/page.tsx",
        "app/service-planner/page.tsx",
        "app/service-planner/inserts/page.tsx",
        "app/service-planner/[service]/page.tsx",
      ]),
    );
  });
});
