import type { Rights } from "@/lib/sheet-music";

import {
  ADMIN_ROLE,
  MEMBER_ROLE,
  MUSICIAN_ROLE,
  resolvePermissions,
  type Permission,
  type PermissionOverride,
} from "./permissions";
import type { SheetPolicyMode } from "./sheet-policy-state";

/**
 * Who may have which sheet music file. THE ONE PLACE this is decided, in three
 * parts, all pure:
 *
 *   classifyResource         what a file is: public, restricted or withheld
 *   resolveSheetEntitlement  what a person holds, and why
 *   decideSheetAccess        the answer for one person and one file
 *
 * Nothing here trusts the browser, and a reason is an explanation for
 * administrators, never proof of access.
 */

export type SheetResourceClass = "public" | "restricted" | "withheld";
export type ArrangementRights = "cleared" | "restricted" | "withheld" | "none" | "conflict";
export type SheetPurpose = "open" | "distribute";

export type SheetReason =
  | "public_resource"
  | "verified_affiliation"
  | "musician_role"
  | "role_permission"
  | "individual_grant"
  | "individual_deny"
  | "no_entitlement"
  | "resource_withheld"
  | "withheld_review";

export interface SheetFacts {
  mode: SheetPolicyMode;
  roleKeys: readonly string[];
  rolePermissions: ReadonlyMap<string, readonly string[]>;
  overrides: readonly PermissionOverride[];
  affiliation: "verified" | "revoked" | null;
}

export interface SheetEntitlement {
  entitled: boolean;
  reason: SheetReason;
  /** Every source that qualifies, for the administrators' explanation. */
  sources: readonly SheetReason[];
  /** Held through something other than affiliation, so it may be handed on to others. */
  delegable: boolean;
  /** May open a withheld file, one at a time, to review it. */
  mayReviewWithheld: boolean;
}

export type SheetSubject =
  | { kind: "anonymous" }
  | { kind: "account"; entitlement: SheetEntitlement; profileBlocked: boolean };

export interface SheetDecision {
  allowed: boolean;
  reason: SheetReason;
  resource: SheetResourceClass;
}

const SHEET: Permission = "view_sheet_music";

export function resolveSheetEntitlement(facts: SheetFacts): SheetEntitlement {
  const { mode, roleKeys, rolePermissions, overrides, affiliation } = facts;
  const individual = overrides.filter((override) => override.permission === SHEET);
  const denied = individual.some((override) => override.effect === "deny");

  const holdsRoleGrant =
    roleKeys.includes(ADMIN_ROLE) ||
    roleKeys.some((role) => role !== MEMBER_ROLE && (rolePermissions.get(role) ?? []).includes(SHEET)) ||
    // Until this environment is activated, the Member grant still stands.
    (mode === "legacy" && (rolePermissions.get(MEMBER_ROLE) ?? []).includes(SHEET));

  const sources: SheetReason[] = [];
  if (individual.some((override) => override.effect === "grant")) sources.push("individual_grant");
  if (affiliation === "verified") sources.push("verified_affiliation");
  if (roleKeys.includes(MUSICIAN_ROLE)) sources.push("musician_role");
  if (holdsRoleGrant) sources.push("role_permission");

  const entitled = !denied && sources.length > 0;
  return {
    entitled,
    reason: denied ? "individual_deny" : (sources[0] ?? "no_entitlement"),
    sources,
    delegable: entitled && sources.some((source) => source !== "verified_affiliation"),
    mayReviewWithheld: !denied && resolvePermissions(roleKeys, rolePermissions, overrides).has("manage_sheet_music"),
  };
}

/** A person's permissions with view_sheet_music exactly matching their entitlement. */
export function projectSheetPermission(permissions: ReadonlySet<Permission>, entitlement: SheetEntitlement): Set<Permission> {
  const projected = new Set(permissions);
  if (entitlement.entitled) projected.add(SHEET);
  else projected.delete(SHEET);
  return projected;
}

/**
 * What a file is. Public needs both the composition and the arrangement
 * cleared; a cleared arrangement never makes a copyrighted song public.
 * Anything unreviewed, missing or conflicting is withheld. Before activation
 * (legacy) the Index's song-level answer stands, as it always has.
 */
