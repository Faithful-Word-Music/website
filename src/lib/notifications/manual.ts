/**
 * Announcements: notifications a person writes and sends by hand, from
 * Admin -> Notifications. What one IS, and every rule about one that needs
 * no server.
 *
 * An announcement is an ordinary notification. It is the event
 * "admin.announcement" (catalog.ts) handed to notify() like any other, so
 * the Announcements category's policy and each person's own choice decide
 * how it reaches them - nothing here knows a channel exists.
 *
 * WHO IT IS FOR is an AudienceSelection: any mix of
 *
 *   named        the audiences every feature uses (AUDIENCES in audience.ts)
 *   roles        any of the site's roles, the ones administrators made included
 *   userIds      particular people
 *   instrumentIds   everyone who plays one of these instruments
 *
 * Choosing several means anyone in ANY of them, each person once. Instruments
 * are not something the notification system knows about: the people who play
 * them are looked up first (manual-service.ts) and handed over as people, so
 * audience.ts stays about roles and permissions.
 *
 * WHAT IS KEPT of a send is the event itself: its payload is a snapshot of
 * exactly what was written and for whom (AnnouncementSnapshot), read back by
 * the send history. A template that is later edited or deleted changes
 * nothing already sent.
 *
 * Pure - no server-only import - so it is unit tested and shared with the
 * composer.
 */

import type { Permission } from "@/lib/auth/permissions";

import { AUDIENCES, anyOf, users, type Audience } from "./audience";
import type { DeliveryStatus } from "./push";
import { NOTIFICATION_LIMITS, isPriority, normalizeBody, normalizeTitle, safeActionUrl, type NotificationPriority } from "./model";

export const SEND_PERMISSION = "send_notifications" satisfies Permission;

export const ANNOUNCEMENT_EVENT = "admin.announcement";
/** What an announcement's event says it is about: itself, by a fresh id. */
export const ANNOUNCEMENT_ENTITY = "admin_announcement";

/** The named audiences the composer offers, in the order it shows them. */
export const MANUAL_AUDIENCES = [
  "everyone",
  "musicTeam",
  "musicians",
  "songLeaders",
  "planners",
  "administrators",
  "servicePlanViewers",
  "availabilityManagers",
  "aiUsers",
] as const satisfies ReadonlyArray<keyof typeof AUDIENCES>;

export type ManualAudienceKey = (typeof MANUAL_AUDIENCES)[number];

export interface AudienceSelection {
  named: ManualAudienceKey[];
  /** Role keys. */
  roles: string[];
  /** Clerk user IDs. */
  userIds: string[];
  instrumentIds: number[];
}

export const EMPTY_SELECTION: AudienceSelection = { named: [], roles: [], userIds: [], instrumentIds: [] };

export const MANUAL_LIMITS = {
  roles: 40,
  users: 200,
  instruments: 80,
  templateNameChars: 80,
  templates: 100,
  /** A page of the send history. */
  historyPage: 20,
} as const;

/** What the composer holds, and what a template keeps. */
export interface AnnouncementDraft {
  title: string;
  body: string;
  /** A page on this site, or null. */
  actionUrl: string | null;
  priority: NotificationPriority;
  audience: AudienceSelection;
}

/** Pages worth offering as a destination. Any other page on the site may be typed. */
export const DESTINATION_SUGGESTIONS = ["/song-list", "/availability", "/service-planner", "/library", "/dashboard", "/notifications"] as const;

function distinct<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

const isList = (value: unknown, max: number): value is unknown[] => Array.isArray(value) && value.length <= max;

/**
 * An audience selection exactly as it should be, or null: every part a list
 * of the right things, within its limit. Whether the roles, people and
 * instruments it names still exist is asked of the server
 * (manual-service.ts) - this only refuses what could never be one.
 */
