/**
 * The Phase 1 sources of "Needs your attention" items. Each takes real data
 * and returns nothing when there is nothing to do - never an item that says
 * "0 of something".
 *
 * A new feature adds its own provider here (or beside its own code) and the
 * Dashboard passes its result to collectAttention().
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import { availabilityContent } from "@/content/availability";
import { dashboardContent } from "@/content/dashboard";

import type { AttentionItem } from "./attention";
import type { DashboardFocus } from "./focus";

const copy = dashboardContent.attention;

/** "a, b and c" */
function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Everyone: whatever their profile still lacks (missingProfileItems()). */
export function profileAttention(missing: readonly string[]): AttentionItem[] {
  if (missing.length === 0) return [];
  return [
    {
      id: "profile:incomplete",
      priority: "low",
      title: copy.profile.title,
      detail: copy.profile.detail.replace("{items}", listOf(missing.map((item) => item.charAt(0).toLowerCase() + item.slice(1)))),
      href: "/profile/edit",
      action: copy.profile.action,
    },
  ];
}

/** "1 thing" / "2 things": picks the wording for a count and fills it in. */
function counted(forms: readonly [string, string], count: number): string {
  return (count === 1 ? forms[0] : forms[1]).replace("{count}", String(count));
}

/** People who look after sheet music: upcoming songs with gaps (see sheet-gaps.ts). */
export function sheetGapAttention(focus: DashboardFocus, gaps: readonly unknown[] | null): AttentionItem[] {
  if (!focus.managesSheetMusic || !gaps || gaps.length === 0) return [];
  return [
    {
      id: "music:sheet-gaps",
      priority: "normal",
      title: counted(copy.sheetGaps.title, gaps.length),
      detail: copy.sheetGaps.detail,
      href: "#sheet-music-gaps",
      action: copy.sheetGaps.action,
    },
  ];
}

/** People who manage accounts: invitations that were never accepted. */
export function invitationAttention(
  focus: DashboardFocus,
  followUps: { unanswered: readonly unknown[]; expired: readonly unknown[] } | null,
): AttentionItem[] {
  if (!focus.reviewsAccounts || !followUps) return [];
  const total = followUps.unanswered.length + followUps.expired.length;
  if (total === 0) return [];
  const parts = [
    followUps.unanswered.length > 0 ? counted(copy.invitations.unanswered, followUps.unanswered.length) : null,
    followUps.expired.length > 0 ? counted(copy.invitations.expired, followUps.expired.length) : null,
  ].filter(Boolean);
  return [
    {
      id: "admin:invitations",
      priority: "normal",
      title: counted(copy.invitations.title, total),
      detail: parts.join(" · "),
      href: "/admin/invitations",
      action: copy.invitations.action,
    },
  ];
}

/** People who look after sheet music: musicians with no sheet music type, who get no links. */
export function sheetTypeAttention(
  focus: DashboardFocus,
  missing: ReadonlyArray<{ id: string; name: string }> | null,
): AttentionItem[] {
  if (!focus.managesSheetMusic || !missing || missing.length === 0) return [];
  const one = missing.length === 1;
  return [
    {
      id: "music:sheet-types",
      priority: "normal",
      title: counted(copy.sheetTypes.title, missing.length),
      detail: copy.sheetTypes.detail.replace("{names}", listOf(missing.map((person) => person.name))),
      href: one ? `/admin/users/${missing[0].id}` : "#people",
      action: one ? copy.sheetTypes.action[0] : copy.sheetTypes.action[1],
    },
  ];
}

/** People who see profiles: musicians who have not listed an instrument. */
export function instrumentAttention(
  focus: DashboardFocus,
  missing: ReadonlyArray<{ id: string; name: string }> | null,
): AttentionItem[] {
  if (!focus.seesProfiles || !missing || missing.length === 0) return [];
  const one = missing.length === 1;
  return [
    {
      id: "admin:musician-instruments",
      priority: "low",
      title: counted(copy.instruments.title, missing.length),
      detail: copy.instruments.detail.replace("{names}", listOf(missing.map((person) => person.name))),
      href: one ? `/admin/users/${missing[0].id}` : "/admin/users",
      action: one ? copy.instruments.action[0] : copy.instruments.action[1],
    },
  ];
}

/** People who review account requests (manage_users), when any are waiting. */
export function accountRequestAttention(focus: DashboardFocus, pending: number | null): AttentionItem[] {
  if (!focus.reviewsAccounts || !pending || pending <= 0) return [];
  return [
    {
      id: "admin:account-requests",
      priority: "normal",
      title: counted(copy.requests.title, pending),
      detail: copy.requests.detail,
      href: "/admin/requests?status=pending",
      action: copy.requests.action,
    },
  ];
}

/**
 * Availability participants with no normal services: nobody knows when to
 * expect them. Low priority - the Availability section is always there too.
 * `normal` is null when the person is not on the availability board.
 */
export function availabilityAttention(
  focus: DashboardFocus,
  normal: readonly string[] | null,
): AttentionItem[] {
  if (!focus.tracksAvailability || normal === null || normal.length > 0) return [];
  const text = availabilityContent.attention;
  return [
    {
      id: "availability:normal",
      priority: "low",
      title: text.title,
      detail: text.detail,
      href: "/availability#normal",
      action: text.action,
    },
  ];
}
