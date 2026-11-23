import type { IndexSong, SheetFormat } from "@/lib/sheet-music";

import { SONG_LEADER_ROLE, type PermissionOverride } from "./permissions";
import { resolveSheetEntitlement } from "./sheet-entitlement";

/**
 * What activating sheet access would change, worked out from the real data.
 * Pure, so what an Administrator is shown before pressing Activate is tested.
 */

export interface ImpactPerson {
  id: string;
  name: string;
}

export interface AccessImpact {
  total: number;
  /** Have sheet music now and after. */
  keep: number;
  /** Have it now and would lose it. */
  lose: ImpactPerson[];
  /** Do not have it now and would gain it. */
  gain: ImpactPerson[];
  /** Do not have it either way. */
  unchangedWithout: number;
}

export function accessImpact(input: {
  accounts: readonly ImpactPerson[];
  userRoles: ReadonlyMap<string, readonly string[]>;
  rolePermissions: ReadonlyMap<string, readonly string[]>;
  overrides: ReadonlyMap<string, readonly PermissionOverride[]>;
  affiliations: ReadonlyMap<string, "verified" | "revoked">;
}): AccessImpact {
  const impact: AccessImpact = { total: input.accounts.length, keep: 0, lose: [], gain: [], unchangedWithout: 0 };
  // Activation gives the Song Leader role sheet music, so "after" must include it.
  const afterPermissions = new Map(input.rolePermissions);
  afterPermissions.set(SONG_LEADER_ROLE, [...(input.rolePermissions.get(SONG_LEADER_ROLE) ?? []), "view_sheet_music"]);
  for (const person of input.accounts) {
    const facts = {
      roleKeys: input.userRoles.get(person.id) ?? [],
      overrides: input.overrides.get(person.id) ?? [],
      affiliation: input.affiliations.get(person.id) ?? null,
    };
    const before = resolveSheetEntitlement({ ...facts, rolePermissions: input.rolePermissions, mode: "legacy" }).entitled;
    const after = resolveSheetEntitlement({ ...facts, rolePermissions: afterPermissions, mode: "enforcing" }).entitled;
    if (before && after) impact.keep += 1;
    else if (before) impact.lose.push(person);
    else if (after) impact.gain.push(person);
    else impact.unchangedWithout += 1;
  }
  return impact;
}

export interface WithheldFile {
  songId: string;
  title: string;
  label: string;
  format: SheetFormat;
  /** The file's slug. Never its Drive ID. */
  file: string;
}

export interface FileImpact {
  public: number;
  restricted: number;
  withheld: number;
  withheldFiles: WithheldFile[];
}

/** Files by class, from an index classified as enforcing. */
export function fileImpact(songs: readonly IndexSong[]): FileImpact {
  const impact: FileImpact = { public: 0, restricted: 0, withheld: 0, withheldFiles: [] };
  for (const song of songs) {
    for (const version of song.versions) {
      for (const file of version.files) {
        const resource = file.eligibility ?? "withheld";
        impact[resource] += 1;
        if (resource === "withheld") {
          impact.withheldFiles.push({ songId: song.id, title: song.title, label: version.label, format: file.format, file: file.slug });
        }
      }
    }
  }
  return impact;
}

export interface UpcomingWithheld {
  date: string;
  dateLabel: string;
  title: string;
}

/** Songs in upcoming services that would have no openable sheet music at all. */
export function upcomingWithheld<S extends { title: string }>(
  services: ReadonlyArray<{ date: string | null; dateLabel: string; songs: readonly S[] }>,
  find: (song: S) => IndexSong | null,
  today: string,
): UpcomingWithheld[] {
  const found: UpcomingWithheld[] = [];
  for (const service of services) {
    if (!service.date || service.date < today) continue;
    for (const song of service.songs) {
      const match = find(song);
      if (!match) continue;
      const files = match.versions.flatMap((version) => version.files);
      if (files.length > 0 && files.every((file) => (file.eligibility ?? "withheld") === "withheld")) {
        found.push({ date: service.date, dateLabel: service.dateLabel, title: song.title });
      }
    }
  }
  return found;
}