export function parseSelection(value: unknown): AudienceSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { named, roles, userIds, instrumentIds } = value as Record<string, unknown>;
  if (!isList(named, MANUAL_AUDIENCES.length) || !named.every((key) => (MANUAL_AUDIENCES as readonly unknown[]).includes(key))) return null;
  if (!isList(roles, MANUAL_LIMITS.roles) || !roles.every((key) => typeof key === "string" && /^[a-z0-9_]{1,40}$/.test(key))) return null;
  if (!isList(userIds, MANUAL_LIMITS.users) || !userIds.every((id) => typeof id === "string" && /^user_\w{1,64}$/.test(id))) return null;
  if (!isList(instrumentIds, MANUAL_LIMITS.instruments) || !instrumentIds.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0)) {
    return null;
  }
  return {
    named: distinct(named as ManualAudienceKey[]),
    roles: distinct(roles as string[]),
    userIds: distinct(userIds as string[]),
    instrumentIds: distinct(instrumentIds as number[]),
  };
}

export function isEmptySelection(selection: AudienceSelection): boolean {
  return selection.named.length + selection.roles.length + selection.userIds.length + selection.instrumentIds.length === 0;
}

export type DraftProblem = "title" | "body" | "link" | "priority" | "audience";

export type DraftResult = { ok: true; draft: AnnouncementDraft } | { ok: false; problem: DraftProblem };

/**
 * A draft as it would be sent or kept: the title and message tidied and
 * within the notification limits, the link a page on this site, the priority
 * one of the three. `complete` is for sending - a message and an audience are
 * then required; a template may be kept without either.
 */
export function parseDraft(input: unknown, options: { complete: boolean }): DraftResult {
  const fields = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const title = normalizeTitle(fields.title);
  if (title === null) return { ok: false, problem: "title" };
  const body = normalizeBody(fields.body);
  if (body === null || (options.complete && body === "")) return { ok: false, problem: "body" };
  const actionUrl = safeActionUrl(typeof fields.actionUrl === "string" ? fields.actionUrl.trim() : fields.actionUrl);
  if (actionUrl === undefined) return { ok: false, problem: "link" };
  const priority = fields.priority ?? "normal";
  if (!isPriority(priority)) return { ok: false, problem: "priority" };
  const audience = parseSelection(fields.audience);
  if (!audience || (options.complete && isEmptySelection(audience))) return { ok: false, problem: "audience" };
  return { ok: true, draft: { title, body, actionUrl, priority, audience } };
}

/** How many characters of a title or message are left to type, as the limits count them. */
export const DRAFT_LIMITS = { title: NOTIFICATION_LIMITS.titleChars, body: NOTIFICATION_LIMITS.bodyChars, link: NOTIFICATION_LIMITS.actionUrlChars } as const;

/**
 * The selection as the notification system's own audience: anyone in any
 * part of it. `players` are the people who play the chosen instruments,
 * already looked up.
 */
export function toAudience(selection: AudienceSelection, players: readonly string[]): Audience {
  return anyOf(
    ...selection.named.map((key): Audience => AUDIENCES[key]),
    ...selection.roles.map((role): Audience => ({ kind: "role", role })),
    users(...selection.userIds, ...players),
  );
}

/** What the server knows a selection could name. */
export interface KnownAudience {
  roles: ReadonlyArray<{ key: string }>;
  instruments: ReadonlyArray<{ id: number }>;
  people: ReadonlyArray<{ id: string }>;
}

/**
 * A selection without whatever it names that is no longer there - a role
 * since deleted, someone whose account is gone - and whether anything was
 * left out. For loading a template or an old send into the composer: the
 * person sees what remains and chooses again. A SEND never does this
 * quietly; it is refused instead (manual-service.ts).
 */
export function pruneSelection(selection: AudienceSelection, known: KnownAudience): { selection: AudienceSelection; dropped: boolean } {
  const roles = selection.roles.filter((key) => known.roles.some((role) => role.key === key));
  const userIds = selection.userIds.filter((id) => known.people.some((person) => person.id === id));
  const instrumentIds = selection.instrumentIds.filter((id) => known.instruments.some((instrument) => instrument.id === id));
  return {
    selection: { named: [...selection.named], roles, userIds, instrumentIds },
    dropped: roles.length !== selection.roles.length || userIds.length !== selection.userIds.length || instrumentIds.length !== selection.instrumentIds.length,
  };
}

/** A selection in words, as it stood when it was sent: names, not ids. */
export interface AudienceLabels {
  named: string[];
  roles: string[];
  instruments: string[];
  people: string[];
}

/**
 * A selection in words, from the lists it chooses among. Anything it names
 * that is not in them is simply left out of the words (a send is refused for
 * that before it gets here: manual-service.ts).
 */
