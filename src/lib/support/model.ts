/**
 * The Music Ministry Support Center's rules: what a support request is, the
 * kinds there are, how one moves from open to closed, and what a person may
 * send. See docs/support-center.md.
 *
 * Pure - no server-only import - so it is unit tested and shared with the
 * pages.
 */

export const REQUEST_TYPES = ["problem", "sheet_music", "suggestion", "question"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

/**
 * What a request is about. The key is stored, so it never changes; the
 * wording is in src/content/support.ts. Each belongs to one of the four ways
 * in (REQUEST_TYPES).
 */
export const CATEGORIES = {
  wrong_key: { type: "problem", context: ["occurrence", "song"] },
  wrong_hymn_number: { type: "problem", context: ["occurrence", "song"] },
  wrong_sheet_music: { type: "problem", context: ["song", "sheet_music"] },
  wrong_songs: { type: "problem", context: ["service", "occurrence"] },
  scheduling: { type: "problem", context: ["service"] },
  leader_assignment: { type: "problem", context: ["leadership"] },
  website_bug: { type: "problem", context: ["page"] },
  ministry_problem: { type: "problem", context: [] },
  missing_sheet_music: { type: "sheet_music", context: ["song"] },
  new_sheet_music: { type: "sheet_music", context: ["song"] },
  suggestion: { type: "suggestion", context: [] },
  question: { type: "question", context: [] },
} as const satisfies Record<string, { type: RequestType; context: readonly ContextKind[] }>;

export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

/** The kinds of thing a request can point at (src/lib/support/context.ts). */
export type ContextKind = "service" | "occurrence" | "song" | "sheet_music" | "leadership" | "page";

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && Object.hasOwn(CATEGORIES, value);
}

export function isRequestType(value: unknown): value is RequestType {
  return typeof value === "string" && (REQUEST_TYPES as readonly string[]).includes(value);
}

export function typeOf(category: Category): RequestType {
  return CATEGORIES[category].type;
}

export function categoriesFor(type: RequestType): Category[] {
  return CATEGORY_KEYS.filter((category) => CATEGORIES[category].type === type);
}

/** What context a category may carry. */
export function contextKinds(category: Category): readonly ContextKind[] {
  return CATEGORIES[category].context;
}

// ---------------------------------------------------------------------------
// The lifecycle
// ---------------------------------------------------------------------------

export const STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type Status = (typeof STATUSES)[number];

/** Who has to do something next. Separate from the status, so there are only four of those. */
export const WAITING_ON = ["management", "submitter", "none"] as const;
export type WaitingOn = (typeof WAITING_ON)[number];

/** Set by managers only. Urgent does not on its own make anything louder. */
export const PRIORITIES = ["normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const isStatus = (value: unknown): value is Status => typeof value === "string" && (STATUSES as readonly string[]).includes(value);
export const isWaitingOn = (value: unknown): value is WaitingOn =>
  typeof value === "string" && (WAITING_ON as readonly string[]).includes(value);
export const isPriority = (value: unknown): value is Priority =>
  typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);

/** Still something to do: the management queue and the Dashboard count only these. */
export function isActive(status: Status): boolean {
  return status === "open" || status === "in_progress";
}

/**
 * The moves a manager may make. Anything may be closed; resolved and closed
 * requests come back by being reopened (to Open), never silently.
 */
const MANAGER_MOVES: Record<Status, readonly Status[]> = {
  open: ["in_progress", "resolved", "closed"],
  in_progress: ["open", "resolved", "closed"],
  resolved: ["open", "closed"],
  closed: ["open"],
};

export function canMove(from: Status, to: Status): boolean {
  return MANAGER_MOVES[from].includes(to);
}

/** The state a request is in, for the workflow. */
export interface Workflow {
  status: Status;
  waitingOn: WaitingOn;
  priority: Priority;
  assigneeId: string | null;
}

export type WorkflowEventKind =
  | "created"
  | "assigned"
  | "priority_changed"
  | "status_changed"
  | "waiting_changed"
  | "resolved"
  | "closed"
  | "reopened"
  | "replied";

export interface WorkflowEvent {
  kind: WorkflowEventKind;
  from: string | null;
  to: string | null;
}

/** What a status change is called in the record. */
function statusEventKind(from: Status, to: Status): WorkflowEventKind {
  if (to === "resolved") return "resolved";
  if (to === "closed") return "closed";
  if (to === "open" && (from === "resolved" || from === "closed")) return "reopened";
  return "status_changed";
}

/**
 * The events a change from `before` to `after` records - one per field that
 * changed, status first. A waiting-on change that only follows from the new
 * status (resolving or closing sets it to "none") is not recorded separately.
 */
export function diffWorkflow(before: Workflow, after: Workflow): WorkflowEvent[] {
  const events: WorkflowEvent[] = [];
  if (before.status !== after.status) {
    events.push({ kind: statusEventKind(before.status, after.status), from: before.status, to: after.status });
  }
  if (before.assigneeId !== after.assigneeId) events.push({ kind: "assigned", from: before.assigneeId, to: after.assigneeId });
  if (before.priority !== after.priority) events.push({ kind: "priority_changed", from: before.priority, to: after.priority });
  const followsStatus = before.status !== after.status && !isActive(after.status) && after.waitingOn === "none";
  if (before.waitingOn !== after.waitingOn && !followsStatus) {
    events.push({ kind: "waiting_changed", from: before.waitingOn, to: after.waitingOn });
  }
  return events;
}

