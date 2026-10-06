import type { Permission } from "@/lib/auth/permissions";

import { needsEveryAccount, resolveAudience, type Audience, type Directory } from "./audience";
import { NOTIFICATION_EVENTS, isNotificationEvent, type NotificationEventDefinition, type NotificationEventKey } from "./catalog";
import {
  CHANNELS,
  CHANNEL_STATUS,
  NOTIFICATION_LIMITS,
  allowedPolicies,
  effectiveSetting,
  isChannel,
  isChannelPolicy,
  isPriority,
  normalizeBody,
  normalizeTitle,
  safeActionUrl,
  type CategoryPolicies,
  type Channel,
  type ChannelPolicy,
  type EffectiveSetting,
  type NotificationCategory,
  type NotificationItem,
  type NotificationPriority,
} from "./model";

/**
 * Notifications: THE one way one is made, read and configured.
 *
 *   something happens
 *     -> notify()                       the feature names the event and audience
 *     -> a notification event           what happened, once
 *     -> recipients resolved            audience.ts, from roles and permissions
 *     -> each channel's effective       the category's policy + the person's own
 *        setting, per recipient         choice (effectiveSetting in model.ts)
 *     -> one notification per person    durable: its title and body are stored
 *     -> the channels that deliver      in the app now; push and email later
 *
 * A feature never inserts a notification row, never looks at a policy and
 * never knows which channels exist: it calls notify() and is done.
 *
 * Who may do what:
 *
 *   their own notifications    anyone signed in: read, mark read and unread.
 *                              Every query takes the recipient from the person
 *                              asking, so someone else's is simply not found.
 *   their own choices          anyone signed in, within what the policy allows
 *   category policies          manage_notifications only
 *
 * What it needs from the server comes in as `deps`, so every rule is unit
 * tested without a database (notifications.test.ts). store.ts supplies the
 * real ones.
 */

export const MANAGE_PERMISSION = "manage_notifications" satisfies Permission;

export interface NotificationActor {
  userId: string;
  can(permission: Permission): boolean;
}

export interface PolicyRow {
  category: string;
  channel: Channel;
  policy: ChannelPolicy;
}

export interface PreferenceRow {
  userId: string;
  category: string;
  channel: Channel;
  enabled: boolean;
}

/** One event and the notifications made from it, written together. */
export interface NotificationWrite {
  category: string;
  eventKey: string;
  actorUserId: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, unknown>;
  title: string;
  body: string;
  actionUrl: string | null;
  priority: NotificationPriority;
  recipients: ReadonlyArray<{ userId: string; inApp: boolean }>;
}

export interface NotificationDeps {
  /** Every category, retired ones included, in order. */
  listCategories(): Promise<NotificationCategory[]>;
  listPolicies(): Promise<PolicyRow[]>;
  setPolicy(write: PolicyRow & { userId: string }): Promise<void>;
  /** The explicit choices these people have made. Nobody's defaults are stored. */
  listPreferences(userIds: readonly string[]): Promise<PreferenceRow[]>;
  setPreference(write: PreferenceRow): Promise<void>;
  /** Roles, role permissions and exceptions; `accountIds` left empty. */
  loadDirectory(): Promise<Directory>;
  /** Every account's ID (from Clerk). Only asked for when an audience needs it. */
  listAccountIds(): Promise<string[]>;
  record(write: NotificationWrite): Promise<{ eventId: number }>;
  /** A person's own notifications in the app, newest first, older than `before`. */
  list(userId: string, options: { before: number | null; limit: number }): Promise<NotificationItem[]>;
  countUnread(userId: string): Promise<number>;
  /** Marks one of THIS person's notifications. False when it is not theirs, or not there. */
  setRead(userId: string, id: number, read: boolean): Promise<boolean>;
  setAllRead(userId: string): Promise<void>;
}

export type NotificationProblem = "forbidden" | "invalid" | "not-found" | "unknown-category" | "locked" | "unavailable" | "not-allowed";

const no = <T extends NotificationProblem>(problem: T) => ({ ok: false as const, problem });

// ---------------------------------------------------------------------------
// Policies and choices
// ---------------------------------------------------------------------------

/** Each category's policy per channel. A channel with no row is not offered. */
function policiesByCategory(rows: readonly PolicyRow[]): Map<string, CategoryPolicies> {
  const result = new Map<string, CategoryPolicies>();
  for (const row of rows) {
    const policies = result.get(row.category) ?? { in_app: "unavailable", push: "unavailable", email: "unavailable" };
    policies[row.channel] = row.policy;
    result.set(row.category, policies);
  }
  return result;
}

const NOT_OFFERED: CategoryPolicies = { in_app: "unavailable", push: "unavailable", email: "unavailable" };

/** One person's stored choice for a category and channel, or null when they never made one. */
function storedChoice(rows: readonly PreferenceRow[], userId: string, category: string, channel: Channel): boolean | null {
  return rows.find((row) => row.userId === userId && row.category === category && row.channel === channel)?.enabled ?? null;
}

