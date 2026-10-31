import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Support requests' SQL on a real, isolated, in-memory PostgreSQL (PGlite).
 * It never reads DATABASE_URL and can reach nothing but the engine this file
 * creates; no email can be sent (Resend is replaced, and sending is not
 * switched on). Optional, like the other integration tests: set
 * SUPPORT_PGLITE (or LEADERSHIP_PGLITE / SONG_IDENTITY_PGLITE) to the file URL
 * of PGlite's dist/index.js, then run
 *   npm test -- src/lib/support/support.integration.test.ts
 */

interface Engine {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  transaction<T>(work: (tx: Engine) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const local = vi.hoisted(() => ({ engine: null as Engine | null, authReady: false }));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (task: () => unknown) => void task(), NextResponse: { json: () => null } }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: () => {}, updateTag: () => {} }));
vi.mock("@/lib/resend", () => ({ isEmailConfigured: () => false, sendNotificationEmail: async () => ({ ok: false, reason: "not-configured" }) }));
vi.mock("@/lib/db", () => {
  class Pending {
    constructor(readonly text: string, readonly params: unknown[] = []) {}
    then<A, B>(resolve: (rows: unknown) => A, reject: (error: unknown) => B) {
      return local.engine!.query(this.text, this.params).then((result) => resolve(result.rows), reject);
    }
  }
  const sql = {
    query: (text: string, params?: unknown[]) => new Pending(text, params),
    transaction: (list: Pending[]) =>
      local.engine!.transaction(async (tx) => {
        const out: unknown[] = [];
        for (const item of list) out.push((await tx.query(item.text, item.params)).rows);
        return out;
      }),
  };
  return {
    getSql: () => sql,
    applySchema: async (_sql: unknown, statements: readonly string[]) =>
      local.engine!.transaction(async (tx) => {
        for (const statement of statements) await tx.query(statement);
      }),
  };
});
// The account tables (roles, permissions, schema_fixups) are the real ones; nothing is seeded.
vi.mock("@/lib/auth/store", async () => {
  const { getSql, applySchema } = await import("@/lib/db");
  const { AUTH_SCHEMA } = await import("@/lib/auth/schema.mjs");
  return {
    db: async () => {
      if (!local.authReady) {
        await (applySchema as (sql: unknown, statements: readonly string[]) => Promise<void>)(null, AUTH_SCHEMA);
        local.authReady = true;
      }
      return getSql();
    },
  };
});

const packageUrl = process.env.SUPPORT_PGLITE ?? process.env.LEADERSHIP_PGLITE ?? process.env.SONG_IDENTITY_PGLITE;
const KEY = "6f9619ff-8b86-4d01-b42d-00c04fc964ff";
const key = (n: number) => `6f9619ff-8b86-4d01-b42d-${String(n).padStart(12, "0")}`;
const write = {
  submitterId: "user_john",
  submissionKey: KEY,
  type: "problem" as const,
  category: "wrong_key" as const,
  title: "Wrong key for hymn 12",
  description: "It is printed in G but we sing it in F.",
  context: {
    v: 1 as const,
    service: { anchor: "2026-11-08-am", date: "2026-11-08", slot: "AM" as const, label: null, startsAt: null, state: "published" as const, planRevision: 3 },
    place: { placeId: "p2", position: 2, song: { songId: "BTH-012", title: "Hymn Twelve", number: "12", collection: "BTH", key: "G" } },
  },
  links: ["https://example.com/photo"],
};
let ids = 0;
const nextId = () => `R-${String(++ids).padStart(8, "0")}`;
const director = { userId: "user_director", can: (permission: string) => ["manage_support_requests", "submit_support_requests"].includes(permission) };
const john = { userId: "user_john", can: (permission: string) => permission === "submit_support_requests" };

