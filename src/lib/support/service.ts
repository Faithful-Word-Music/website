/**
 * Every rule about support requests, in one place: who may send, read,
 * reply to and manage a request, what each reply does to it, and what is
 * recorded and told. The pages and actions only call these, with the person
 * from the session; the author, the visibility allowed and the manager's
 * powers are never taken from the browser.
 *
 * Takes `deps` (the store and the context checks), so it is tested without a
 * database. The real deps are in deps.ts.
 */

import { MANAGE_PERMISSION, SUBMIT_PERMISSION, supportAccess, visibleEvents, visibleMessages, type SupportAccess, type SupportActor } from "./access";
import { parseContextInput, redactContext, type ContextInput, type SupportContext } from "./context";
import {
  AFTER_REPLY,
  SUPPORT_LIMITS,
  applyWorkflow,
  diffWorkflow,
  isCategory,
  isPriority,
  isRequestType,
  isStatus,
  isWaitingOn,
  parseKey,
  parseLinks,
  parsePublicId,
  parseText,
  parseTitle,
  typeOf,
  workflowAfterReply,
  type AfterReply,
  type Category,
  type Priority,
  type Workflow,
  type WorkflowEvent,
} from "./model";
import type {
  EventWrite,
  ListFilter,
  QueueView,
  ReplyResult,
  ReplyWrite,
  RequestSummary,
  RequestWrite,
  StoredEvent,
  StoredMessage,
  StoredRequest,
  WorkflowSave,
} from "./store";

export interface SupportDeps {
  insertRequest(write: RequestWrite): Promise<{ request: StoredRequest; created: boolean; eventId: string | null }>;
  getRequest(publicId: string): Promise<StoredRequest | null>;
  listMessages(requestId: string, includeInternal: boolean): Promise<StoredMessage[]>;
  listEvents(requestId: string, includeInternal: boolean): Promise<StoredEvent[]>;
  appendReply(write: ReplyWrite): Promise<ReplyResult>;
  saveWorkflow(write: { requestId: string; expectedRevision: number; actorId: string; workflow: Workflow; events: readonly EventWrite[] }): Promise<WorkflowSave>;
  listRequests(filter: ListFilter): Promise<{ items: RequestSummary[]; more: boolean }>;
  /** Whether someone holds manage_support_requests now (an assignee must). */
  isManager(userId: string): Promise<boolean>;
  /** Checks the references against what this person may see now, and snapshots them. */
  resolveContext(actor: SupportActor, category: Category, input: ContextInput): Promise<{ ok: true; context: SupportContext } | { ok: false; reason: "missing" | "changed" | "hidden" }>;
  /** Hands events just recorded to be told, after the response (notify.ts). Never throws. */
  tell(eventIds: readonly string[]): void;
}

export type SupportProblem = "forbidden" | "invalid" | "not-found" | "context" | "changed" | "conflict" | "closed";
export type Result<T> = ({ ok: true } & T) | { ok: false; problem: SupportProblem };

const fail = (problem: SupportProblem) => ({ ok: false as const, problem });

// ---------------------------------------------------------------------------
// What each event records, and whether anyone is told of it
// ---------------------------------------------------------------------------

/**
 * Housekeeping (assignment, priority, waiting on) is the managers' own;
 * what became of the request is the submitter's too. Who is told is the
 * builder's business (events/support.ts) - this only says whether there is
 * anything to tell, so an event with nothing to say is never owed.
 */
export function eventWrite(event: WorkflowEvent, actorId: string, via: "workflow" | "reply"): EventWrite {
  const internal = event.kind === "assigned" || event.kind === "priority_changed" || event.kind === "waiting_changed";
  let notify = false;
  if (via === "workflow") {
    if (event.kind === "assigned") notify = event.to !== null && event.to !== actorId;
    // Closing what was already resolved says nothing new.
    else if (event.kind === "closed") notify = event.from !== "resolved";
    else notify = event.kind === "resolved" || event.kind === "reopened";
  }
  // A reply's own event tells people about it; what it moved (resolving, reopening) is said by that.
  return { kind: event.kind, from: event.from, to: event.to, visibility: internal ? "internal" : "public", notify };
}

// ---------------------------------------------------------------------------
// Sending a request
// ---------------------------------------------------------------------------

export interface CreateInput {
  type: unknown;
  category: unknown;
  title: unknown;
  description: unknown;
  links?: unknown;
  context?: unknown;
  submissionKey: unknown;
}