export interface CategoryPreferences {
  key: string;
  name: string;
  description: string;
  channels: Record<Channel, EffectiveSetting>;
}

/** A person's own notification settings: every active category, and how each channel stands for them. */
export async function preferencesFor(actor: NotificationActor, deps: NotificationDeps): Promise<CategoryPreferences[]> {
  const [categories, policyRows, stored] = await Promise.all([
    deps.listCategories(),
    deps.listPolicies(),
    deps.listPreferences([actor.userId]),
  ]);
  const policies = policiesByCategory(policyRows);
  return categories
    .filter((category) => category.active)
    .map((category) => {
      const own = policies.get(category.key) ?? NOT_OFFERED;
      const setting = (channel: Channel) =>
        effectiveSetting(channel, own[channel], storedChoice(stored, actor.userId, category.key, channel));
      return {
        key: category.key,
        name: category.name,
        description: category.description,
        channels: { in_app: setting("in_app"), push: setting("push"), email: setting("email") },
      };
    });
}

/**
 * Records a person's own choice for one category on one channel - always the
 * person asking, never anyone named in the input. Refused while the category
 * is mandatory or the channel is not offered: nothing is written then, so
 * whatever they chose before is still there for when the policy changes.
 */
export async function setPreference(
  actor: NotificationActor,
  input: { category: unknown; channel: unknown; enabled: unknown },
  deps: NotificationDeps,
): Promise<{ ok: true } | { ok: false; problem: "invalid" | "unknown-category" | "locked" | "unavailable" }> {
  if (typeof input.category !== "string" || !isChannel(input.channel) || typeof input.enabled !== "boolean") return no("invalid");
  const [categories, policyRows] = await Promise.all([deps.listCategories(), deps.listPolicies()]);
  const category = categories.find((item) => item.key === input.category && item.active);
  if (!category) return no("unknown-category");

  const policy = (policiesByCategory(policyRows).get(category.key) ?? NOT_OFFERED)[input.channel];
  const setting = effectiveSetting(input.channel, policy, null);
  if (!setting.available) return no("unavailable");
  if (setting.locked) return no("locked");

  await deps.setPreference({ userId: actor.userId, category: category.key, channel: input.channel, enabled: input.enabled });
  return { ok: true };
}

export interface CategoryPolicyView extends NotificationCategory {
  policies: CategoryPolicies;
}

/** Every category with its policies, for whoever configures them. Null without the permission. */
export async function policiesFor(actor: NotificationActor, deps: NotificationDeps): Promise<CategoryPolicyView[] | null> {
  if (!actor.can(MANAGE_PERMISSION)) return null;
  const [categories, policyRows] = await Promise.all([deps.listCategories(), deps.listPolicies()]);
  const policies = policiesByCategory(policyRows);
  return categories.map((category) => ({ ...category, policies: { ...(policies.get(category.key) ?? NOT_OFFERED) } }));
}

/**
 * Changes one category's policy for one channel. Only the policy row is
 * written - people's own choices are left exactly as they were.
 */