export function classifyResource(rights: Rights, arrangement: ArrangementRights, mode: SheetPolicyMode): SheetResourceClass {
  if (mode === "legacy") return rights === "cleared" ? "public" : "restricted";
  if (rights !== "cleared" && rights !== "copyrighted") return "withheld";
  if (arrangement !== "cleared" && arrangement !== "restricted") return "withheld";
  return rights === "cleared" && arrangement === "cleared" ? "public" : "restricted";
}

/**
 * The answer for one person and one file. `distribute` (packets, Dashboard
 * links, print options) is the default; only the single-file route asks for
 * `open`, the one purpose a withheld file can be reviewed under.
 */
export function decideSheetAccess(
  resource: SheetResourceClass,
  subject: SheetSubject,
  purpose: SheetPurpose = "distribute",
): SheetDecision {
  const answer = (allowed: boolean, reason: SheetReason): SheetDecision => ({ allowed, reason, resource });
  if (resource === "public") return answer(true, "public_resource");
  if (subject.kind === "anonymous" || subject.profileBlocked) {
    return answer(false, resource === "withheld" ? "resource_withheld" : "no_entitlement");
  }
  const { entitlement } = subject;
  if (resource === "withheld") {
    return entitlement.mayReviewWithheld && purpose === "open"
      ? answer(true, "withheld_review")
      : answer(false, "resource_withheld");
  }
  return answer(entitlement.entitled, entitlement.reason);
}

/* ------------------------------------------------------------------------ */
/* The Index's File Rights tab                                              */
/* ------------------------------------------------------------------------ */

type RuleStatus = "cleared" | "restricted" | "withheld" | "invalid";

export interface FileRightsRule {
  /** A Drive file ID ("id:..." in the sheet), or null for a folder rule. */
  fileId: string | null;
  /** Lower-cased folder names below "Sheet Music"; empty for a file rule. */
  path: string[];
  status: RuleStatus;
}

function ruleStatus(value: string): RuleStatus {
  const status = value.trim().toLowerCase();
  return status === "cleared" || status === "restricted" || status === "withheld" ? status : "invalid";
}

/** The tab's rows: "Target" is a folder path ("01 - Congregational/Chords") or "id:<Drive file ID>". */
export function parseFileRights(grid: readonly (readonly string[])[]): FileRightsRule[] {
  const headerAt = grid.slice(0, 5).findIndex((row) => {
    const names = row.map((cell) => cell.trim().toLowerCase());
    return names.includes("target") && names.includes("arrangement rights");
  });
  if (headerAt === -1) return [];
  const names = grid[headerAt].map((cell) => cell.trim().toLowerCase());
  const targetColumn = names.indexOf("target");
  const statusColumn = names.indexOf("arrangement rights");

  const rules: FileRightsRule[] = [];
  for (const row of grid.slice(headerAt + 1)) {
    const target = (row[targetColumn] ?? "").trim();
    if (!target) continue;
    const status = ruleStatus(row[statusColumn] ?? "");
    if (target.toLowerCase().startsWith("id:")) {
      rules.push({ fileId: target.slice(3).trim(), path: [], status });
    } else {
      rules.push({ fileId: null, path: target.split("/").map((part) => part.trim().toLowerCase()), status });
    }
  }
  return rules;
}

function agreed(rules: readonly FileRightsRule[]): ArrangementRights {
  const statuses = new Set(rules.map((rule) => rule.status));
  if (statuses.size !== 1) return "conflict";
  const [status] = statuses;
  return status === "invalid" ? "conflict" : status;
}

/** The most specific rule for a file: its own ID, then the deepest folder. */
export function arrangementFor(
  file: { driveFileId: string; folders?: readonly string[] },
  rules: readonly FileRightsRule[],
): ArrangementRights {
  const own = rules.filter((rule) => rule.fileId === file.driveFileId);
  if (own.length > 0) return agreed(own);

  const folders = (file.folders ?? []).map((folder) => folder.toLowerCase());
  const holding = rules.filter(
    (rule) => rule.fileId === null && rule.path.length <= folders.length && rule.path.every((part, at) => part === folders[at]),
  );
  if (holding.length === 0) return "none";
  const deepest = Math.max(...holding.map((rule) => rule.path.length));
  return agreed(holding.filter((rule) => rule.path.length === deepest));
}