/**
 * Applies a manager's requested change, keeping the record consistent:
 * leaving the active statuses clears waiting-on; reopening waits on
 * management unless they said otherwise. Returns null for a move that is not
 * allowed.
 */
export function applyWorkflow(before: Workflow, change: Partial<Workflow>): Workflow | null {
  const status = change.status ?? before.status;
  if (status !== before.status && !canMove(before.status, status)) return null;
  let waitingOn = change.waitingOn ?? before.waitingOn;
  if (!isActive(status)) waitingOn = "none";
  else if (!isActive(before.status) && change.waitingOn === undefined) waitingOn = "management";
  return {
    status,
    waitingOn,
    priority: change.priority ?? before.priority,
    assigneeId: change.assigneeId === undefined ? before.assigneeId : change.assigneeId,
  };
}

/** What a manager may choose to do with a request as they send a public reply. */
export const AFTER_REPLY = ["keep", "request_info", "resolve"] as const;
export type AfterReply = (typeof AFTER_REPLY)[number];

/**
 * How a reply moves a request. A submitter's reply puts it back with
 * management; on a resolved request only when they explicitly reopen it. A
 * manager's public reply hands it to the submitter when it asks them
 * something, resolves it when they say so, and otherwise leaves nobody
 * waiting. An internal note moves nothing.
 *
 * Null: the reply is not allowed in this state (a closed request, or a
 * submitter asking to reopen something that is not resolved).
 */
export function workflowAfterReply(
  before: Workflow,
  reply:
    | { by: "submitter"; reopen: boolean }
    | { by: "manager"; visibility: "public"; after: AfterReply }
    | { by: "manager"; visibility: "internal" },
): Workflow | null {
  if (reply.by === "submitter") {
    if (before.status === "closed") return null;
    if (before.status === "resolved") {
      return reply.reopen ? { ...before, status: "open", waitingOn: "management" } : before;
    }
    if (reply.reopen) return null;
    return { ...before, waitingOn: "management" };
  }
  if (reply.visibility === "internal") return before;
  // A closed request's conversation is over until a manager reopens it.
  if (before.status === "closed") return null;
  if (reply.after === "resolve") return { ...before, status: "resolved", waitingOn: "none" };
  if (!isActive(before.status)) return reply.after === "keep" ? before : null;
  if (reply.after === "request_info") return { ...before, waitingOn: "submitter" };
  return { ...before, waitingOn: before.waitingOn === "management" ? "none" : before.waitingOn };
}

// ---------------------------------------------------------------------------
// What may be sent
// ---------------------------------------------------------------------------

export const SUPPORT_LIMITS = {
  titleChars: 120,
  descriptionChars: 5000,
  messageChars: 5000,
  links: 3,
  linkChars: 500,
  /** The stored context, serialized. */
  contextBytes: 4000,
  page: 25,
} as const;

const tidyLine = (value: string) => value.replace(/\s+/g, " ").trim();
const tidyText = (value: string) =>
  value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** A one-line title within the limit, or null. */
export function parseTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = tidyLine(value);
  return text.length === 0 || text.length > SUPPORT_LIMITS.titleChars ? null : text;
}

/** Text a person wrote (a description or a message): required, within `limit`. */
export function parseText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const text = tidyText(value);
  return text.length === 0 || text.length > limit ? null : text;
}

/**
 * A supporting link: http(s) only, no credentials in it, within the limit.
 * Shown as a plain link and never fetched by the site.
 */
export function parseLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0 || text.length > SUPPORT_LIMITS.linkChars) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  return url.toString();
}

/** Up to SUPPORT_LIMITS.links links, blanks ignored; null when any is invalid. */
export function parseLinks(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const given = value.filter((item) => !(typeof item === "string" && item.trim() === ""));
  if (given.length > SUPPORT_LIMITS.links) return null;
  const links: string[] = [];
  for (const item of given) {
    const link = parseLink(item);
    if (!link) return null;
    if (!links.includes(link)) links.push(link);
  }
  return links;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** An idempotency key the browser made (crypto.randomUUID()). */
export function parseKey(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
}

// ---------------------------------------------------------------------------
// Request IDs
// ---------------------------------------------------------------------------

/** Crockford's base 32: no I, L, O or U, so an ID read aloud is not misheard. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PUBLIC_ID = /^R-[0-9A-HJKMNP-TV-Z]{8}$/;

/** A new request's ID, "R-7K3F9Q2M". Given once and never changed. */
export function newPublicId(random: (bytes: number) => Uint8Array): string {
  const bytes = random(8);
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % 32];
  return `R-${id}`;
}

/** A request ID from an address or a form, normalised; null when it cannot be one. */
export function parsePublicId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toUpperCase();
  return PUBLIC_ID.test(text) ? text : null;
}

/** Where a request is read. */
export function requestHref(publicId: string): string {
  return `/contact/requests/${publicId}`;
}
