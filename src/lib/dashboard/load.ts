import "server-only";

import { siteConfig } from "@/config/site";
import { listAccounts, listInvitations } from "@/lib/auth/clerk";
import type { Viewer } from "@/lib/auth/session";
import {
  instrumentCountsForUsers,
  listSheetMusicTypes,
  rolesForUsers,
  sheetMusicTypesForUsers,
  titlesForUsers,
} from "@/lib/auth/store";
import { loadRoster, loadSongListServices } from "@/lib/availability/load";
import { addDays, churchDate, serviceOccurrences } from "@/lib/availability/occurrences";
import { listExceptions } from "@/lib/availability/store";
import { buildAvailabilitySummary, type AvailabilitySummary } from "@/lib/availability/summary";
import { getSongList } from "@/lib/google-sheets";
import type { SheetMusicIndex } from "@/lib/sheet-music";
import { getSheetMusicIndex } from "@/lib/sheet-music-index";
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
    const [roles, titles, instrumentCounts, sheetTypes, offered] = await Promise.all([
      rolesForUsers(viewer.env, ids),
      titlesForUsers(viewer.env, ids),
      instrumentCountsForUsers(viewer.env, ids),
      sheetMusicTypesForUsers(viewer.env, ids),
      listSheetMusicTypes(viewer.env),
    ]);
    return {
      people: accounts.value.accounts.map((account) => {
        // Their types in order of preference: "Capo (Chords) → Standard (Chords)".
        const labels = (sheetTypes.get(account.id) ?? []).flatMap(
          (id) => offered.find((type) => type.id === id)?.label ?? [],
        );
        return {
          id: account.id,
          name: account.fullName,
          title: titles.get(account.id)?.[0]?.label ?? null,
          roleKeys: roles.get(account.id) ?? [],
          sheetMusic: labels.length > 0 ? labels.join(" → ") : null,
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

/** How far ahead the Availability section looks for the person's own changes. */
const AVAILABILITY_DAYS = 365;

/**
 * The Availability section's summary (src/lib/availability/summary.ts);
 * null if the board could not be read.
 */
export async function loadAvailabilitySummary(viewer: Viewer): Promise<AvailabilitySummary | null> {
  try {
    const now = Date.now();
    const today = churchDate(now);
    const to = addDays(today, AVAILABILITY_DAYS);
    const [roster, exceptions, songList] = await Promise.all([
      loadRoster(viewer.env),
      listExceptions(viewer.env, today, to),
      loadSongListServices(),
    ]);
    const occurrences = serviceOccurrences(today, to, songList);
    return buildAvailabilitySummary({ occurrences, roster, exceptions, viewerId: viewer.userId, now });
  } catch (error) {
    console.error("[dashboard] Could not load availability:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}
