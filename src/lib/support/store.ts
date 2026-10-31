import "server-only";

import { randomUUID } from "node:crypto";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { db, type Sql } from "@/lib/auth/store";
import { applySchema } from "@/lib/db";

import type { SupportContext } from "./context";
import type { Category, Priority, RequestType, Status, WaitingOn, Workflow, WorkflowEventKind } from "./model";

/**
 * Where support requests are kept (docs/support-center.md).
 *
 *   support_requests   one row per request: who sent it, what it is about,
 *                      the context as it stood (a snapshot), and its workflow
 *                      (status, waiting on, priority, assignee) with a
 *                      revision that every workflow change is checked against
 *   support_messages   the conversation, append-only: public replies and
 *                      managers' internal notes
 *   support_events     what happened to it, for the record - and, until
 *                      notified_at is set, the proof that someone is still to
 *                      be told (src/lib/support/notify.ts)
 *
 * Created on first use on top of the account tables (db() in
 * src/lib/auth/store.ts). Every row carries the Clerk environment, and the
 * messages and events reach their request through (clerk_env, id), so a row
 * can never belong to a request of the other environment.
 *
 * No authorization happens here: src/lib/support/service.ts decides, and is
 * the only caller.
 */

const ENV = `clerk_env text NOT NULL CHECK (clerk_env IN ('development', 'production'))`;
const ACTIVE = `('open', 'in_progress')`;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS support_requests (
     id               uuid        PRIMARY KEY,
     ${ENV},
     public_id        text        NOT NULL CHECK (public_id ~ '^R-[0-9A-Z]{8}$'),
     submitter_id     text        NOT NULL,
     submission_key   uuid        NOT NULL,
     request_type     text        NOT NULL CHECK (request_type IN ('problem', 'sheet_music', 'suggestion', 'question')),
     category         text        NOT NULL CHECK (category IN ('wrong_key', 'wrong_hymn_number', 'wrong_sheet_music', 'wrong_songs',
                                    'scheduling', 'leader_assignment', 'website_bug', 'ministry_problem', 'missing_sheet_music',
                                    'new_sheet_music', 'suggestion', 'question')),
     title            text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
     description      text        NOT NULL CHECK (char_length(description) BETWEEN 1 AND 5000),
     status           text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
     waiting_on       text        NOT NULL DEFAULT 'management' CHECK (waiting_on IN ('management', 'submitter', 'none')),
     priority         text        NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
     assignee_id      text,
     context          jsonb       NOT NULL DEFAULT '{}' CHECK (octet_length(context::text) <= 8000),
     links            jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(links) = 'array' AND jsonb_array_length(links) <= 3),
     revision         integer     NOT NULL DEFAULT 1,
     created_at       timestamptz NOT NULL DEFAULT now(),
     updated_at       timestamptz NOT NULL DEFAULT now(),
     last_activity_at timestamptz NOT NULL DEFAULT now(),
     resolved_at      timestamptz,
     closed_at        timestamptz,
     UNIQUE (clerk_env, id),
     UNIQUE (clerk_env, public_id),
     UNIQUE (clerk_env, submitter_id, submission_key),
     CHECK (status <> 'resolved' OR resolved_at IS NOT NULL),
     CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
     CHECK (status IN ${ACTIVE} OR waiting_on = 'none')
   )`,
  `CREATE INDEX IF NOT EXISTS support_requests_submitter
     ON support_requests (clerk_env, submitter_id, last_activity_at DESC)`,
  `CREATE INDEX IF NOT EXISTS support_requests_active
     ON support_requests (clerk_env, waiting_on, last_activity_at DESC) WHERE status IN ${ACTIVE}`,
  `CREATE INDEX IF NOT EXISTS support_requests_assignee
     ON support_requests (clerk_env, assignee_id) WHERE assignee_id IS NOT NULL AND status IN ${ACTIVE}`,
  `CREATE INDEX IF NOT EXISTS support_requests_history
     ON support_requests (clerk_env, status, last_activity_at DESC)`,
  `CREATE TABLE IF NOT EXISTS support_messages (
     id         uuid        PRIMARY KEY,
     ${ENV},
     request_id uuid        NOT NULL,
     author_id  text        NOT NULL,
     body       text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
     visibility text        NOT NULL CHECK (visibility IN ('public', 'internal')),
     client_key uuid        NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (clerk_env, request_id, client_key),
     FOREIGN KEY (clerk_env, request_id) REFERENCES support_requests (clerk_env, id)
   )`,
  `CREATE INDEX IF NOT EXISTS support_messages_request ON support_messages (clerk_env, request_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS support_events (
     id          uuid        PRIMARY KEY,
     ${ENV},
     request_id  uuid        NOT NULL,
     kind        text        NOT NULL CHECK (kind IN ('created', 'assigned', 'priority_changed', 'status_changed',
                               'waiting_changed', 'resolved', 'closed', 'reopened', 'replied')),
     actor_id    text,
     from_value  text,
     to_value    text,
     message_id  uuid,
     visibility  text        NOT NULL CHECK (visibility IN ('public', 'internal')),
     notify      boolean     NOT NULL DEFAULT false,
     notified_at timestamptz,
     created_at  timestamptz NOT NULL DEFAULT now(),
     FOREIGN KEY (clerk_env, request_id) REFERENCES support_requests (clerk_env, id)
   )`,
  `CREATE INDEX IF NOT EXISTS support_events_request ON support_events (clerk_env, request_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS support_events_pending
     ON support_events (clerk_env, created_at) WHERE notify AND notified_at IS NULL`,
  // The same guard the planner makes (src/lib/service-planner/store.ts), made here too so support
  // never depends on which store ran first. Created only when missing, never replaced.
  `DO $outer$ BEGIN
     IF to_regprocedure('fwm_require(boolean, text)') IS NULL THEN
       BEGIN
         CREATE FUNCTION fwm_require(ok boolean, code text) RETURNS boolean LANGUAGE plpgsql AS $fn$
         BEGIN
           IF ok IS NOT TRUE THEN RAISE EXCEPTION 'fwm:%', code; END IF;
           RETURN true;
         END
         $fn$;
       EXCEPTION WHEN duplicate_function OR unique_violation THEN NULL;
       END;
     END IF;
   END $outer$`,
  // Last: what SCHEMA_READY looks for.
  `CREATE INDEX IF NOT EXISTS support_events_message ON support_events (clerk_env, message_id) WHERE message_id IS NOT NULL`,
];

/** Whether SCHEMA has been applied (applySchema): the last thing it makes exists. New statements go at the end. */
const SCHEMA_READY = `SELECT to_regclass('support_events_message') IS NOT NULL
                         AND to_regprocedure('fwm_require(boolean, text)') IS NOT NULL AS ready`;

let schemaReady = false;

export async function supportSql(env: ClerkEnv): Promise<Sql> {
  const sql = await db(env);
  if (!schemaReady) {
    await applySchema(sql, SCHEMA, SCHEMA_READY);
    schemaReady = true;
  }
  return sql;
}

/** What fwm_require() raises: a workflow change based on an older revision, or a reply to a closed request. */
export function writeProblem(error: unknown): "conflict" | "closed" | null {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== "string") return null;
  if (message.includes("fwm:conflict")) return "conflict";
  if (message.includes("fwm:closed")) return "closed";
  return null;
}

const isUniqueViolation = (error: unknown) => (error as { code?: unknown } | null)?.code === "23505";

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface StoredRequest extends Workflow {
  id: string;
  publicId: string;
  submitterId: string;
  type: RequestType;
  category: Category;
  title: string;
  description: string;
  context: SupportContext;
  links: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

/** A request in a list: no description, no context. */
export type RequestSummary = Omit<StoredRequest, "description" | "context" | "links">;

export interface StoredMessage {
  id: string;
  authorId: string;
  body: string;
  visibility: "public" | "internal";
  createdAt: string;
}

export interface StoredEvent {
  id: string;
  requestId: string;
  kind: WorkflowEventKind;
  actorId: string | null;
  from: string | null;
  to: string | null;
  messageId: string | null;
  visibility: "public" | "internal";
  notify: boolean;
  notifiedAt: string | null;
  createdAt: string;
}

interface RequestRow {
  id: string;
  public_id: string;
  submitter_id: string;
  request_type: RequestType;
  category: Category;
  title: string;
  description?: string;
  status: Status;
  waiting_on: WaitingOn;
  priority: Priority;
  assignee_id: string | null;
  context?: SupportContext | string;
  links?: string[] | string;
  revision: number;
  created_at: Date | string;
  updated_at: Date | string;
  last_activity_at: Date | string;
  resolved_at: Date | string | null;
  closed_at: Date | string | null;
}

const iso = (value: Date | string) => new Date(value).toISOString();
const isoOrNull = (value: Date | string | null) => (value ? iso(value) : null);
const json = <T>(value: T | string | undefined, fallback: T): T => (value === undefined ? fallback : typeof value === "string" ? (JSON.parse(value) as T) : value);

const SUMMARY_COLUMNS = `id::text AS id, public_id, submitter_id, request_type, category, title, status, waiting_on, priority,
  assignee_id, revision, created_at, updated_at, last_activity_at, resolved_at, closed_at`;
const REQUEST_COLUMNS = `${SUMMARY_COLUMNS}, description, context, links`;

function toSummary(row: RequestRow): RequestSummary {
  return {
    id: row.id,
    publicId: row.public_id,
    submitterId: row.submitter_id,
    type: row.request_type,
    category: row.category,
    title: row.title,
    status: row.status,
    waitingOn: row.waiting_on,
    priority: row.priority,
    assigneeId: row.assignee_id,
    revision: row.revision,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    lastActivityAt: iso(row.last_activity_at),
    resolvedAt: isoOrNull(row.resolved_at),
    closedAt: isoOrNull(row.closed_at),
  };
}

function toRequest(row: RequestRow): StoredRequest {
  return {
    ...toSummary(row),
    description: row.description ?? "",
    context: json<SupportContext>(row.context, { v: 1 }),
    links: json<string[]>(row.links, []),
  };
}

interface EventRow {
  id: string;
  request_id: string;
  kind: WorkflowEventKind;
  actor_id: string | null;
  from_value: string | null;
  to_value: string | null;
  message_id: string | null;
  visibility: "public" | "internal";
  notify: boolean;
  notified_at: Date | string | null;
  created_at: Date | string;
}

const EVENT_COLUMNS = `id::text AS id, request_id::text AS request_id, kind, actor_id, from_value, to_value,
  message_id::text AS message_id, visibility, notify, notified_at, created_at`;

const toEvent = (row: EventRow): StoredEvent => ({
  id: row.id,
  requestId: row.request_id,
  kind: row.kind,
  actorId: row.actor_id,
  from: row.from_value,
  to: row.to_value,
  messageId: row.message_id,
  visibility: row.visibility,
  notify: row.notify,
  notifiedAt: isoOrNull(row.notified_at),
  createdAt: iso(row.created_at),
});

/** An event to record with a write. */
export interface EventWrite {
  kind: WorkflowEventKind;
  from: string | null;
  to: string | null;
  visibility: "public" | "internal";
  /** Whether anyone is to be told of it (notify.ts). */
  notify: boolean;
}

/** The workflow columns as one UPDATE's SET list; $n placeholders start at `first`. */
function workflowSet(first: number): string {
  const [status, waiting, priority, assignee] = [first, first + 1, first + 2, first + 3].map((n) => `$${n}`);
  return `status = ${status}, waiting_on = ${waiting}, priority = ${priority}, assignee_id = ${assignee},
          resolved_at = CASE WHEN ${status} = 'resolved' THEN COALESCE(resolved_at, now())
                             WHEN ${status} = 'closed' THEN resolved_at ELSE NULL END,
          closed_at = CASE WHEN ${status} = 'closed' THEN COALESCE(closed_at, now()) ELSE NULL END,
          revision = revision + 1, updated_at = now(), last_activity_at = now()`;
}

const workflowParams = (workflow: Workflow) => [workflow.status, workflow.waitingOn, workflow.priority, workflow.assigneeId];

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface RequestWrite {
  submitterId: string;
  submissionKey: string;
  type: RequestType;
  category: Category;
  title: string;
  description: string;
  context: SupportContext;
  links: readonly string[];
}

/**
 * Records a new request and its "created" event in one statement. Sending the
 * same submission again (the same person and key: a retry, a lost answer)
 * records nothing and returns the request already made.
 */
export async function insertRequest(
  env: ClerkEnv,
  write: RequestWrite,
  newPublicId: () => string,
): Promise<{ request: StoredRequest; created: boolean; eventId: string | null }> {
  const sql = await supportSql(env);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const rows = (await sql.query(
        `WITH ins AS (
           INSERT INTO support_requests (id, clerk_env, public_id, submitter_id, submission_key, request_type, category,
                                         title, description, context, links)
           VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
           ON CONFLICT (clerk_env, submitter_id, submission_key) DO NOTHING
           RETURNING id
         ), ev AS (
           INSERT INTO support_events (id, clerk_env, request_id, kind, actor_id, visibility, notify)
           SELECT $12::uuid, $2, ins.id, 'created', $4, 'public', true FROM ins
           RETURNING id
         )
         SELECT (SELECT id::text FROM ins) AS id, (SELECT id::text FROM ev) AS event_id`,
        [
          randomUUID(),
          env,
          newPublicId(),
          write.submitterId,
          write.submissionKey,
          write.type,
          write.category,
          write.title,
          write.description,
          JSON.stringify(write.context),
          JSON.stringify(write.links),
          randomUUID(),
        ],
      )) as Array<{ id: string | null; event_id: string | null }>;
      const created = rows[0]?.id ?? null;
      const existing = await sql.query(
        `SELECT ${REQUEST_COLUMNS} FROM support_requests WHERE clerk_env = $1 AND submitter_id = $2 AND submission_key = $3::uuid`,
        [env, write.submitterId, write.submissionKey],
      ) as RequestRow[];
      if (!existing[0]) throw new Error("A support request was not recorded.");
      return { request: toRequest(existing[0]), created: created !== null, eventId: rows[0]?.event_id ?? null };
    } catch (error) {
      // Another request already has this ID (vanishingly rare): try a new one.
      if (isUniqueViolation(error) && attempt < 3) continue;
      throw error;
    }
  }
  throw new Error("A support request ID could not be given.");
}

export interface ReplyWrite {
  requestId: string;
  expectedRevision: number;
  authorId: string;
  body: string;
  visibility: "public" | "internal";
  clientKey: string;
  /** The workflow after it; equal to the current one when nothing moves. */
  workflow: Workflow;
  /** Changes to record beside the reply itself. */
  events: readonly EventWrite[];
  /** The reply's own event: who is told of it (notify.ts reads `to` for what kind of reply). */
  replyEvent: EventWrite;
  /** A submitter may never post to a closed request; a manager's internal note may. */
  allowClosed: boolean;
}

export type ReplyResult =
  | { ok: true; messageId: string; revision: number; eventIds: string[]; duplicate: boolean }
  | { ok: false; reason: "conflict" | "closed" };

/**
 * Adds a message and moves the workflow with it, in one transaction:
 *
 *   1. lock the request, and stop unless its revision is still the one the
 *      reply was worked out from (and, for anyone but a manager's note, it is
 *      not closed)
 *   2. insert the message - nothing when its key was already used (a retry)
 *   3. only if it was inserted: move the workflow and record the events
 *
 * Two people replying at once both succeed: the second finds the revision
 * moved, and the service works its reply out again and retries.
 */
export async function appendReply(env: ClerkEnv, write: ReplyWrite): Promise<ReplyResult> {
  const sql = await supportSql(env);
  const existing = (await sql.query(
    `SELECT id::text AS id FROM support_messages WHERE clerk_env = $1 AND request_id = $2::uuid AND client_key = $3::uuid`,
    [env, write.requestId, write.clientKey],
  )) as Array<{ id: string }>;
  if (existing[0]) {
    const [row] = (await sql.query(`SELECT revision FROM support_requests WHERE clerk_env = $1 AND id = $2::uuid`, [
      env,
      write.requestId,
    ])) as Array<{ revision: number }>;
    return { ok: true, messageId: existing[0].id, revision: row?.revision ?? write.expectedRevision, eventIds: [], duplicate: true };
  }

  const messageId = randomUUID();
  const events = [write.replyEvent, ...write.events].map((event) => ({
    id: randomUUID(),
    kind: event.kind,
    from_value: event.from,
    to_value: event.to,
    visibility: event.visibility,
    notify: event.notify,
    message: event === write.replyEvent,
  }));
  try {
    const results = (await sql.transaction([
      sql.query(
        `SELECT fwm_require(r.revision = $3, 'conflict'), fwm_require(r.status <> 'closed' OR $4, 'closed')
           FROM (SELECT revision, status FROM support_requests WHERE clerk_env = $1 AND id = $2::uuid FOR UPDATE) r`,
        [env, write.requestId, write.expectedRevision, write.allowClosed],
      ),
      sql.query(
        `WITH msg AS (
           INSERT INTO support_messages (id, clerk_env, request_id, author_id, body, visibility, client_key)
           VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7::uuid)
           ON CONFLICT (clerk_env, request_id, client_key) DO NOTHING
           RETURNING id
         ), upd AS (
           UPDATE support_requests SET ${workflowSet(9)}
            WHERE clerk_env = $2 AND id = $3::uuid AND EXISTS (SELECT 1 FROM msg)
           RETURNING revision
         ), ev AS (
           INSERT INTO support_events (id, clerk_env, request_id, kind, actor_id, from_value, to_value, message_id, visibility, notify)
           SELECT e.id, $2, $3::uuid, e.kind, $4, e.from_value, e.to_value, CASE WHEN e.message THEN msg.id END, e.visibility, e.notify
             FROM msg CROSS JOIN jsonb_to_recordset($8::jsonb)
               AS e(id uuid, kind text, from_value text, to_value text, visibility text, notify boolean, message boolean)
           RETURNING id
         )
         SELECT (SELECT id::text FROM msg) AS message_id, (SELECT revision FROM upd) AS revision,
                COALESCE((SELECT array_agg(id::text) FROM ev), '{}') AS event_ids`,
        [
          messageId,
          env,
          write.requestId,
          write.authorId,
          write.body,
          write.visibility,
          write.clientKey,
          JSON.stringify(events),
          ...workflowParams(write.workflow),
        ],
      ),
    ])) as unknown[][];
    const row = (results[1] as Array<{ message_id: string | null; revision: number | null; event_ids: string[] }>)[0];
    if (!row?.message_id) return { ok: false, reason: "conflict" };
    return { ok: true, messageId: row.message_id, revision: row.revision ?? write.expectedRevision + 1, eventIds: row.event_ids, duplicate: false };
  } catch (error) {
    const problem = writeProblem(error);
    if (problem) return { ok: false, reason: problem };
    if (isUniqueViolation(error)) return { ok: false, reason: "conflict" };
    throw error;
  }
}

export type WorkflowSave = { ok: true; revision: number; eventIds: string[] } | { ok: false; reason: "conflict" };

/** A manager's change to the workflow: refused, with nothing written, if anyone changed the request since it was read. */
export async function saveWorkflow(
  env: ClerkEnv,
  write: { requestId: string; expectedRevision: number; actorId: string; workflow: Workflow; events: readonly EventWrite[] },
): Promise<WorkflowSave> {
  const sql = await supportSql(env);
  const events = write.events.map((event) => ({
    id: randomUUID(),
    kind: event.kind,
    from_value: event.from,
    to_value: event.to,
    visibility: event.visibility,
    notify: event.notify,
  }));
  try {
    const results = (await sql.transaction([
      sql.query(
        `SELECT fwm_require((SELECT revision FROM support_requests WHERE clerk_env = $1 AND id = $2::uuid FOR UPDATE) = $3, 'conflict')`,
        [env, write.requestId, write.expectedRevision],
      ),
      sql.query(
        `UPDATE support_requests SET ${workflowSet(3)} WHERE clerk_env = $1 AND id = $2::uuid RETURNING revision`,
        [env, write.requestId, ...workflowParams(write.workflow)],
      ),
      sql.query(
        `INSERT INTO support_events (id, clerk_env, request_id, kind, actor_id, from_value, to_value, visibility, notify)
         SELECT e.id, $1, $2::uuid, e.kind, $3, e.from_value, e.to_value, e.visibility, e.notify
           FROM jsonb_to_recordset($4::jsonb) AS e(id uuid, kind text, from_value text, to_value text, visibility text, notify boolean)
         RETURNING id::text AS id`,
        [env, write.requestId, write.actorId, JSON.stringify(events)],
      ),
    ])) as unknown[][];
    const revision = (results[1] as Array<{ revision: number }>)[0]?.revision ?? write.expectedRevision + 1;
    return { ok: true, revision, eventIds: (results[2] as Array<{ id: string }>).map((row) => row.id) };
  } catch (error) {
    if (writeProblem(error) === "conflict") return { ok: false, reason: "conflict" };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getRequest(env: ClerkEnv, publicId: string): Promise<StoredRequest | null> {
  const sql = await supportSql(env);
  const rows = (await sql.query(`SELECT ${REQUEST_COLUMNS} FROM support_requests WHERE clerk_env = $1 AND public_id = $2`, [
    env,
    publicId,
  ])) as RequestRow[];
  return rows[0] ? toRequest(rows[0]) : null;
}

export async function getRequestById(env: ClerkEnv, id: string): Promise<StoredRequest | null> {
  const sql = await supportSql(env);
  const rows = (await sql.query(`SELECT ${REQUEST_COLUMNS} FROM support_requests WHERE clerk_env = $1 AND id = $2::uuid`, [
    env,
    id,
  ])) as RequestRow[];
  return rows[0] ? toRequest(rows[0]) : null;
}

/** A request's messages, oldest first. Internal notes only when asked for - filtered here, in the query. */
export async function listMessages(env: ClerkEnv, requestId: string, includeInternal: boolean): Promise<StoredMessage[]> {
  const sql = await supportSql(env);
  const rows = (await sql.query(
    `SELECT id::text AS id, author_id, body, visibility, created_at FROM support_messages
      WHERE clerk_env = $1 AND request_id = $2::uuid AND ($3 OR visibility = 'public')
      ORDER BY created_at, id LIMIT 500`,
    [env, requestId, includeInternal],
  )) as Array<{ id: string; author_id: string; body: string; visibility: "public" | "internal"; created_at: Date | string }>;
  return rows.map((row) => ({ id: row.id, authorId: row.author_id, body: row.body, visibility: row.visibility, createdAt: iso(row.created_at) }));
}

/** A request's history, oldest first. Internal events only when asked for. */
export async function listEvents(env: ClerkEnv, requestId: string, includeInternal: boolean): Promise<StoredEvent[]> {
  const sql = await supportSql(env);
  const rows = (await sql.query(
    `SELECT ${EVENT_COLUMNS} FROM support_events
      WHERE clerk_env = $1 AND request_id = $2::uuid AND ($3 OR visibility = 'public')
      ORDER BY created_at, id LIMIT 500`,
    [env, requestId, includeInternal],
  )) as EventRow[];
  return rows.map(toEvent);
}

export const QUEUE_VIEWS = [
  "needs_action",
  "unassigned",
  "assigned_to_me",
  "awaiting_submitter",
  "in_progress",
  "active",
  "resolved",
  "closed",
  "all",
] as const;
export type QueueView = (typeof QUEUE_VIEWS)[number];

export interface ListFilter {
  /** Only this person's requests (My requests). */
  submitterId?: string;
  view?: QueueView;
  /** The viewer, for "assigned to me". */
  viewerId?: string;
  category?: Category | null;
  priority?: Priority | null;
  offset?: number;
  limit?: number;
}

const VIEW_WHERE: Record<QueueView, string> = {
  needs_action: `status IN ${ACTIVE} AND waiting_on = 'management'`,
  unassigned: `status IN ${ACTIVE} AND assignee_id IS NULL`,
  assigned_to_me: `status IN ${ACTIVE} AND assignee_id = $3::text`,
  awaiting_submitter: `status IN ${ACTIVE} AND waiting_on = 'submitter'`,
  in_progress: `status = 'in_progress'`,
  active: `status IN ${ACTIVE}`,
  resolved: `status = 'resolved'`,
  closed: `status = 'closed'`,
  all: `true`,
};

/**
 * One page of requests, most recently active first - urgent and high first
 * among the active ones. Asks for one more than the page, to know whether
 * there is another.
 */
export async function listRequests(env: ClerkEnv, filter: ListFilter): Promise<{ items: RequestSummary[]; more: boolean }> {
  const sql = await supportSql(env);
  const limit = Math.min(Math.max(filter.limit ?? 25, 1), 50);
  const view = filter.view ?? "all";
  const ranked = view !== "resolved" && view !== "closed" && view !== "all" && !filter.submitterId;
  const rows = (await sql.query(
    `SELECT ${SUMMARY_COLUMNS} FROM support_requests
      WHERE clerk_env = $1
        AND ($2::text IS NULL OR submitter_id = $2)
        -- Every parameter is referenced in every form of this query, as PostgreSQL requires.
        AND ($3::text IS NULL OR $3::text IS NOT NULL)
        AND ${filter.submitterId ? "true" : VIEW_WHERE[view]}
        AND ($4::text IS NULL OR category = $4)
        AND ($5::text IS NULL OR priority = $5)
      ORDER BY ${ranked ? "CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END," : ""} last_activity_at DESC, id DESC
      LIMIT $6 OFFSET $7`,
    [env, filter.submitterId ?? null, filter.viewerId ?? null, filter.category ?? null, filter.priority ?? null, limit + 1, Math.max(filter.offset ?? 0, 0)],
  )) as RequestRow[];
  return { items: rows.slice(0, limit).map(toSummary), more: rows.length > limit };
}

export interface AttentionCounts {
  /** The person's own requests waiting on their answer. */
  awaitingMe: number;
  /** Managers only: active requests waiting on management. */
  needsAction: number;
  /** Managers only: active requests nobody has taken. */
  unassigned: number;
  /** Managers only: active requests assigned to this person and waiting on management. */
  assignedToMe: number;
}

/** The Dashboard's counts: one bounded query over the active requests only. */
export async function attentionCounts(env: ClerkEnv, userId: string, manager: boolean): Promise<AttentionCounts> {
  const sql = await supportSql(env);
  const [row] = (await sql.query(
    `SELECT count(*) FILTER (WHERE submitter_id = $2 AND waiting_on = 'submitter')::int AS awaiting_me,
            count(*) FILTER (WHERE $3 AND waiting_on = 'management')::int AS needs_action,
            count(*) FILTER (WHERE $3 AND assignee_id IS NULL)::int AS unassigned,
            count(*) FILTER (WHERE $3 AND assignee_id = $2 AND waiting_on = 'management')::int AS assigned_to_me
       FROM support_requests
      WHERE clerk_env = $1 AND status IN ${ACTIVE} AND ($3 OR submitter_id = $2)`,
    [env, userId, manager],
  )) as Array<{ awaiting_me: number; needs_action: number; unassigned: number; assigned_to_me: number }>;
  return {
    awaitingMe: row?.awaiting_me ?? 0,
    needsAction: row?.needs_action ?? 0,
    unassigned: row?.unassigned ?? 0,
    assignedToMe: row?.assigned_to_me ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Telling people (notify.ts)
// ---------------------------------------------------------------------------

export async function getEvent(env: ClerkEnv, id: string): Promise<StoredEvent | null> {
  const sql = await supportSql(env);
  const rows = (await sql.query(`SELECT ${EVENT_COLUMNS} FROM support_events WHERE clerk_env = $1 AND id = $2::uuid`, [env, id])) as EventRow[];
  return rows[0] ? toEvent(rows[0]) : null;
}

/** Events someone is still to be told of, at least `olderThanMinutes` old (so not one being told now). */
export async function listPendingEvents(env: ClerkEnv, olderThanMinutes: number, limit = 25): Promise<StoredEvent[]> {
  const sql = await supportSql(env);
  const rows = (await sql.query(
    `SELECT ${EVENT_COLUMNS} FROM support_events
      WHERE clerk_env = $1 AND notify AND notified_at IS NULL AND created_at <= now() - make_interval(mins => $2::int)
      ORDER BY created_at LIMIT $3`,
    [env, olderThanMinutes, limit],
  )) as EventRow[];
  return rows.map(toEvent);
}

export async function markEventNotified(env: ClerkEnv, id: string): Promise<boolean> {
  const sql = await supportSql(env);
  const rows = (await sql.query(
    `UPDATE support_events SET notified_at = now() WHERE clerk_env = $1 AND id = $2::uuid AND notified_at IS NULL RETURNING id`,
    [env, id],
  )) as Array<{ id: string }>;
  return rows.length > 0;
}
