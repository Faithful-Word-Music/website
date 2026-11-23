import { describe, expect, it } from "vitest";

import type { PermissionOverride } from "./permissions";
import {
  arrangementFor,
  classifyResource,
  decideSheetAccess,
  parseFileRights,
  projectSheetPermission,
  resolveSheetEntitlement,
  type SheetFacts,
  type SheetSubject,
} from "./sheet-entitlement";

const ROLE_PERMISSIONS = new Map<string, string[]>([
  ["member", ["view_sheet_music", "view_member_resources"]],
  ["musician", ["view_availability"]],
  ["song_leader", ["lead_songs", "view_sheet_music"]],
  ["librarian", ["manage_sheet_music"]],
  ["custom_reader", ["view_sheet_music"]],
]);

function facts(overrides: Partial<SheetFacts> = {}): SheetFacts {
  return { mode: "enforcing", roleKeys: [], rolePermissions: ROLE_PERMISSIONS, overrides: [], affiliation: null, ...overrides };
}
const deny: PermissionOverride = { permission: "view_sheet_music", effect: "deny" };
const grant: PermissionOverride = { permission: "view_sheet_music", effect: "grant" };

const account = (input: Partial<SheetFacts> = {}, profileBlocked = false): SheetSubject => ({
  kind: "account",
  entitlement: resolveSheetEntitlement(facts(input)),
  profileBlocked,
});

describe("resolveSheetEntitlement", () => {
  it("gives a basic Member nothing, even with a stale Member grant row", () => {
    expect(resolveSheetEntitlement(facts())).toMatchObject({ entitled: false, reason: "no_entitlement" });
  });

  it("honors the Member row only in legacy mode", () => {
    expect(resolveSheetEntitlement(facts({ mode: "legacy" }))).toMatchObject({ entitled: true, reason: "role_permission" });
  });

  it("entitles a verified church member", () => {
    expect(resolveSheetEntitlement(facts({ affiliation: "verified" }))).toMatchObject({ entitled: true, reason: "verified_affiliation" });
  });

  it("does not entitle a revoked affiliation", () => {
    expect(resolveSheetEntitlement(facts({ affiliation: "revoked" })).entitled).toBe(false);
  });

  it("entitles a Musician even when the role's permission row is missing", () => {
    expect(resolveSheetEntitlement(facts({ roleKeys: ["musician"] }))).toMatchObject({ entitled: true, reason: "musician_role" });
  });

  it("keeps a custom role's grant", () => {
    expect(resolveSheetEntitlement(facts({ roleKeys: ["custom_reader"] }))).toMatchObject({ entitled: true, reason: "role_permission" });
  });

  it("entitles an Administrator", () => {
    expect(resolveSheetEntitlement(facts({ roleKeys: ["administrator"] }))).toMatchObject({ entitled: true, reason: "role_permission" });
  });

  it("entitles through an individual grant", () => {
    expect(resolveSheetEntitlement(facts({ overrides: [grant] }))).toMatchObject({ entitled: true, reason: "individual_grant" });
  });

  it.each([
    ["a verified member", { affiliation: "verified" as const }],
    ["a Musician", { roleKeys: ["musician"] }],
    ["an Administrator", { roleKeys: ["administrator"] }],
  ])("lets an individual deny override %s", (_name, input) => {
    expect(resolveSheetEntitlement(facts({ ...input, overrides: [deny] }))).toMatchObject({ entitled: false, reason: "individual_deny" });
  });

  it("lets a deny beat a grant, in legacy mode too", () => {
    expect(resolveSheetEntitlement(facts({ mode: "legacy", overrides: [grant, deny] })).entitled).toBe(false);
  });

  it("lists every source for the admin explanation", () => {
    const { sources } = resolveSheetEntitlement(facts({ roleKeys: ["musician", "custom_reader"], affiliation: "verified", overrides: [grant] }));
    expect([...sources].sort()).toEqual(["individual_grant", "musician_role", "role_permission", "verified_affiliation"]);
  });

  it("removing affiliation leaves an independent role's access", () => {
    expect(resolveSheetEntitlement(facts({ roleKeys: ["musician"], affiliation: "revoked" })).entitled).toBe(true);
  });

  it("does not let affiliation-only access be delegated", () => {
    expect(resolveSheetEntitlement(facts({ affiliation: "verified" })).delegable).toBe(false);
    expect(resolveSheetEntitlement(facts({ roleKeys: ["musician"], affiliation: "verified" })).delegable).toBe(true);
  });

  it("allows withheld review for manage_sheet_music and Administrators", () => {
    expect(resolveSheetEntitlement(facts({ roleKeys: ["librarian"] })).mayReviewWithheld).toBe(true);
    expect(resolveSheetEntitlement(facts({ roleKeys: ["administrator"] })).mayReviewWithheld).toBe(true);
  });

  it("blocks withheld review on an individual sheet deny, including for an Administrator", () => {
    expect(resolveSheetEntitlement(facts({ roleKeys: ["administrator"], overrides: [deny] })).mayReviewWithheld).toBe(false);
  });

  it("blocks withheld review when manage_sheet_music is individually denied", () => {
    const overrides: PermissionOverride[] = [{ permission: "manage_sheet_music", effect: "deny" }];
    expect(resolveSheetEntitlement(facts({ roleKeys: ["librarian"], overrides })).mayReviewWithheld).toBe(false);
  });

  it("does not give withheld review through an individual sheet grant", () => {
    expect(resolveSheetEntitlement(facts({ overrides: [grant] })).mayReviewWithheld).toBe(false);
  });
});