export async function createRequest(
  actor: SupportActor,
  input: CreateInput,
  deps: SupportDeps,
): Promise<Result<{ request: StoredRequest; created: boolean }>> {
  if (!actor.can(SUBMIT_PERMISSION)) return fail("forbidden");
  const category = isCategory(input.category) ? input.category : null;
  const title = parseTitle(input.title);
  const description = parseText(input.description, SUPPORT_LIMITS.descriptionChars);
  const links = parseLinks(input.links);
  const key = parseKey(input.submissionKey);
  if (!category || !isRequestType(input.type) || typeOf(category) !== input.type || !title || !description || !links || !key) {
    return fail("invalid");
  }

  const references = parseContextInput(category, input.context);
  let context: SupportContext = { v: 1 };
  if (Object.keys(references).length > 0) {
    const resolved = await deps.resolveContext(actor, category, references);
    if (!resolved.ok) return fail(resolved.reason === "changed" ? "changed" : "context");
    context = resolved.context;
  }
  // A problem with song leading is about a particular assignment: without one there is nothing to look at.
  if (category === "leader_assignment" && !context.leadership) return fail("context");

  const { request, created, eventId } = await deps.insertRequest({
    submitterId: actor.userId,
    submissionKey: key,
    type: input.type,
    category,
    title,
    description,
    context,
    links,
  });
  if (eventId) deps.tell([eventId]);
  return { ok: true, request, created };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface RequestView {
  access: Exclude<SupportAccess, "none">;
  request: StoredRequest;
  messages: StoredMessage[];
  events: StoredEvent[];
}

/** A request with what this person may see of it. Anyone else is told it does not exist. */
export async function readRequest(actor: SupportActor, publicId: unknown, deps: SupportDeps): Promise<Result<{ view: RequestView }>> {
  const id = parsePublicId(publicId);
  if (!id) return fail("not-found");
  const request = await deps.getRequest(id);
  if (!request) return fail("not-found");
  const access = supportAccess(actor, request);
  if (access === "none") return fail("not-found");
  const manager = access === "manager";
  const [messages, events] = await Promise.all([deps.listMessages(request.id, manager), deps.listEvents(request.id, manager)]);
  return {
    ok: true,
    view: {
      access,
      request: { ...request, context: redactContext(request.context, actor.can, request.submitterId === actor.userId) },
      // Filtered by the queries already; filtered again here so a store mistake can never show a note.
      messages: visibleMessages(access, messages),
      events: visibleEvents(access, events),
    },
  };
}

/** The person's own requests. */
export async function listMine(actor: SupportActor, offset: number, deps: SupportDeps): Promise<Result<{ items: RequestSummary[]; more: boolean }>> {
  if (!actor.can(SUBMIT_PERMISSION)) return fail("forbidden");
  const page = await deps.listRequests({ submitterId: actor.userId, offset, limit: SUPPORT_LIMITS.page });
  return { ok: true, ...page };
}

/** The ministry's requests, for managers. */
export async function listQueue(
  actor: SupportActor,
  filter: { view: QueueView; category: Category | null; priority: Priority | null; offset: number },
  deps: SupportDeps,
): Promise<Result<{ items: RequestSummary[]; more: boolean }>> {
  if (!actor.can(MANAGE_PERMISSION)) return fail("forbidden");
  const page = await deps.listRequests({ ...filter, viewerId: actor.userId, limit: SUPPORT_LIMITS.page });
  return { ok: true, ...page };
}

// ---------------------------------------------------------------------------
// Replying
// ---------------------------------------------------------------------------

export interface ReplyInput {
  publicId: unknown;
  body: unknown;
  /** "internal" only for a manager's note; anything else is a public reply. */
  visibility: unknown;
  clientKey: unknown;
  /** A manager's public reply: what to do with the request as it is sent. */
  after?: unknown;
  /** A submitter's reply to a resolved request: they said explicitly that it needs attention again. */
  reopen?: unknown;
}

/** How many times a reply is worked out again when someone else changed the request at the same moment. */
const REPLY_ATTEMPTS = 4;

export async function reply(actor: SupportActor, input: ReplyInput, deps: SupportDeps): Promise<Result<{ messageId: string; duplicate: boolean }>> {
  const id = parsePublicId(input.publicId);
  const body = parseText(input.body, SUPPORT_LIMITS.messageChars);
  const clientKey = parseKey(input.clientKey);
  if (!id) return fail("not-found");
  if (!body || !clientKey || (input.visibility !== "public" && input.visibility !== "internal")) return fail("invalid");
  const after: AfterReply = (AFTER_REPLY as readonly unknown[]).includes(input.after) ? (input.after as AfterReply) : "keep";

  for (let attempt = 0; attempt < REPLY_ATTEMPTS; attempt += 1) {
    const request = await deps.getRequest(id);
    if (!request) return fail("not-found");
    const access = supportAccess(actor, request);
    if (access === "none") return fail("not-found");
    // Only a manager writes internal notes; nobody else's "internal" is honoured - or quietly made public.
    if (input.visibility === "internal" && access !== "manager") return fail("forbidden");

    const before: Workflow = { status: request.status, waitingOn: request.waitingOn, priority: request.priority, assigneeId: request.assigneeId };
    const visibility = input.visibility as "public" | "internal";
    const asSubmitter = access !== "manager";
    const workflow = asSubmitter
      ? workflowAfterReply(before, { by: "submitter", reopen: input.reopen === true })
      : visibility === "internal"
        ? workflowAfterReply(before, { by: "manager", visibility: "internal" })
        : workflowAfterReply(before, { by: "manager", visibility: "public", after });
    if (!workflow) return fail(before.status === "closed" ? "closed" : "invalid");

    const result = await deps.appendReply({
      requestId: request.id,
      expectedRevision: request.revision,
      authorId: actor.userId,
      body,
      visibility,
      clientKey,
      workflow,
      events: diffWorkflow(before, workflow).map((event) => eventWrite(event, actor.userId, "reply")),
      replyEvent: {
        kind: "replied",
        from: asSubmitter ? "submitter" : "manager",
        // What kind of reply: the notification is chosen by it (events/support.ts).
        to: asSubmitter ? (before.status === "resolved" && workflow.status === "open" ? "reopen" : "reply") : visibility === "internal" ? "internal" : after,
        visibility,
        notify: visibility === "public",
      },
      allowClosed: !asSubmitter && visibility === "internal",
    });
    if (result.ok) {
      if (result.eventIds.length > 0) deps.tell(result.eventIds);
      return { ok: true, messageId: result.messageId, duplicate: result.duplicate };
    }
    if (result.reason === "closed") return fail("closed");
    // Someone else changed it: read it again and work the reply out afresh. Nothing was written.
  }
  return fail("conflict");
}

// ---------------------------------------------------------------------------
// Managing
// ---------------------------------------------------------------------------

export interface WorkflowInput {
  publicId: unknown;
  expectedRevision: unknown;
  status?: unknown;
  priority?: unknown;
  waitingOn?: unknown;
  /** A user ID, or null to unassign. Undefined leaves it as it is. */
  assigneeId?: unknown;
}

export async function updateWorkflow(actor: SupportActor, input: WorkflowInput, deps: SupportDeps): Promise<Result<{ revision: number; changed: boolean }>> {
  if (!actor.can(MANAGE_PERMISSION)) return fail("forbidden");
  const id = parsePublicId(input.publicId);
  if (!id) return fail("not-found");
  if (typeof input.expectedRevision !== "number" || !Number.isInteger(input.expectedRevision)) return fail("invalid");
  const change: Partial<Workflow> = {};
  if (input.status !== undefined) {
    if (!isStatus(input.status)) return fail("invalid");
    change.status = input.status;
  }
  if (input.priority !== undefined) {
    if (!isPriority(input.priority)) return fail("invalid");
    change.priority = input.priority;
  }
  if (input.waitingOn !== undefined) {
    if (!isWaitingOn(input.waitingOn)) return fail("invalid");
    change.waitingOn = input.waitingOn;
  }
  if (input.assigneeId !== undefined) {
    if (input.assigneeId !== null && (typeof input.assigneeId !== "string" || !/^user_[A-Za-z0-9]{1,64}$/.test(input.assigneeId))) return fail("invalid");
    change.assigneeId = input.assigneeId;
  }

  const request = await deps.getRequest(id);
  if (!request) return fail("not-found");
  if (request.revision !== input.expectedRevision) return fail("conflict");
  const before: Workflow = { status: request.status, waitingOn: request.waitingOn, priority: request.priority, assigneeId: request.assigneeId };
  const after = applyWorkflow(before, change);
  if (!after) return fail("invalid");
  // Waiting on someone only means something while there is something to do.
  if (change.waitingOn !== undefined && change.waitingOn !== "none" && after.waitingOn === "none") return fail("invalid");
  if (after.assigneeId && after.assigneeId !== before.assigneeId && !(await deps.isManager(after.assigneeId))) return fail("invalid");

  const events = diffWorkflow(before, after);
  if (events.length === 0) return { ok: true, revision: request.revision, changed: false };
  const saved = await deps.saveWorkflow({
    requestId: request.id,
    expectedRevision: request.revision,
    actorId: actor.userId,
    workflow: after,
    events: events.map((event) => eventWrite(event, actor.userId, "workflow")),
  });
  if (!saved.ok) return fail("conflict");
  deps.tell(saved.eventIds);
  return { ok: true, revision: saved.revision, changed: true };
}

