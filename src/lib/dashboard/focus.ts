/**
 * What is most relevant to one signed-in person - the Dashboard's sense of
 * who it is talking to.
 *
 * Four kinds of information, each with its own job:
 *
 *   permissions            -> what they MAY do (and what may be linked)
 *   roles                  -> their broad responsibilities
 *   titles, instruments    -> what is most relevant to them
 *   current data           -> what deserves attention right now
 *
 * A focus never grants anything: being a musician brings "Songs to brush up
 * on", nothing more. (Which sheet music someone is given is not worked out
 * here at all - it is assigned to them; see src/lib/sheet-music-type.ts.)
 * Capabilities below are read from permissions (never role names), so a
 * custom role holding the right permission gets the same Dashboard as the
 * built-in one.
 *
 * Several responsibilities make one focus, not several dashboards: an
 * administrator who is also music director and pianist gets one page whose
 * sections each draw on the parts of the focus they need.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import {
  MUSICIAN_ROLE,
  PEOPLE_PERMISSIONS,
  SONG_LEADER_ROLE,
  canAccessAdmin,
  type Permission,
} from "@/lib/auth/permissions";

export interface DashboardFocus {
  /** Plays in services: the Musician role, or an instrument on their profile. */
  plays: boolean;
  /** Leads congregational singing: the Song Leader role or title. */
  leadsSinging: boolean;
  /** Their titles, primary first, for display. */
  titles: string[];

  // Capabilities - from permissions only.
  /** Holds any permission that opens the admin area. */
  administers: boolean;
  /** May review account requests and invitations (manage_users). */
  reviewsAccounts: boolean;
  /** May open members-only sheet music (view_sheet_music). */
  opensMemberSheetMusic: boolean;
  /** Looks after the sheet music (manage_sheet_music). */
  managesSheetMusic: boolean;
  /** Sees song statistics (view_analytics). */
  seesAnalytics: boolean;
  /** Sees everyone's profiles (view_profiles). */
  seesProfiles: boolean;
  /** May open the admin People pages - the same permissions as that tab. */
  seesPeople: boolean;
}

export interface FocusInput {
  roleKeys: readonly string[];
  permissions: ReadonlySet<Permission>;
  titles: ReadonlyArray<{ label: string; isPrimary: boolean }>;
  instruments: ReadonlyArray<{ label: string; isPrimary: boolean }>;
}

const SONG_LEADER_TITLE = "song leader";

export function buildFocus(input: FocusInput): DashboardFocus {
  const titles = [...input.titles].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((title) => title.label);
  const titleKeys = titles.map((title) => title.trim().toLowerCase());

  return {
    plays: input.roleKeys.includes(MUSICIAN_ROLE) || input.instruments.length > 0,
    leadsSinging: input.roleKeys.includes(SONG_LEADER_ROLE) || titleKeys.includes(SONG_LEADER_TITLE),
    titles,
    administers: canAccessAdmin(input.permissions),
    reviewsAccounts: input.permissions.has("manage_users"),
    opensMemberSheetMusic: input.permissions.has("view_sheet_music"),
    managesSheetMusic: input.permissions.has("manage_sheet_music"),
    seesAnalytics: input.permissions.has("view_analytics"),
    seesProfiles: input.permissions.has("view_profiles"),
    seesPeople: PEOPLE_PERMISSIONS.some((permission) => input.permissions.has(permission)),
  };
}

/** Whether the person makes music in services, so the services' music matters to them. */
export function servesInMusic(focus: DashboardFocus): boolean {
  return focus.plays || focus.leadsSinging;
}
