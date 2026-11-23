import "server-only";

import { createHash } from "node:crypto";

import { siteConfig } from "@/config/site";
import { getSchedule } from "@/lib/schedule";
import { classify, matchIndexSong } from "@/lib/sheet-music";
import { getSheetMusicSources } from "@/lib/sheet-music-index";

import type { ClerkEnv } from "./clerk-env";
import { listAccounts } from "./clerk";
import type { MembershipSql } from "./membership-store";
import type { PermissionOverride } from "./permissions";
import {
  accessImpact,
  fileImpact,
  upcomingWithheld,
  type AccessImpact,
  type FileImpact,
  type ImpactPerson,
  type UpcomingWithheld,
} from "./sheet-access-report";
import { isMembershipInstalled, membershipClient, sheetMusicTypesForSite } from "./store";

/**
 * The Sheet Access page's data: what activating would change here, from the
 * real accounts, roles and Index. Reads only. Activation itself is one
 * database function (activate_sheet_access in membership-schema.mjs).
 */

export interface SheetAccessReport {
  activated: boolean;
  rolledBack: boolean;
  activatedAt: string | null;
  /** The database fingerprint activation re-checks. */
  stateHash: string;
  /** Covers the people and file results shown, so what is activated is what was reviewed. */
  reportHash: string;
  verifiedMembers: number;
  people: AccessImpact;
  files: FileImpact;
  upcoming: UpcomingWithheld[];
}

export type SheetAccessReportResult =
  | { ok: true; report: SheetAccessReport }
  | { ok: false; problem: "not-installed" | "accounts" | "index" | "schedule" };

const ACCOUNT_PAGE = 100;
const MAX_ACCOUNT_PAGES = 50;

async function everyAccount(): Promise<ImpactPerson[] | null> {
  const people: ImpactPerson[] = [];
  for (let page = 0; page < MAX_ACCOUNT_PAGES; page += 1) {
    const result = await listAccounts({ limit: ACCOUNT_PAGE, offset: page * ACCOUNT_PAGE, order: "oldest" });
    if (!result.ok) return null;
    people.push(...result.value.accounts.map((account) => ({ id: account.id, name: account.fullName })));
    if (result.value.accounts.length < ACCOUNT_PAGE || people.length >= result.value.total) {
      return people.length >= result.value.total ? people : null;
    }
  }
  return null;
}

interface StateRow {
  hash: string;
  latched: boolean;
  activated_at: string | Date | null;
  rolled_back: boolean;
  user_roles: Array<{ user: string; role: string }>;
  role_permissions: Array<{ role: string; permission: string }>;
  overrides: Array<PermissionOverride & { user: string }>;
  affiliations: Array<{ user: string; status: "verified" | "revoked" }>;
}

function group<K, V>(rows: readonly K[], key: (row: K) => string, value: (row: K) => V): Map<string, V[]> {
  const map = new Map<string, V[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), value(row)]);
  return map;
}

async function readState(sql: MembershipSql, env: ClerkEnv): Promise<StateRow> {
  const [row] = await sql.query(
    `SELECT sheet_access_state_hash($1) AS hash,
       EXISTS (SELECT 1 FROM sheet_access_latches WHERE clerk_env = $1) AS latched,
       (SELECT set_at FROM sheet_access_latches WHERE clerk_env = $1) AS activated_at,
       EXISTS (SELECT 1 FROM sheet_access_migration_runs WHERE clerk_env = $1 AND kind = 'rollback') AS rolled_back,
       COALESCE((SELECT json_agg(json_build_object('user', clerk_user_id, 'role', role_key))
                   FROM user_roles WHERE clerk_env = $1), '[]') AS user_roles,
       COALESCE((SELECT json_agg(json_build_object('role', role_key, 'permission', permission))
                   FROM role_permissions WHERE clerk_env = $1), '[]') AS role_permissions,
       COALESCE((SELECT json_agg(json_build_object('user', clerk_user_id, 'permission', permission, 'effect', effect))
                   FROM user_permission_overrides WHERE clerk_env = $1), '[]') AS overrides,
       COALESCE((SELECT json_agg(json_build_object('user', clerk_user_id, 'status', status))
                   FROM user_church_affiliations WHERE clerk_env = $1), '[]') AS affiliations`,
    [env],
  );
  return row as unknown as StateRow;
}

export async function loadSheetAccessReport(env: ClerkEnv): Promise<SheetAccessReportResult> {
  if (!(await isMembershipInstalled(env))) return { ok: false, problem: "not-installed" };
  const sql = await membershipClient(env);

  const [state, accounts, sources, types, schedule] = await Promise.all([
    readState(sql, env),
    everyAccount(),
    getSheetMusicSources(),
    sheetMusicTypesForSite(),
    getSchedule(),
  ]);
  if (!accounts) return { ok: false, problem: "accounts" };
  if (!sources.ok) return { ok: false, problem: "index" };
  if (!schedule.ok) return { ok: false, problem: "schedule" };

  const affiliations = new Map(state.affiliations.map((row) => [row.user, row.status]));
  const people = accessImpact({
    accounts,
    userRoles: group(state.user_roles, (row) => row.user, (row) => row.role),
    rolePermissions: group(state.role_permissions, (row) => row.role, (row) => row.permission),
    overrides: group(state.overrides, (row) => row.user, ({ permission, effect }) => ({ permission, effect })),
    affiliations,
  });

  const index = classify(sources.sources, types, "enforcing");
  const files = fileImpact(index.songs);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: siteConfig.songList.timeZone });
  const upcoming = upcomingWithheld(
    schedule.months.flatMap((month) => month.services).filter((service) => !service.placeholder),
    (song) => matchIndexSong(index, song, siteConfig.sheetMusic.hymnalCollection),
    today,
  );

  const reportHash = createHash("sha256")
    .update(
      JSON.stringify({
        state: state.hash,
        lose: people.lose.map((person) => person.id).sort(),
        gain: people.gain.map((person) => person.id).sort(),
        counts: [files.public, files.restricted, files.withheld],
        withheld: files.withheldFiles.map((file) => `${file.songId}/${file.file}`).sort(),
      }),
    )
    .digest("hex");

  return {
    ok: true,
    report: {
      activated: state.latched,
      rolledBack: state.rolled_back,
      activatedAt: state.activated_at ? new Date(state.activated_at).toISOString() : null,
      stateHash: state.hash,
      reportHash,
      verifiedMembers: state.affiliations.filter((row) => row.status === "verified").length,
      people,
      files,
      upcoming,
    },
  };
}

/** Runs activation. The function re-checks the fingerprint inside its own transaction. */
export async function runSheetAccessActivation(
  env: ClerkEnv,
  stateHash: string,
  reportHash: string,
  actor: string,
): Promise<"activated" | "already" | "stale"> {
  const sql = await membershipClient(env);
  const [row] = await sql.query(`SELECT activate_sheet_access($1, $2, $3, $4) AS result`, [env, stateHash, reportHash, actor]);
  return (row.result as { status: "activated" | "already" | "stale" }).status;
}

export async function runSheetAccessRollback(env: ClerkEnv, actor: string): Promise<"rolled_back" | "already" | "not_activated"> {
  const sql = await membershipClient(env);
  const [row] = await sql.query(`SELECT rollback_sheet_access($1, $2) AS result`, [env, actor]);
  return (row.result as { status: "rolled_back" | "already" | "not_activated" }).status;
}
