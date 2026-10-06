import { NOTIFICATION_EVENTS } from "./catalog";
import { adminAnnouncement } from "./events/announcement";
import {
  ANNOUNCEMENT_EVENT,
  MANUAL_LIMITS,
  SEND_PERMISSION,
  describeSelection,
  parseDraft,
  parseSnapshot,
  pruneSelection,
  summarizeDeliveries,
  toAudience,
  type AnnouncementDraft,
  type AnnouncementSnapshot,
  type AudienceLabels,
  type AudienceSelection,
  type DeliveryAttempt,
  type DeliverySummary,
  type DraftProblem,
  type ManualAudienceKey,
} from "./manual";
import type { DeliveryStatus } from "./push";
import type { NotificationPriority } from "./model";
import { notify, planRecipients, type NotificationActor, type NotificationDeps } from "./service";

/**
 * Announcements, with the server: previewing who one would reach, sending
 * it, the history of what was sent, and the templates kept for next time.
 *
 * SENDING is notify() and nothing else. This file works out who the chosen
 * audience is - the one thing the notification system does not know how to
 * do for instruments - and hands the announcement over as an ordinary event.
 * Whether it shows in the app, whether it is pushed, to which devices: all
 * of that is the Announcements category's policy and each person's own
 * choice, exactly as for a published song list.
 *
 * Unlike a feature's notification, which must never fail the change it is
 * about (notifySafely), sending IS the change here: if the announcement
 * could not be made, the sender is told so. A push that fails afterwards is
 * a delivery outcome, recorded per device, and not a failed send.
 *
 * THE PREVIEW IS NEVER TRUSTED. sendAnnouncement() takes the selection and
 * resolves it again, from the roles, instruments and accounts as they are at
 * that moment. No list or count of people is ever accepted from a browser.
 *
 * THE HISTORY is the notification_events table: one row per send, whose
 * payload is the snapshot (manual.ts), with who was told read from
 * `notifications` and what became of each push from
 * `notification_deliveries`. There is no second record of a send.
 *
 * Who may do what: everything here needs send_notifications, checked in
 * every function. Policies are a different permission (service.ts).
 *
 * What it needs from the server comes in as `deps`, so every rule is unit
 * tested without a database (manual-service.test.ts). manual-store.ts
 * supplies the real ones.
 */

export interface Person {
  id: string;
  name: string;
}

export interface RoleOption {
  key: string;
  label: string;
}

export interface InstrumentOption {
  id: number;
  label: string;
  /** No longer offered on profiles; people who chose it may still play it. */
  archived: boolean;
}

/** A send as the history table gives it. */
export interface AnnouncementRecord {
  id: number;
  actorUserId: string | null;
  createdAt: string;
  payload: unknown;
  delivery: Record<DeliveryStatus, number>;
}

export interface AnnouncementDetailRecord {
  id: number;
  actorUserId: string | null;
  createdAt: string;
  payload: unknown;
  /** Everyone who has a notification from this send. */
  recipientIds: string[];
  attempts: DeliveryAttempt[];
}