export async function setPolicy(
  actor: NotificationActor,
  input: { category: unknown; channel: unknown; policy: unknown },
  deps: NotificationDeps,
): Promise<{ ok: true } | { ok: false; problem: "forbidden" | "invalid" | "unknown-category" | "not-allowed" }> {
  if (!actor.can(MANAGE_PERMISSION)) return no("forbidden");
  if (typeof input.category !== "string" || !isChannel(input.channel) || !isChannelPolicy(input.policy)) return no("invalid");
  // A channel that cannot deliver yet cannot be switched on by mistake.
  if (!allowedPolicies(input.channel).includes(input.policy)) return no("not-allowed");
  const categories = await deps.listCategories();
  if (!categories.some((category) => category.key === input.category)) return no("unknown-category");

  await deps.setPolicy({ category: input.category, channel: input.channel, policy: input.policy, userId: actor.userId });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Making a notification
// ---------------------------------------------------------------------------

export interface NotifyInput {
  /** What happened: a key of the event catalog (catalog.ts). */
  event: NotificationEventKey;
  /** Who it is for (audience.ts). */
  audience: Audience;
  title: string;
  body?: string;
  /** A page on this site. Defaults to the event's own, if it has one. */
  actionUrl?: string | null;
  /**
   * Filed under this category rather than the event's own - for an event
   * whose category is chosen when it is sent.
   */
  category?: string;
  priority?: NotificationPriority;
  /** Who caused it, when a person did. */
  actorUserId?: string | null;
  /** People to leave out even if the audience includes them (often the actor). */
  except?: readonly string[];
  /** What it is about, for later grouping and look-up. Never used to decide access. */
  entity?: { type: string; id: string } | null;
  /** Structured context kept with the event. Never sent to the browser. */
  payload?: Record<string, unknown>;
}

export type NotifyResult =
  | { ok: true; eventId: number; recipients: number }
  | { ok: false; problem: "invalid" | "unknown-category" };

/**
 * Tells an audience that something happened.
 *
 * The event is always recorded. A recipient gets a notification when at
 * least one channel that delivers today is on for them (the category's
 * policy and their own choice, together); in Phase 1 that is the app alone.
 * A channel still to come is evaluated by the same rule, so launching it is
 * adding its delivery below, not changing how anything is decided.
 */
export async function notify(input: NotifyInput, deps: NotificationDeps): Promise<NotifyResult> {
  if (!isNotificationEvent(input.event)) return no("invalid");
  const definition: NotificationEventDefinition = NOTIFICATION_EVENTS[input.event];

  const title = normalizeTitle(input.title);
  const body = normalizeBody(input.body);
  const actionUrl = safeActionUrl(input.actionUrl === undefined ? definition.actionUrl : input.actionUrl);
  const priority = input.priority ?? definition.priority;
  if (title === null || body === null || actionUrl === undefined || !isPriority(priority)) return no("invalid");

  const categoryKey = input.category ?? definition.category;
  const [categories, policyRows, baseDirectory] = await Promise.all([deps.listCategories(), deps.listPolicies(), deps.loadDirectory()]);
  const category = categories.find((item) => item.key === categoryKey && item.active);
  if (!category) return no("unknown-category");

  const directory: Directory = needsEveryAccount(input.audience, baseDirectory.rolePermissions)
    ? { ...baseDirectory, accountIds: await deps.listAccountIds() }
    : baseDirectory;
  const userIds = resolveAudience(input.audience, directory, input.except);

  const policies = policiesByCategory(policyRows).get(category.key) ?? NOT_OFFERED;
  const stored = userIds.length > 0 ? await deps.listPreferences(userIds) : [];
  const live = CHANNELS.filter((channel) => CHANNEL_STATUS[channel] === "live");

  const recipients = userIds.flatMap((userId) => {
    const on = (channel: Channel) => effectiveSetting(channel, policies[channel], storedChoice(stored, userId, category.key, channel)).enabled;
    // Someone with every delivering channel off is not told at all.
    return live.some(on) ? [{ userId, inApp: on("in_app") }] : [];
  });

  const { eventId } = await deps.record({
    category: category.key,
    eventKey: input.event,
    actorUserId: input.actorUserId ?? null,
    entityType: input.entity?.type ?? null,
    entityId: input.entity?.id ?? null,
    payload: input.payload ?? {},
    title,
    body,
    actionUrl,
    priority,
    recipients,
  });

  // In the app, the row just written IS the delivery. Push and email hand
  // each recipient whose setting is on to their own sender here, once they
  // exist - with a notification_deliveries row per attempt (NOTIFICATIONS.md).
  return { ok: true, eventId, recipients: recipients.length };
}

// ---------------------------------------------------------------------------
// A person's own notifications
// ---------------------------------------------------------------------------

export interface NotificationPage {
  items: NotificationItem[];
  /** Pass as `before` for the next page; null when there are no more. */
  nextCursor: number | null;
  /** Everything unread, not only what is on this page. */
  unread: number;
}

function pageSize(limit: unknown): number {
  const asked = typeof limit === "number" && Number.isInteger(limit) ? limit : NOTIFICATION_LIMITS.page;
  return Math.min(Math.max(asked, 1), NOTIFICATION_LIMITS.maxPage);
}

/** A page of the person's own notifications, newest first. */
export async function listNotifications(
  actor: NotificationActor,
  options: { before?: number | null; limit?: number },
  deps: NotificationDeps,
): Promise<NotificationPage> {
  const limit = pageSize(options.limit);
  const before = typeof options.before === "number" && Number.isInteger(options.before) && options.before > 0 ? options.before : null;
  // One more than asked for says whether there is another page.
  const [rows, unread] = await Promise.all([deps.list(actor.userId, { before, limit: limit + 1 }), deps.countUnread(actor.userId)]);
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null, unread };
}

export function unreadCount(actor: NotificationActor, deps: NotificationDeps): Promise<number> {
  return deps.countUnread(actor.userId);
}

export type ReadResult = { ok: true; unread: number } | { ok: false; problem: "invalid" | "not-found" };

/** Marks one of the person's own notifications read or unread. Anyone else's is "not found". */
export async function markRead(actor: NotificationActor, input: { id: unknown; read: boolean }, deps: NotificationDeps): Promise<ReadResult> {
  if (typeof input.id !== "number" || !Number.isInteger(input.id) || input.id <= 0) return no("invalid");
  if (!(await deps.setRead(actor.userId, input.id, input.read))) return no("not-found");
  return { ok: true, unread: await deps.countUnread(actor.userId) };
}

export async function markAllRead(actor: NotificationActor, deps: NotificationDeps): Promise<ReadResult> {
  await deps.setAllRead(actor.userId);
  return { ok: true, unread: await deps.countUnread(actor.userId) };
}
