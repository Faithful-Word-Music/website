import "server-only";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { getSql } from "@/lib/db";

import {
  parseConductorAction,
  type ConductorAction,
  type ConductorActionKind,
  type ConductorActionResult,
  type ConductorActionStatus,
} from "../conductor/actions";
import { CONVERSATION_LIMITS, type ConversationSummary, type MessageStatus, type StoredConversation, type StoredMessage } from "./model";

/**
 * Where Conductor's conversations are kept.
 *
 *   conductor_conversations   one row per conversation: whose it is, its
 *                             title, when it was last spoken in, and the
 *                             summary of its older part
 *   conductor_messages        what was said, in order: the person's questions
 *                             and Conductor's answers (their text only - never
 *                             a tool's input or result)
 *   conductor_actions         what an answer PROPOSED (a memory to save, a
 *                             change to the philosophy) and what the person
 *                             chose. A proposal is only ever a row here until
 *                             the person approves it (conductor/resolve.ts)
 *
 * These are private to one person. EVERY function here takes the person
 * asking and matches on them in SQL as well as on the conversation, the
 * message or the proposal - there is no way to reach a row by its id alone,
 * so another person's id is simply "not found".
 *
 * Created on first use; every row carries the Clerk environment. Deleting a
 * conversation deletes its messages and proposals with it. The usage log
 * (src/lib/ai/store.ts) still holds no question and no answer.
 */