describe("projectSheetPermission", () => {
  it("adds the permission for an entitled person", () => {
    const projected = projectSheetPermission(new Set(), resolveSheetEntitlement(facts({ affiliation: "verified" })));
    expect(projected.has("view_sheet_music")).toBe(true);
  });

  it("removes it for someone who is not entitled", () => {
    const projected = projectSheetPermission(new Set(["view_sheet_music"]), resolveSheetEntitlement(facts()));
    expect(projected.has("view_sheet_music")).toBe(false);
  });
});

describe("classifyResource", () => {
  it.each([
    ["cleared", "cleared", "public"],
    ["cleared", "restricted", "restricted"],
    ["copyrighted", "cleared", "restricted"],
    ["copyrighted", "restricted", "restricted"],
    ["cleared", "withheld", "withheld"],
    ["copyrighted", "withheld", "withheld"],
    ["cleared", "none", "withheld"],
    ["copyrighted", "none", "withheld"],
    ["cleared", "conflict", "withheld"],
    ["needs-review", "cleared", "withheld"],
    ["unknown", "cleared", "withheld"],
    ["unknown", "restricted", "withheld"],
  ] as const)("composition %s + arrangement %s is %s", (rights, arrangement, expected) => {
    expect(classifyResource(rights, arrangement, "enforcing")).toBe(expected);
  });

  it.each([
    ["cleared", "public"],
    ["copyrighted", "restricted"],
    ["needs-review", "restricted"],
    ["unknown", "restricted"],
  ] as const)("in legacy mode, %s stays %s whatever the rules say", (rights, expected) => {
    expect(classifyResource(rights, "none", "legacy")).toBe(expected);
    expect(classifyResource(rights, "withheld", "legacy")).toBe(expected);
  });
});