export interface NotificationTemplate {
  id: number;
  name: string;
  draft: AnnouncementDraft;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManualDeps {
  notifications: NotificationDeps;
  listRoles(): Promise<RoleOption[]>;
  listInstruments(): Promise<InstrumentOption[]>;
  /** Everyone who plays any of these instruments. */
  instrumentPlayers(instrumentIds: readonly number[]): Promise<string[]>;
  /** Every account, with a name. Throws when the accounts cannot be read. */
  listPeople(): Promise<Person[]>;
  /** A fresh id for one send. */
  newId(): string;
  /** Sends, newest first, older than `before`. */
  listAnnouncements(options: { before: number | null; limit: number }): Promise<AnnouncementRecord[]>;
  getAnnouncement(id: number): Promise<AnnouncementDetailRecord | null>;
  listTemplates(): Promise<NotificationTemplate[]>;
  getTemplate(id: number): Promise<NotificationTemplate | null>;
  createTemplate(write: { name: string; draft: AnnouncementDraft; userId: string }): Promise<number>;
  /** False when there is no such template. */
  updateTemplate(write: { id: number; name: string; draft: AnnouncementDraft; userId: string }): Promise<boolean>;
  deleteTemplate(id: number): Promise<boolean>;
}

const no = <T extends string>(problem: T) => ({ ok: false as const, problem });

const isId = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;

const byName = (a: Person, b: Person) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

export function canSend(actor: NotificationActor): boolean {
  return actor.can(SEND_PERMISSION);
}

// ---------------------------------------------------------------------------
// The audience
// ---------------------------------------------------------------------------

export interface ComposerOptions {
  roles: RoleOption[];
  instruments: InstrumentOption[];
  people: Person[];
}

/** What the composer offers to choose from. Null without the permission. */
export async function composerOptions(actor: NotificationActor, deps: ManualDeps): Promise<ComposerOptions | null> {
  if (!canSend(actor)) return null;
  const [roles, instruments, people] = await Promise.all([deps.listRoles(), deps.listInstruments(), deps.listPeople()]);
  return { roles, instruments, people: [...people].sort(byName) };
}

/**
 * A selection as the people it means right now. "stale" when it names a
 * role, an instrument or a person that is no longer there: a send is never
 * quietly narrowed to whatever remains.
 */
async function resolveSelection(selection: AudienceSelection, named: Record<ManualAudienceKey, string>, deps: ManualDeps) {
  const [roles, instruments, people] = await Promise.all([deps.listRoles(), deps.listInstruments(), deps.listPeople()]);
  const names = new Map(people.map((person) => [person.id, person.name]));

  if (pruneSelection(selection, { roles, instruments, people }).dropped) return no("stale");

  // Only people who still have an account: a row left behind by one that is gone names nobody.
  const players = selection.instrumentIds.length > 0 ? (await deps.instrumentPlayers(selection.instrumentIds)).filter((id) => names.has(id)) : [];
  return {
    ok: true as const,
    audience: toAudience(selection, players),
    labels: describeSelection(selection, named, { roles, instruments, people }),
    names,
    // The accounts were just read: notify() is given that list rather than asking Clerk a second time.
    notifications: { ...deps.notifications, listAccountIds: async () => people.map((person) => person.id) } satisfies NotificationDeps,
  };
}

const CATEGORY = NOTIFICATION_EVENTS[ANNOUNCEMENT_EVENT].category;

export type AnnouncementProblem = "forbidden" | DraftProblem | "stale" | "nobody" | "unavailable";

export interface AnnouncementPreview {
  /** The draft as it would be sent: tidied. */
  draft: AnnouncementDraft;
  labels: AudienceLabels;
  /** Everyone who would be told, by name. */
  people: Person[];
  /** Of them, how many have push on for announcements. Their devices decide the rest. */
  push: number;
  /** In the audience, and not told: they switched announcements off wherever that is allowed. */
  optedOut: number;
}

/** The words for each named audience, so a snapshot says "Musicians" rather than a key. */
export type NamedLabels = Record<ManualAudienceKey, string>;

/**
 * Who this announcement would reach if it were sent now: the same rule
 * notify() applies (planRecipients), so the two cannot disagree. Nothing is
 * written.
 */
export async function previewAnnouncement(
  actor: NotificationActor,
  input: unknown,
  named: NamedLabels,
  deps: ManualDeps,
): Promise<{ ok: true; preview: AnnouncementPreview } | { ok: false; problem: AnnouncementProblem }> {
  if (!canSend(actor)) return no("forbidden");
  const parsed = parseDraft(input, { complete: true });
  if (!parsed.ok) return parsed;
  const resolved = await resolveSelection(parsed.draft.audience, named, deps);
  if (!resolved.ok) return resolved;
  const plan = await planRecipients({ audience: resolved.audience, category: CATEGORY }, resolved.notifications);
  if (!plan.ok) return no("unavailable");
  return {
    ok: true,
    preview: {
      draft: parsed.draft,
      labels: resolved.labels,
      people: plan.recipients.map((recipient) => ({ id: recipient.userId, name: resolved.names.get(recipient.userId) ?? "" })).sort(byName),
      push: plan.recipients.filter((recipient) => recipient.push).length,
      optedOut: plan.matched.length - plan.recipients.length,
    },
  };
}

/**
 * Sends an announcement, now. The audience is resolved here, afresh; the
 * sender is told like anyone else in it. `templateId` only records where the
 * draft was started from - what is sent, and kept, is the draft itself.
 */
export async function sendAnnouncement(
  actor: NotificationActor,
  input: { draft: unknown; templateId?: unknown },
  named: NamedLabels,
  deps: ManualDeps,
): Promise<{ ok: true; eventId: number; recipients: number } | { ok: false; problem: AnnouncementProblem }> {
  if (!canSend(actor)) return no("forbidden");
  const parsed = parseDraft(input.draft, { complete: true });
  if (!parsed.ok) return parsed;
  const { draft } = parsed;
  const resolved = await resolveSelection(draft.audience, named, deps);
  if (!resolved.ok) return resolved;

  // An announcement to nobody is not sent, and leaves no send in the history.
  const plan = await planRecipients({ audience: resolved.audience, category: CATEGORY }, resolved.notifications);
  if (!plan.ok) return no("unavailable");
  if (plan.recipients.length === 0) return no("nobody");

  const source = isId(input.templateId) ? await deps.getTemplate(input.templateId) : null;
  const snapshot = (told: { recipients: number }): AnnouncementSnapshot => ({
    v: 1,
    title: draft.title,
    body: draft.body,
    actionUrl: draft.actionUrl,
    priority: draft.priority,
    audience: draft.audience,
    labels: resolved.labels,
    recipients: told.recipients,
    senderName: resolved.names.get(actor.userId) ?? "",
    template: source ? { id: source.id, name: source.name } : null,
  });

  const result = await notify(
    adminAnnouncement({
      actorId: actor.userId,
      id: deps.newId(),
      title: draft.title,
      body: draft.body,
      actionUrl: draft.actionUrl,
      priority: draft.priority,
      audience: resolved.audience,
      snapshot: (told) => ({ ...snapshot(told) }),
    }),
    resolved.notifications,
  );
  if (!result.ok) return no("unavailable");
  return { ok: true, eventId: result.eventId, recipients: result.recipients };
}

// ---------------------------------------------------------------------------
// The history
// ---------------------------------------------------------------------------

export interface AnnouncementSummary {
  id: number;
  sentAt: string;
  /** As it was when sent. Empty when it could not be found then. */
  senderName: string;
  title: string;
  priority: NotificationPriority;
  labels: AudienceLabels;
  recipients: number;
  /** Push attempts by outcome. "sent" is accepted by a push service, no more. */
  delivery: Record<DeliveryStatus, number>;
}

export interface AnnouncementPage {
  items: AnnouncementSummary[];
  /** Pass as `before` for the next page; null when there are no more. */
  nextCursor: number | null;
}

/** A page of what was sent, newest first. Null without the permission. */
export async function listAnnouncements(actor: NotificationActor, options: { before?: unknown }, deps: ManualDeps): Promise<AnnouncementPage | null> {
  if (!canSend(actor)) return null;
  const limit = MANUAL_LIMITS.historyPage;
  // One more than a page says whether there is another.
  const records = await deps.listAnnouncements({ before: isId(options.before) ? options.before : null, limit: limit + 1 });
  const page = records.slice(0, limit);
  return {
    items: page.flatMap((record): AnnouncementSummary[] => {
      const snapshot = parseSnapshot(record.payload);
      if (!snapshot) return [];
      return [
        {
          id: record.id,
          sentAt: record.createdAt,
          senderName: snapshot.senderName,
          title: snapshot.title,
          priority: snapshot.priority,
          labels: snapshot.labels,
          recipients: snapshot.recipients,
          delivery: record.delivery,
        },
      ];
    }),
    nextCursor: records.length > limit ? page[page.length - 1].id : null,
  };
}

export interface AnnouncementDetail {
  id: number;
  sentAt: string;
  snapshot: AnnouncementSnapshot;
  /**
   * Everyone who still has a notification from this send, with what became
   * of each push to them. A name is null for someone who cannot be named
   * just now. Someone whose account was deleted since is no longer listed:
   * their notifications went with it, and `snapshot.recipients` still says
   * how many were told.
   */
  people: Array<{ id: string; name: string | null; devices: Array<{ device: string; status: DeliveryStatus }> }>;
  delivery: DeliverySummary;
}

/** One send, as it was. Null when there is no such send, or without the permission. */
export async function getAnnouncement(actor: NotificationActor, id: unknown, deps: ManualDeps): Promise<AnnouncementDetail | null> {
  if (!canSend(actor) || !isId(id)) return null;
  const record = await deps.getAnnouncement(id);
  const snapshot = record ? parseSnapshot(record.payload) : null;
  if (!record || !snapshot) return null;

  // The history is the site's own; names are Clerk's. Without Clerk it still reads.
  const names = await deps
    .listPeople()
    .then((people) => new Map(people.map((person) => [person.id, person.name])))
    .catch(() => new Map<string, string>());

  const people = record.recipientIds
    .map((userId) => ({
      id: userId,
      name: names.get(userId) ?? null,
      // Only what the device was called and what was answered: never its address or keys.
      devices: record.attempts.filter((attempt) => attempt.userId === userId).map(({ device, status }) => ({ device, status })),
    }))
    .sort((a, b) => (a.name ?? "￿").localeCompare(b.name ?? "￿", "en", { sensitivity: "base" }));

  return { id: record.id, sentAt: record.createdAt, snapshot, people, delivery: summarizeDeliveries(record.recipientIds, record.attempts) };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type TemplateProblem = "forbidden" | "name" | DraftProblem | "not-found" | "too-many";

function templateName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  return name === "" || name.length > MANUAL_LIMITS.templateNameChars ? null : name;
}

/** Every template, by name. Null without the permission. */
export async function listTemplates(actor: NotificationActor, deps: ManualDeps): Promise<NotificationTemplate[] | null> {
  if (!canSend(actor)) return null;
  return [...(await deps.listTemplates())].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/**
 * Keeps a draft as a template: a new one, or `id`'s contents replaced. A
 * template needs a name and a title; its message and audience may be left
 * for whoever uses it. Nothing already sent is touched: a send keeps its own
 * snapshot.
 */
export async function saveTemplate(
  actor: NotificationActor,
  input: { id?: unknown; name: unknown; draft: unknown },
  deps: ManualDeps,
): Promise<{ ok: true; id: number } | { ok: false; problem: TemplateProblem }> {
  if (!canSend(actor)) return no("forbidden");
  const name = templateName(input.name);
  if (!name) return no("name");
  const parsed = parseDraft(input.draft, { complete: false });
  if (!parsed.ok) return parsed;

  if (input.id === undefined || input.id === null) {
    if ((await deps.listTemplates()).length >= MANUAL_LIMITS.templates) return no("too-many");
    return { ok: true, id: await deps.createTemplate({ name, draft: parsed.draft, userId: actor.userId }) };
  }
  if (!isId(input.id)) return no("not-found");
  const updated = await deps.updateTemplate({ id: input.id, name, draft: parsed.draft, userId: actor.userId });
  return updated ? { ok: true, id: input.id } : no("not-found");
}

/** A second template with the same contents, named by `rename` ("Copy of ..."). */
export async function duplicateTemplate(
  actor: NotificationActor,
  input: { id: unknown; rename: (name: string) => string },
  deps: ManualDeps,
): Promise<{ ok: true; id: number } | { ok: false; problem: TemplateProblem }> {
  if (!canSend(actor)) return no("forbidden");
  const original = isId(input.id) ? await deps.getTemplate(input.id) : null;
  if (!original) return no("not-found");
  if ((await deps.listTemplates()).length >= MANUAL_LIMITS.templates) return no("too-many");
  const name = input.rename(original.name).slice(0, MANUAL_LIMITS.templateNameChars).trim();
  return { ok: true, id: await deps.createTemplate({ name, draft: original.draft, userId: actor.userId }) };
}

export async function deleteTemplate(
  actor: NotificationActor,
  id: unknown,
  deps: ManualDeps,
): Promise<{ ok: true } | { ok: false; problem: "forbidden" | "not-found" }> {
  if (!canSend(actor)) return no("forbidden");
  if (!isId(id) || !(await deps.deleteTemplate(id))) return no("not-found");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Starting the composer from something
// ---------------------------------------------------------------------------

export interface LoadedDraft {
  draft: AnnouncementDraft;
  /** The template it came from, to be recorded with a send. Null for an old send. */
  template: { id: number; name: string } | null;
  /** Part of its audience is no longer there and was left out. */
  dropped: boolean;
}

/**
 * A template, or something already sent, as a draft for the composer. It is
 * a COPY: editing it changes neither the template nor the old send, and
 * nothing is sent until the person sends it. Whatever of its audience no
 * longer exists is left out, and said to be.
 */
export async function loadDraft(
  actor: NotificationActor,
  source: { templateId: unknown } | { eventId: unknown },
  deps: ManualDeps,
): Promise<LoadedDraft | null> {
  if (!canSend(actor)) return null;
  let draft: AnnouncementDraft;
  let template: LoadedDraft["template"] = null;
  if ("templateId" in source) {
    const found = isId(source.templateId) ? await deps.getTemplate(source.templateId) : null;
    if (!found) return null;
    draft = found.draft;
    template = { id: found.id, name: found.name };
  } else {
    const record = isId(source.eventId) ? await deps.getAnnouncement(source.eventId) : null;
    const snapshot = record ? parseSnapshot(record.payload) : null;
    if (!snapshot) return null;
    draft = { title: snapshot.title, body: snapshot.body, actionUrl: snapshot.actionUrl, priority: snapshot.priority, audience: snapshot.audience };
  }
  const [roles, instruments, people] = await Promise.all([deps.listRoles(), deps.listInstruments(), deps.listPeople()]);
  const pruned = pruneSelection(draft.audience, { roles, instruments, people });
  return { draft: { ...draft, audience: pruned.selection }, template, dropped: pruned.dropped };
}