export function describeSelection(
  selection: AudienceSelection,
  named: Readonly<Record<ManualAudienceKey, string>>,
  known: {
    roles: ReadonlyArray<{ key: string; label: string }>;
    instruments: ReadonlyArray<{ id: number; label: string }>;
    people: ReadonlyArray<{ id: string; name: string }>;
  },
): AudienceLabels {
  const found = <T>(items: Array<T | undefined>): T[] => items.filter((item): item is T => item !== undefined);
  return {
    named: selection.named.map((key) => named[key]),
    roles: found(selection.roles.map((key) => known.roles.find((role) => role.key === key)?.label)),
    instruments: found(selection.instrumentIds.map((id) => known.instruments.find((instrument) => instrument.id === id)?.label)),
    people: found(selection.userIds.map((id) => known.people.find((person) => person.id === id)?.name)),
  };
}

/**
 * What a send was, kept as its event's payload. Everything the history shows
 * about the message itself comes from here, so nothing changed afterwards -
 * a template, a role's name, the sender's account - alters it.
 */
export interface AnnouncementSnapshot {
  v: 1;
  title: string;
  body: string;
  actionUrl: string | null;
  priority: NotificationPriority;
  audience: AudienceSelection;
  labels: AudienceLabels;
  /** How many people were told. */
  recipients: number;
  senderName: string;
  /** The template it was started from, as it was called then. */
  template: { id: number; name: string } | null;
}

const texts = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/**
 * A stored payload read back as a snapshot, or null when it is not one. It is
 * read leniently part by part - a history that cannot be shown is worse than
 * one with a gap.
 */
export function parseSnapshot(payload: unknown): AnnouncementSnapshot | null {
  if (!payload || typeof payload !== "object") return null;
  const stored = payload as Record<string, unknown>;
  if (typeof stored.title !== "string") return null;
  const labels = (stored.labels && typeof stored.labels === "object" ? stored.labels : {}) as Record<string, unknown>;
  const template = stored.template as { id?: unknown; name?: unknown } | null | undefined;
  return {
    v: 1,
    title: stored.title,
    body: typeof stored.body === "string" ? stored.body : "",
    actionUrl: safeActionUrl(stored.actionUrl) ?? null,
    priority: isPriority(stored.priority) ? stored.priority : "normal",
    audience: parseSelection(stored.audience) ?? EMPTY_SELECTION,
    labels: { named: texts(labels.named), roles: texts(labels.roles), instruments: texts(labels.instruments), people: texts(labels.people) },
    recipients: typeof stored.recipients === "number" && stored.recipients >= 0 ? stored.recipients : 0,
    senderName: typeof stored.senderName === "string" ? stored.senderName : "",
    template: template && typeof template.id === "number" && typeof template.name === "string" ? { id: template.id, name: template.name } : null,
  };
}

/** One attempt to reach one device, as the history may show it: never the device's address or keys. */
export interface DeliveryAttempt {
  userId: string;
  /** "Chrome on Windows", as it was. */
  device: string;
  status: DeliveryStatus;
  attemptedAt: string;
}

export interface DeliverySummary {
  /** Every attempt: one per device per person. */
  attempts: number;
  /** Attempts a push service accepted. Not proof that a device showed it. */
  sent: number;
  failed: number;
  /** Attempts answered "that device is gone". */
  expired: number;
  /** People with at least one attempt a push service accepted. */
  reached: number;
  /**
   * People told for whom no push was attempted: push is off for them, or
   * they have no device registered, or push is not set up. The table cannot
   * say which.
   */
  notAttempted: number;
}

/** A send's push attempts, added up. `recipientIds` is everyone told. */
export function summarizeDeliveries(recipientIds: readonly string[], attempts: readonly DeliveryAttempt[]): DeliverySummary {
  const count = (status: DeliveryStatus) => attempts.filter((attempt) => attempt.status === status).length;
  const tried = new Set(attempts.map((attempt) => attempt.userId));
  const reached = new Set(attempts.filter((attempt) => attempt.status === "sent").map((attempt) => attempt.userId));
  return {
    attempts: attempts.length,
    sent: count("sent"),
    failed: count("failed"),
    expired: count("expired"),
    reached: reached.size,
    notAttempted: recipientIds.filter((userId) => !tried.has(userId)).length,
  };
}
