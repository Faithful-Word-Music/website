/**
 * The administrator's view of the ministry's people on the Dashboard:
 *
 *   groupPeople()                 - Musicians, Song Leaders and those who
 *                                   are only Members, by their roles;
 *   invitationFollowUps()         - invitations that need chasing;
 *   musiciansWithoutInstruments() - musicians whose profile lacks the
 *                                   instruments the Dashboard relies on.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

import { MEMBER_ROLE, MUSICIAN_ROLE, SONG_LEADER_ROLE } from "@/lib/auth/permissions";

const DAY_MS = 86_400_000;

/** An invitation not accepted after this many days is worth a nudge. */
export const STALE_INVITATION_DAYS = 7;
/** Expired invitations are mentioned for this many days after they expire. */
export const EXPIRED_NOTICE_DAYS = 30;

export interface Person {
  id: string;
  name: string;
  /** Their primary title, if any. */
  title: string | null;
  roleKeys: string[];
  /** The sheet music type assigned to them ("Capo - Guitar"), if any. */
  sheetMusic: string | null;
}

export interface PeopleGroups {
  musicians: Person[];
  songLeaders: Person[];
  /** People holding no role beyond Member. */
  membersOnly: Person[];
}

export function groupPeople(people: readonly Person[]): PeopleGroups {
  const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);
  return {
    musicians: people.filter((person) => person.roleKeys.includes(MUSICIAN_ROLE)).sort(byName),
    songLeaders: people.filter((person) => person.roleKeys.includes(SONG_LEADER_ROLE)).sort(byName),
    membersOnly: people.filter((person) => person.roleKeys.every((key) => key === MEMBER_ROLE)).sort(byName),
  };
}

export function musiciansWithoutInstruments(
  musicians: readonly Person[],
  instrumentCounts: ReadonlyMap<string, number>,
): Person[] {
  return musicians.filter((person) => (instrumentCounts.get(person.id) ?? 0) === 0);
}

export interface InvitationLike {
  email: string;
  createdAt: number;
}

export interface InvitationFollowUps {
  /** Sent more than STALE_INVITATION_DAYS ago and still not accepted. */
  unanswered: InvitationLike[];
  /** Expired unused in the last EXPIRED_NOTICE_DAYS, and not sent again since. */
  expired: InvitationLike[];
}

export function invitationFollowUps(
  pending: readonly InvitationLike[],
  expired: readonly InvitationLike[],
  validDays: number,
  now: number,
): InvitationFollowUps {
  const pendingEmails = new Set(pending.map((invitation) => invitation.email.toLowerCase()));
  return {
    unanswered: pending.filter((invitation) => now - invitation.createdAt > STALE_INVITATION_DAYS * DAY_MS),
    expired: expired.filter((invitation) => {
      if (pendingEmails.has(invitation.email.toLowerCase())) return false;
      const expiredAt = invitation.createdAt + validDays * DAY_MS;
      return expiredAt <= now && now - expiredAt <= EXPIRED_NOTICE_DAYS * DAY_MS;
    }),
  };
}
