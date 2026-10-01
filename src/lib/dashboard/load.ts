import "server-only";

import { siteConfig } from "@/config/site";
import { listAccounts, listInvitations } from "@/lib/auth/clerk";
import type { Viewer } from "@/lib/auth/session";
import { instrumentCountsForUsers, rolesForUsers, sheetMusicTypesForUsers, titlesForUsers } from "@/lib/auth/store";
import { getSongList } from "@/lib/google-sheets";
import type { SheetMusicIndex } from "@/lib/sheet-music";
import { getSheetMusicIndex } from "@/lib/sheet-music-index";
import { typeLabel } from "@/lib/sheet-music-type";
import { getReportInputs } from "@/lib/song-archive";
import type { DatedService, Service } from "@/types/song-list";

import { invitationFollowUps, type InvitationFollowUps, type Person } from "./people";

/**
 * The Dashboard's reads, each failing soft: a source that is down leaves its
 * own sections out (or says so), and never takes the page down with it.
 * Everything here is a cached read the public pages already make, or an
 * admin read made only for someone whose permissions call for it.
 */

export interface MusicData {
  /** The visible months' services, placeholders included; null if the sheet failed. */
  services: Service[] | null;
  /** Every service that has happened, from the archive and the sheet. */
  past: DatedService[];
  /** Posted services still to come. */
  upcoming: DatedService[];
  index: SheetMusicIndex | null;
  loadedAt: number;
}

export async function loadMusicData(): Promise<MusicData> {
  const [songList, report, sheetMusic] = await Promise.all([getSongList(), getReportInputs(), getSheetMusicIndex()]);
  return {
    services: songList.ok ? songList.months.flatMap((month) => month.services) : null,
    past: report?.past ?? [],
    upcoming: report?.upcoming ?? [],
    index: sheetMusic.ok ? sheetMusic.index : null,
    loadedAt: report?.loadedAt ?? Date.now(),
  };
}

/** Everyone with an account here, with their roles and primary title; null if Clerk or the database failed. */
export async function loadPeople(viewer: Viewer): Promise<{ people: Person[]; instrumentCounts: Map<string, number> } | null> {
  try {
    const accounts = await listAccounts({ limit: 500, offset: 0 });
    if (!accounts.ok) return null;
    const ids = accounts.value.accounts.map((account) => account.id);
    const [roles, titles, instrumentCounts, sheetTypes] = await Promise.all([
      rolesForUsers(viewer.env, ids),
      titlesForUsers(viewer.env, ids),
      instrumentCountsForUsers(viewer.env, ids),
      sheetMusicTypesForUsers(viewer.env, ids),
    ]);
    return {
      people: accounts.value.accounts.map((account) => {
        const sheetType = sheetTypes.get(account.id);
        return {
          id: account.id,
          name: account.fullName,
          title: titles.get(account.id)?.[0]?.label ?? null,
          roleKeys: roles.get(account.id) ?? [],
          sheetMusic: sheetType ? typeLabel(sheetType) : null,
        };
      }),
      instrumentCounts,
    };
  } catch (error) {
    console.error("[dashboard] Could not load people:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

/** Invitations to chase up; null if Clerk could not be reached. */
export async function loadInvitationFollowUps(): Promise<InvitationFollowUps | null> {
  const [pending, expired] = await Promise.all([
    listInvitations({ status: "pending" }),
    listInvitations({ status: "expired" }),
  ]);
  if (!pending.ok || !expired.ok) return null;
  return invitationFollowUps(pending.value, expired.value, siteConfig.accounts.invitationDays, Date.now());
}