describe.skipIf(!packageUrl)("support requests on isolated PostgreSQL", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { PGlite } = (await import(/* @vite-ignore */ packageUrl!)) as { PGlite: new () => Engine };
    local.engine = new PGlite();
    local.authReady = false;
  }, 30_000);

  afterEach(async () => {
    await local.engine?.close();
    local.engine = null;
  });

  /** The real store behind the real rules, without the context checks (those are tested on their own). */
  async function rules() {
    const store = await import("./store");
    const service = await import("./service");
    const told: string[] = [];
    const deps = {
      insertRequest: (w: Parameters<typeof store.insertRequest>[1]) => store.insertRequest("development", w, nextId),
      getRequest: (id: string) => store.getRequest("development", id),
      listMessages: (id: string, internal: boolean) => store.listMessages("development", id, internal),
      listEvents: (id: string, internal: boolean) => store.listEvents("development", id, internal),
      appendReply: (w: Parameters<typeof store.appendReply>[1]) => store.appendReply("development", w),
      saveWorkflow: (w: Parameters<typeof store.saveWorkflow>[1]) => store.saveWorkflow("development", w),
      listRequests: (filter: Parameters<typeof store.listRequests>[1]) => store.listRequests("development", filter),
      isManager: async (userId: string) => userId === "user_director",
      resolveContext: async () => ({ ok: true as const, context: write.context }),
      tell: (eventIds: readonly string[]) => void told.push(...eventIds),
    };
    return { store, service, deps, told };
  }

  it("creates its tables again and again without harm", async () => {
    const { store } = await rules();
    await store.supportSql("development");
    const { applySchema } = await import("@/lib/db");
    // A second server starting up, running every statement again.
    const source = await import("./store");
    await source.supportSql("production");
    await (applySchema as (sql: unknown, statements: string[]) => Promise<void>)(null, [`CREATE INDEX IF NOT EXISTS support_events_message ON support_events (clerk_env, message_id) WHERE message_id IS NOT NULL`]);
    expect((await local.engine!.query(`SELECT to_regclass('support_requests') IS NOT NULL AS ok`)).rows).toEqual([{ ok: true }]);
  }, 30_000);

  it("records a submission once however often it arrives, with its created event, in this environment only", async () => {
    const { store } = await rules();
    const first = await store.insertRequest("development", write, nextId);
    const again = await store.insertRequest("development", write, nextId);
    expect(first.created).toBe(true);
    expect(again).toMatchObject({ created: false, eventId: null });
    expect(again.request.publicId).toBe(first.request.publicId);
    expect(first.request.context).toEqual(write.context);
    expect((await local.engine!.query(`SELECT count(*)::int AS n FROM support_events`)).rows).toEqual([{ n: 1 }]);
    expect(await store.getRequest("production", first.request.publicId)).toBeNull();
    expect((await store.listRequests("production", { view: "all" })).items).toEqual([]);
    // The same key from someone else is a different submission.
    expect((await store.insertRequest("development", { ...write, submitterId: "user_mary" }, nextId)).created).toBe(true);
  }, 30_000);

  it("never lets a message or an event point at a request of the other environment", async () => {
    const { store } = await rules();
    const { request } = await store.insertRequest("development", write, nextId);
    await expect(
      local.engine!.query(
        `INSERT INTO support_messages (id, clerk_env, request_id, author_id, body, visibility, client_key)
         VALUES (gen_random_uuid(), 'production', $1::uuid, 'user_x', 'hi', 'public', gen_random_uuid())`,
        [request.id],
      ),
    ).rejects.toThrow();
    await expect(
      local.engine!.query(
        `INSERT INTO support_events (id, clerk_env, request_id, kind, visibility) VALUES (gen_random_uuid(), 'production', $1::uuid, 'created', 'public')`,
        [request.id],
      ),
    ).rejects.toThrow();
  }, 30_000);

  it("keeps both of two replies sent at once, and a retried reply once", async () => {
    const { service, deps } = await rules();
    const created = await service.createRequest(john, { ...write, submissionKey: KEY }, deps);
    if (!created.ok) throw new Error(created.problem);
    const id = created.request.publicId;
    const [a, b] = await Promise.all([
      service.reply(director, { publicId: id, body: "Which hymnal?", visibility: "public", clientKey: key(1), after: "request_info" }, deps),
      service.reply(john, { publicId: id, body: "The red one.", visibility: "public", clientKey: key(2) }, deps),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(await service.reply(john, { publicId: id, body: "The red one.", visibility: "public", clientKey: key(2) }, deps)).toMatchObject({
      ok: true,
      duplicate: true,
    });
    const messages = (await local.engine!.query(`SELECT body FROM support_messages ORDER BY created_at`)).rows.map((row) => row.body);
    expect(messages.sort()).toEqual(["The red one.", "Which hymnal?"]);
    const [row] = (await local.engine!.query(`SELECT revision FROM support_requests`)).rows;
    expect(row.revision).toBe(3);
  }, 30_000);

  it("refuses a stale workflow change with nothing written, and keeps the history of each change", async () => {
    const { service, deps } = await rules();
    const created = await service.createRequest(john, write, deps);
    if (!created.ok) throw new Error(created.problem);
    const id = created.request.publicId;
    expect(await service.updateWorkflow(director, { publicId: id, expectedRevision: 1, status: "in_progress", priority: "high", assigneeId: "user_director" }, deps)).toMatchObject({ ok: true });
    const { store } = await rules();
    const request = (await store.getRequest("development", id))!;
    // Worked out from revision 1, saved after revision 2: refused as a whole.
    expect(await store.saveWorkflow("development", { requestId: request.id, expectedRevision: 1, actorId: "user_director", workflow: { ...request, status: "closed", waitingOn: "none" }, events: [{ kind: "closed", from: "in_progress", to: "closed", visibility: "public", notify: true }] })).toEqual({ ok: false, reason: "conflict" });
    expect((await store.getRequest("development", id))!).toMatchObject({ status: "in_progress", priority: "high", assigneeId: "user_director", revision: 2 });
    expect((await local.engine!.query(`SELECT kind FROM support_events ORDER BY created_at, kind`)).rows.map((row) => row.kind).sort()).toEqual(
      ["assigned", "created", "priority_changed", "status_changed"].sort(),
    );

    await service.updateWorkflow(director, { publicId: id, expectedRevision: 2, status: "resolved" }, deps);
    expect((await store.getRequest("development", id))!).toMatchObject({ status: "resolved", waitingOn: "none" });
    expect((await store.getRequest("development", id))!.resolvedAt).not.toBeNull();
    // A closed request takes no replies from its submitter, even one that asks to reopen it.
    await service.updateWorkflow(director, { publicId: id, expectedRevision: 3, status: "closed" }, deps);
    expect(await service.reply(john, { publicId: id, body: "Hello?", visibility: "public", clientKey: key(5), reopen: true }, deps)).toEqual({ ok: false, problem: "closed" });
    // A manager's internal note still may be added.
    expect((await service.reply(director, { publicId: id, body: "Archived.", visibility: "internal", clientKey: key(6) }, deps)).ok).toBe(true);
  }, 30_000);

  it("filters internal notes in the query itself", async () => {
    const { service, store, deps } = await rules();
    const created = await service.createRequest(john, write, deps);
    if (!created.ok) throw new Error(created.problem);
    await service.reply(director, { publicId: created.request.publicId, body: "Private note", visibility: "internal", clientKey: key(1) }, deps);
    expect(await store.listMessages("development", created.request.id, false)).toEqual([]);
    expect((await store.listMessages("development", created.request.id, true)).map((message) => message.body)).toEqual(["Private note"]);
    expect((await store.listEvents("development", created.request.id, false)).map((event) => event.kind)).toEqual(["created"]);
  }, 30_000);

  it("counts the Dashboard's items from the active requests only", async () => {
    const { service, store, deps } = await rules();
    const a = await service.createRequest(john, write, deps);
    const b = await service.createRequest(john, { ...write, submissionKey: key(2) }, deps);
    if (!a.ok || !b.ok) throw new Error("not created");
    await service.reply(director, { publicId: a.request.publicId, body: "Which one?", visibility: "public", clientKey: key(3), after: "request_info" }, deps);
    await service.updateWorkflow(director, { publicId: b.request.publicId, expectedRevision: 1, status: "closed" }, deps);
    expect(await store.attentionCounts("development", "user_john", false)).toEqual({ awaitingMe: 1, needsAction: 0, unassigned: 0, assignedToMe: 0 });
    expect(await store.attentionCounts("development", "user_director", true)).toEqual({ awaitingMe: 0, needsAction: 0, unassigned: 1, assignedToMe: 0 });
    expect((await store.listRequests("development", { view: "awaiting_submitter" })).items.map((item) => item.publicId)).toEqual([a.request.publicId]);
    expect((await store.listRequests("development", { view: "closed" })).items.map((item) => item.publicId)).toEqual([b.request.publicId]);
    expect((await store.listRequests("development", { submitterId: "user_mary" })).items).toEqual([]);
  }, 30_000);

  it("tells the managers once, emails only who opted in, and tells what an interrupted server left owed", async () => {
    const { service, deps, told } = await rules();
    const { notificationDeps } = await import("@/lib/notifications/store");
    await notificationDeps("development").listCategories();
    await local.engine!.query(`INSERT INTO roles (clerk_env, key, label) VALUES ('development', 'music_director', 'Music Director') ON CONFLICT DO NOTHING`);
    await local.engine!.query(`INSERT INTO role_permissions (clerk_env, role_key, permission) VALUES ('development', 'music_director', 'manage_support_requests')`);
    await local.engine!.query(`INSERT INTO user_roles (clerk_env, clerk_user_id, role_key) VALUES ('development', 'user_director', 'music_director')`);
    await local.engine!.query(
      `INSERT INTO user_notification_preferences (clerk_env, clerk_user_id, category_key, channel, enabled) VALUES ('development', 'user_director', 'sheet_music_report', 'email', true)`,
    );

    // The request is saved; the server "stops" before telling anyone (tell only collected the IDs).
    const created = await service.createRequest(john, write, deps);
    if (!created.ok) throw new Error(created.problem);
    expect(told).toHaveLength(1);
    expect((await local.engine!.query(`SELECT count(*)::int AS n FROM notifications`)).rows).toEqual([{ n: 0 }]);

    const { drainSupportEvents, tellSupportEvent } = await import("./notify");
    expect(await drainSupportEvents("development", 0)).toEqual({ told: 1, pending: 0 });
    expect(await tellSupportEvent("development", told[0])).toBe(true);
    const rows = (await local.engine!.query(`SELECT recipient_user_id, title, body FROM notifications`)).rows;
    expect(rows).toEqual([{ recipient_user_id: "user_director", title: "New support request", body: `${created.request.publicId} · Wrong key` }]);
    const outbox = (await local.engine!.query(`SELECT clerk_user_id, status, text_body FROM notification_email_outbox`)).rows;
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ clerk_user_id: "user_director" });
    expect(["pending", "failed"]).toContain(outbox[0].status);
    expect(String(outbox[0].text_body)).not.toContain(write.description);
    expect((await local.engine!.query(`SELECT count(*)::int AS n FROM support_events WHERE notified_at IS NULL AND notify`)).rows).toEqual([{ n: 0 }]);

    // An internal note owes nobody anything.
    await service.reply(director, { publicId: created.request.publicId, body: "note", visibility: "internal", clientKey: key(9) }, deps);
    expect((await local.engine!.query(`SELECT count(*)::int AS n FROM support_events WHERE notify AND notified_at IS NULL`)).rows).toEqual([{ n: 0 }]);
  }, 30_000);
  /** Roles as a real site has them: the director manages requests; John and Mary are members who may send them. */
  async function seedPeople() {
    const { notificationDeps } = await import("@/lib/notifications/store");
    await notificationDeps("development").listCategories();
    await local.engine!.query(
      `INSERT INTO roles (clerk_env, key, label) VALUES ('development', 'music_director', 'Music Director'), ('development', 'member', 'Member') ON CONFLICT DO NOTHING`,
    );
    await local.engine!.query(
      `INSERT INTO role_permissions (clerk_env, role_key, permission) VALUES
         ('development', 'music_director', 'manage_support_requests'), ('development', 'member', 'submit_support_requests')`,
    );
    await local.engine!.query(
      `INSERT INTO user_roles (clerk_env, clerk_user_id, role_key) VALUES
         ('development', 'user_director', 'music_director'), ('development', 'user_john', 'member'), ('development', 'user_mary', 'member')`,
    );
  }

  /** Acknowledgment rows in the outbox: the submitter's own, under support_confirmation. */
  const acknowledgments = async () =>
    (
      await local.engine!.query(
        `SELECT o.id::text AS id, o.clerk_user_id, o.status, o.subject, o.text_body, o.attempts
           FROM notification_email_outbox o JOIN notifications n ON n.id = o.notification_id
          WHERE n.category_key = 'support_confirmation' ORDER BY o.created_at, o.id`,
      )
    ).rows;

  it("acknowledges a new request to its submitter once, by email only - never again for retries or follow-ups", async () => {
    const { service, deps, told } = await rules();
    await seedPeople();

    const created = await service.createRequest(john, write, deps);
    if (!created.ok) throw new Error(created.problem);
    const { drainSupportEvents, tellSupportEvent } = await import("./notify");
    expect(await drainSupportEvents("development", 0)).toEqual({ told: 1, pending: 0 });

    const [ack, ...more] = await acknowledgments();
    expect(more).toEqual([]);
    expect(ack).toMatchObject({ clerk_user_id: "user_john", status: "pending", subject: "We received your support request" });
    expect(String(ack.text_body)).toContain(`Request: ${write.title}`);
    expect(String(ack.text_body)).toContain(`Reference: ${created.request.publicId}`);
    expect(String(ack.text_body)).toContain("Status: Open");
    expect(String(ack.text_body)).toContain(`/contact/requests/${created.request.publicId}`);
    expect(String(ack.text_body)).not.toContain(write.description);
    // Nothing in John's bell: the confirmation is email only.
    expect((await local.engine!.query(`SELECT in_app FROM notifications WHERE recipient_user_id = 'user_john'`)).rows).toEqual([{ in_app: false }]);

    // Told again (a retry, the daily drain), sent again with the same key, replied to by both sides: still one.
    expect(await tellSupportEvent("development", told[0])).toBe(true);
    await local.engine!.query(`UPDATE support_events SET notified_at = NULL`);
    await drainSupportEvents("development", 0);
    const again = await service.createRequest(john, write, deps);
    expect(again.ok && again.created).toBe(false);
    await service.reply(john, { publicId: created.request.publicId, body: "One more thing", visibility: "public", clientKey: key(21) }, deps);
    await service.reply(director, { publicId: created.request.publicId, body: "Thanks", visibility: "public", clientKey: key(22), after: "keep" }, deps);
    await drainSupportEvents("development", 0);
    expect(await acknowledgments()).toHaveLength(1);

    // Someone who switched it off gets none; their request is saved all the same.
    await local.engine!.query(
      `INSERT INTO user_notification_preferences (clerk_env, clerk_user_id, category_key, channel, enabled)
       VALUES ('development', 'user_mary', 'support_confirmation', 'email', false)`,
    );
    const mary = { userId: "user_mary", can: (permission: string) => permission === "submit_support_requests" };
    const marys = await service.createRequest(mary, { ...write, submissionKey: key(30) }, deps);
    expect(marys.ok).toBe(true);
    await drainSupportEvents("development", 0);
    expect((await acknowledgments()).map((row) => row.clerk_user_id)).toEqual(["user_john"]);
  }, 30_000);

  it("delivers an acknowledgment once, retries what may pass, and gives up on what will not", async () => {
    const { service, deps } = await rules();
    await seedPeople();
    const { drainSupportEvents } = await import("./notify");
    const { emailDeps } = await import("@/lib/notifications/email-store");
    const { drainEmailOutbox } = await import("@/lib/notifications/email-delivery");

    type Answer = Awaited<ReturnType<ReturnType<typeof emailDeps>["send"]>>;
    const sent: Array<{ to: string; idempotencyKey: string }> = [];
    let answer: Answer = { ok: true, providerId: "re_1" };
    let address: string | null = "john@example.com";
    // The real outbox (claim, settle); only the provider and the address book are stand-ins.
    const drain = () =>
      drainEmailOutbox({
        ...emailDeps("development"),
        enabled: () => true,
        addresses: async (userIds) => new Map(userIds.map((id) => [id, id === "user_john" ? address : null])),
        send: async (message) => {
          sent.push({ to: message.to, idempotencyKey: message.idempotencyKey });
          return answer;
        },
      });
    const status = async () => (await acknowledgments()).map((row) => [row.status, row.attempts]);
    const submit = async (n: number) => {
      const created = await service.createRequest(john, { ...write, submissionKey: key(n) }, deps);
      if (!created.ok) throw new Error(created.problem);
      await drainSupportEvents("development", 0);
    };

    // Accepted: sent once, with the outbox row's ID as the idempotency key; a second drain sends nothing.
    await submit(41);
    expect(await drain()).toMatchObject({ sent: 1 });
    expect(await drain()).toMatchObject({ sent: 0, retrying: 0 });
    const [first] = await acknowledgments();
    expect(sent).toEqual([{ to: "john@example.com", idempotencyKey: first.id }]);
    expect(await status()).toEqual([["sent", 1]]);

    // The provider's own trouble: tried again later, not now.
    answer = { ok: false, kind: "transient", statusCode: 500, error: "application_error" };
    await submit(42);
    expect(await drain()).toMatchObject({ retrying: 1 });
    expect(await drain()).toMatchObject({ retrying: 0 });
    expect((await status())[1]).toEqual(["pending", 1]);
    const due = (await local.engine!.query(`SELECT next_attempt_at > now() AS later FROM notification_email_outbox WHERE status = 'pending'`)).rows;
    expect(due).toEqual([{ later: true }]);
    // When it comes due and the provider is back, it goes - with the same key.
    await local.engine!.query(`UPDATE notification_email_outbox SET next_attempt_at = now() - interval '1 second' WHERE status = 'pending'`);
    answer = { ok: true, providerId: "re_2" };
    expect(await drain()).toMatchObject({ sent: 1 });
    expect(sent.at(-1)!.idempotencyKey).toBe(sent.at(-2)!.idempotencyKey);
    expect((await status())[1]).toEqual(["sent", 2]);

    // Refused for good (a bad address): failed, never tried again.
    answer = { ok: false, kind: "permanent", statusCode: 422, error: "validation_error" };
    await submit(43);
    expect(await drain()).toMatchObject({ failed: 1 });
    expect((await status())[2]).toEqual(["failed", 1]);

    // No verified address: skipped, nothing sent.
    address = null;
    const before = sent.length;
    await submit(44);
    expect(await drain()).toMatchObject({ skipped: 1 });
    expect(sent).toHaveLength(before);
    expect((await status())[3]).toEqual(["skipped", 1]);

    // Every request is saved whatever became of its email.
    expect((await local.engine!.query(`SELECT count(*)::int AS n FROM support_requests`)).rows).toEqual([{ n: 4 }]);
  }, 30_000);
});