describe("decideSheetAccess", () => {
  const anonymous: SheetSubject = { kind: "anonymous" };

  it("serves a public file to anyone", () => {
    expect(decideSheetAccess("public", anonymous)).toEqual({ allowed: true, reason: "public_resource", resource: "public" });
  });

  it("serves a public file to someone with an individual deny", () => {
    expect(decideSheetAccess("public", account({ overrides: [deny] })).allowed).toBe(true);
  });

  it("refuses a restricted file to an anonymous visitor", () => {
    expect(decideSheetAccess("restricted", anonymous)).toMatchObject({ allowed: false, reason: "no_entitlement" });
  });

  it("refuses a restricted file to an External Member", () => {
    expect(decideSheetAccess("restricted", account()).allowed).toBe(false);
  });

  it("serves a restricted file to a verified member", () => {
    expect(decideSheetAccess("restricted", account({ affiliation: "verified" }))).toMatchObject({ allowed: true, reason: "verified_affiliation" });
  });

  it("refuses a restricted file to a profile-blocked account", () => {
    expect(decideSheetAccess("restricted", account({ affiliation: "verified" }, true)).allowed).toBe(false);
  });

  it("reports an individual deny", () => {
    expect(decideSheetAccess("restricted", account({ roleKeys: ["musician"], overrides: [deny] }))).toMatchObject({ allowed: false, reason: "individual_deny" });
  });

  it("refuses a withheld file to an entitled person", () => {
    expect(decideSheetAccess("withheld", account({ roleKeys: ["musician"] }))).toMatchObject({ allowed: false, reason: "resource_withheld" });
  });

  it("opens a withheld file for review", () => {
    expect(decideSheetAccess("withheld", account({ roleKeys: ["librarian"] }), "open")).toEqual({ allowed: true, reason: "withheld_review", resource: "withheld" });
  });

  it("never distributes a withheld file, even to a reviewer", () => {
    expect(decideSheetAccess("withheld", account({ roleKeys: ["administrator"] }), "distribute")).toMatchObject({ allowed: false, reason: "resource_withheld" });
  });

  it("defaults to distribution, the narrower purpose", () => {
    expect(decideSheetAccess("withheld", account({ roleKeys: ["librarian"] })).allowed).toBe(false);
  });

  it("refuses review to a profile-blocked reviewer", () => {
    expect(decideSheetAccess("withheld", account({ roleKeys: ["librarian"] }, true), "open").allowed).toBe(false);
  });
});

describe("parseFileRights and arrangementFor", () => {
  const rules = parseFileRights([
    ["Target", "Arrangement Rights", "Note"],
    ["01 - Congregational", "Cleared", "Our own"],
    ["01 - Congregational/Chords", "Restricted", ""],
    ["id:FILE_SPECIAL", "Withheld", "Publisher asked"],
    ["02 - Other", "Cleared", ""],
    ["02 - Other", "Restricted", "Disagrees"],
    ["03 - Odd", "Perhaps", ""],
  ]);
  const file = (driveFileId: string, ...folders: string[]) => ({ driveFileId, folders });

  it("applies a folder rule to everything inside it", () => {
    expect(arrangementFor(file("a", "01 - Congregational", "Standard"), rules)).toBe("cleared");
  });

  it("prefers the deeper folder", () => {
    expect(arrangementFor(file("a", "01 - Congregational", "Chords", "Capo"), rules)).toBe("restricted");
  });

  it("matches folders regardless of case", () => {
    expect(arrangementFor(file("a", "01 - CONGREGATIONAL"), rules)).toBe("cleared");
  });

  it("does not match a folder by partial name", () => {
    expect(arrangementFor(file("a", "01 - Congregational Extra"), rules)).toBe("none");
  });

  it("lets a file rule beat every folder rule", () => {
    expect(arrangementFor(file("FILE_SPECIAL", "01 - Congregational"), rules)).toBe("withheld");
  });

  it("reports a conflict at the same level", () => {
    expect(arrangementFor(file("a", "02 - Other"), rules)).toBe("conflict");
  });

  it("reports an unreadable status as a conflict", () => {
    expect(arrangementFor(file("a", "03 - Odd"), rules)).toBe("conflict");
  });

  it("reports none when no rule covers the file", () => {
    expect(arrangementFor(file("a", "09 - Elsewhere"), rules)).toBe("none");
  });

  it("reads a sheet without the tab as no rules", () => {
    expect(parseFileRights([])).toEqual([]);
  });
});