const ENV = `clerk_env text NOT NULL CHECK (clerk_env IN ('development', 'production'))`;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS conductor_conversations (
     id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
     ${ENV},
     clerk_user_id   text        NOT NULL,
     title           text        NOT NULL,
     title_source    text        NOT NULL DEFAULT 'auto' CHECK (title_source IN ('auto', 'user')),
     summary         text,
     summary_through bigint,
     created_at      timestamptz NOT NULL DEFAULT now(),
     last_message_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS conductor_conversations_owner ON conductor_conversations (clerk_env, clerk_user_id, last_message_at DESC)`,
  `CREATE TABLE IF NOT EXISTS conductor_messages (
     id              bigserial   PRIMARY KEY,
     ${ENV},
     conversation_id uuid        NOT NULL REFERENCES conductor_conversations (id) ON DELETE CASCADE,
     role            text        NOT NULL CHECK (role IN ('user', 'assistant')),
     text            text        NOT NULL,
     status          text        NOT NULL DEFAULT 'complete' CHECK (status IN ('complete', 'stopped', 'error')),
     error_message   text,
     created_at      timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS conductor_messages_conversation ON conductor_messages (conversation_id, id)`,
  `CREATE TABLE IF NOT EXISTS conductor_actions (
     id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
     ${ENV},
     conversation_id uuid        NOT NULL REFERENCES conductor_conversations (id) ON DELETE CASCADE,
     message_id      bigint      REFERENCES conductor_messages (id) ON DELETE CASCADE,
     clerk_user_id   text        NOT NULL,
     kind            text        NOT NULL,
     payload         jsonb       NOT NULL,
     status          text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'cancelled')),
     result          jsonb,
     created_at      timestamptz NOT NULL DEFAULT now(),
     resolved_at     timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS conductor_actions_message ON conductor_actions (message_id)`,
];

export class ConversationsUnavailableError extends Error {
  constructor() {
    super("DATABASE_URL is not set");
    this.name = "ConversationsUnavailableError";
  }
}

let schemaReady = false;

async function conversationSql() {
  const sql = getSql();
  if (!sql) throw new ConversationsUnavailableError();
  if (!schemaReady) {
    for (const statement of SCHEMA) await sql.query(statement);
    schemaReady = true;
  }
  return sql;
}

/** Whether conversations can be kept here at all. */
export function conversationsConfigured(): boolean {
  return getSql() !== null;
}

/** One person's rows of one environment: the first three parameters of every query below. */
const OWNED = `clerk_env = $1 AND clerk_user_id = $2`;

const iso = (value: Date | string) => new Date(value).toISOString();

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

interface ConversationRow {
  id: string;
  title: string;
  title_source: "auto" | "user";
  summary: string | null;
  summary_through: string | number | null;
  created_at: Date | string;
  last_message_at: Date | string;
}

const CONVERSATION_COLUMNS = `id, title, title_source, summary, summary_through, created_at, last_message_at`;

const toConversation = (row: ConversationRow): StoredConversation => ({
  id: row.id,
  title: row.title,
  titleSource: row.title_source,
  summary: row.summary,
  summaryThrough: row.summary_through === null ? null : Number(row.summary_through),
  createdAt: iso(row.created_at),
  lastMessageAt: iso(row.last_message_at),
});

export async function createConversation(env: ClerkEnv, userId: string, title: string): Promise<StoredConversation> {
  const sql = await conversationSql();
  const [row] = (await sql.query(
    `INSERT INTO conductor_conversations (clerk_env, clerk_user_id, title) VALUES ($1, $2, $3) RETURNING ${CONVERSATION_COLUMNS}`,
    [env, userId, title],
  )) as ConversationRow[];
  return toConversation(row);
}

/** One of this person's conversations; null for any other id, someone else's included. */
export async function getConversation(env: ClerkEnv, userId: string, id: string): Promise<StoredConversation | null> {
  const sql = await conversationSql();
  const rows = (await sql.query(`SELECT ${CONVERSATION_COLUMNS} FROM conductor_conversations WHERE ${OWNED} AND id = $3`, [
    env,
    userId,
    id,
  ])) as ConversationRow[];
  return rows[0] ? toConversation(rows[0]) : null;
}

/** This person's conversations, the one last spoken in first. */
export async function listConversations(env: ClerkEnv, userId: string, limit: number = CONVERSATION_LIMITS.listed): Promise<ConversationSummary[]> {
  const sql = await conversationSql();
  const rows = (await sql.query(
    `SELECT id, title, created_at, last_message_at FROM conductor_conversations
      WHERE ${OWNED} ORDER BY last_message_at DESC, created_at DESC LIMIT $3`,
    [env, userId, limit],
  )) as Array<Pick<ConversationRow, "id" | "title" | "created_at" | "last_message_at">>;
  return rows.map((row) => ({ id: row.id, title: row.title, createdAt: iso(row.created_at), lastMessageAt: iso(row.last_message_at) }));
}

/** Gives a conversation the title its owner typed. False when it is not theirs. */
export async function renameConversation(env: ClerkEnv, userId: string, id: string, title: string): Promise<boolean> {
  const sql = await conversationSql();
  const rows = (await sql.query(
    `UPDATE conductor_conversations SET title = $4, title_source = 'user' WHERE ${OWNED} AND id = $3 RETURNING id`,
    [env, userId, id, title],
  )) as unknown[];
  return rows.length > 0;
}

/** Deletes a conversation with everything said in it. False when it is not theirs. */
export async function deleteConversation(env: ClerkEnv, userId: string, id: string): Promise<boolean> {
  const sql = await conversationSql();
  const rows = (await sql.query(`DELETE FROM conductor_conversations WHERE ${OWNED} AND id = $3 RETURNING id`, [env, userId, id])) as unknown[];
  return rows.length > 0;
}

/** Keeps the summary of a conversation's older part, and how far it reaches. */
export async function setConversationSummary(env: ClerkEnv, userId: string, id: string, summary: string, through: number): Promise<void> {
  const sql = await conversationSql();
  await sql.query(
    // Never moved backwards: two answers settling together must not undo each other.
    `UPDATE conductor_conversations SET summary = $4, summary_through = $5
      WHERE ${OWNED} AND id = $3 AND (summary_through IS NULL OR summary_through < $5)`,
    [env, userId, id, summary, through],
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

interface MessageRow {
  id: string | number;
  role: "user" | "assistant";
  text: string;
  status: MessageStatus;
  error_message: string | null;
  created_at: Date | string;
}

interface ActionRow {
  id: string;
  message_id: string | number | null;
  kind: string;
  payload: unknown;
  status: ConductorActionStatus;
  result: unknown;
}

const ACTION_COLUMNS = `id, message_id, kind, payload, status, result`;

const json = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value);

const toAction = (row: ActionRow): ConductorAction | null =>
  parseConductorAction({ id: row.id, kind: row.kind, status: row.status, payload: json(row.payload), result: json(row.result) });

/**
 * Adds a message to one of this person's conversations and returns its id;
 * null when the conversation is not theirs. The conversation moves to the top
 * of their list.
 */
export async function addMessage(
  env: ClerkEnv,
  userId: string,
  conversationId: string,
  message: { role: "user" | "assistant"; text: string; status?: MessageStatus; errorMessage?: string | null },
): Promise<number | null> {
  const sql = await conversationSql();
  const rows = (await sql.query(
    `WITH owned AS (
       UPDATE conductor_conversations SET last_message_at = now() WHERE ${OWNED} AND id = $3 RETURNING id
     )
     INSERT INTO conductor_messages (clerk_env, conversation_id, role, text, status, error_message)
     SELECT $1, owned.id, $4, $5, $6, $7 FROM owned
     RETURNING id`,
    [env, userId, conversationId, message.role, message.text, message.status ?? "complete", message.errorMessage ?? null],
  )) as Array<{ id: string | number }>;
  return rows[0] ? Number(rows[0].id) : null;
}

/**
 * The messages of one of this person's conversations, oldest first, each with
 * what it proposed: the latest `limit` of them, and only those after
 * `afterId` when one is given. Empty when the conversation is not theirs.
 */
export async function listMessages(
  env: ClerkEnv,
  userId: string,
  conversationId: string,
  options: { afterId?: number | null; limit?: number } = {},
): Promise<StoredMessage[]> {
  const sql = await conversationSql();
  const rows = (await sql.query(
    `SELECT m.id, m.role, m.text, m.status, m.error_message, m.created_at
       FROM conductor_messages m
       JOIN conductor_conversations c ON c.id = m.conversation_id
      WHERE c.clerk_env = $1 AND c.clerk_user_id = $2 AND c.id = $3 AND ($4::bigint IS NULL OR m.id > $4::bigint)
      ORDER BY m.id DESC LIMIT $5`,
    [env, userId, conversationId, options.afterId ?? null, options.limit ?? CONVERSATION_LIMITS.shownMessages],
  )) as MessageRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => Number(row.id));
  const actions = (await sql.query(
    `SELECT ${ACTION_COLUMNS} FROM conductor_actions
      WHERE ${OWNED} AND conversation_id = $3 AND message_id = ANY($4::bigint[]) ORDER BY created_at, id`,
    [env, userId, conversationId, ids],
  )) as ActionRow[];
  const byMessage = new Map<number, ConductorAction[]>();
  for (const row of actions) {
    const action = toAction(row);
    if (!action || row.message_id === null) continue;
    byMessage.set(Number(row.message_id), [...(byMessage.get(Number(row.message_id)) ?? []), action]);
  }

  return rows.reverse().map((row) => ({
    id: Number(row.id),
    role: row.role,
    text: row.text,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: iso(row.created_at),
    actions: byMessage.get(Number(row.id)) ?? [],
  }));
}

/**
 * Takes back the last question and whatever answered it, so the question can
 * be asked again - but only if the last question IS `question`. The page asks
 * for this after a failure, when it cannot know whether its question was ever
 * stored; if it was not, the exchange before it must not be the one removed.
 * Nothing happens when the conversation is not theirs.
 */
export async function removeLastExchange(env: ClerkEnv, userId: string, conversationId: string, question: string): Promise<void> {
  const sql = await conversationSql();
  await sql.query(
    `DELETE FROM conductor_messages m
      USING conductor_conversations c
      WHERE c.id = m.conversation_id AND c.clerk_env = $1 AND c.clerk_user_id = $2 AND c.id = $3
        AND m.id >= (
          SELECT last.id FROM conductor_messages last
           WHERE last.conversation_id = $3 AND last.role = 'user'
             AND last.id = (SELECT max(id) FROM conductor_messages WHERE conversation_id = $3 AND role = 'user')
             AND last.text = $4
        )`,
    [env, userId, conversationId, question],
  );
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

/** Records something an answer proposed, waiting for the person. Null when the conversation is not theirs. */
export async function insertAction(
  env: ClerkEnv,
  userId: string,
  conversationId: string,
  kind: ConductorActionKind,
  payload: unknown,
): Promise<ConductorAction | null> {
  const sql = await conversationSql();
  const rows = (await sql.query(
    `INSERT INTO conductor_actions (clerk_env, conversation_id, clerk_user_id, kind, payload)
     SELECT $1, c.id, $2, $4, $5::jsonb FROM conductor_conversations c WHERE c.clerk_env = $1 AND c.clerk_user_id = $2 AND c.id = $3
     RETURNING ${ACTION_COLUMNS}`,
    [env, userId, conversationId, kind, JSON.stringify(payload)],
  )) as ActionRow[];
  return rows[0] ? toAction(rows[0]) : null;
}

/** Ties an answer's proposals to the answer once it is stored, so they are shown with it from then on. */
export async function attachActions(env: ClerkEnv, userId: string, actionIds: readonly string[], messageId: number): Promise<void> {
  if (actionIds.length === 0) return;
  const sql = await conversationSql();
  await sql.query(`UPDATE conductor_actions SET message_id = $4 WHERE ${OWNED} AND id = ANY($3::uuid[]) AND message_id IS NULL`, [
    env,
    userId,
    [...actionIds],
    messageId,
  ]);
}

/** One of this person's proposals; null for any other id. */
export async function getAction(env: ClerkEnv, userId: string, id: string): Promise<ConductorAction | null> {
  const sql = await conversationSql();
  const rows = (await sql.query(`SELECT ${ACTION_COLUMNS} FROM conductor_actions WHERE ${OWNED} AND id = $3`, [env, userId, id])) as ActionRow[];
  return rows[0] ? toAction(rows[0]) : null;
}

/**
 * Settles a proposal - but only one still waiting. Returns it as settled, or
 * null when it was already settled (or is not this person's): two clicks, or
 * two tabs, can never apply the same proposal twice.
 */
export async function claimAction(
  env: ClerkEnv,
  userId: string,
  id: string,
  status: Exclude<ConductorActionStatus, "pending">,
  result: ConductorActionResult | null,
): Promise<ConductorAction | null> {
  const sql = await conversationSql();
  const rows = (await sql.query(
    `UPDATE conductor_actions SET status = $4, result = $5::jsonb, resolved_at = now()
      WHERE ${OWNED} AND id = $3 AND status = 'pending' RETURNING ${ACTION_COLUMNS}`,
    [env, userId, id, status, result ? JSON.stringify(result) : null],
  )) as ActionRow[];
  return rows[0] ? toAction(rows[0]) : null;
}

/** Puts a proposal back to waiting, when applying it failed after it was claimed. */
export async function releaseAction(env: ClerkEnv, userId: string, id: string): Promise<void> {
  const sql = await conversationSql();
  await sql.query(`UPDATE conductor_actions SET status = 'pending', result = NULL, resolved_at = NULL WHERE ${OWNED} AND id = $3`, [
    env,
    userId,
    id,
  ]);
}
