import { describe, expect, it } from "vitest";

import type { Permission } from "@/lib/auth/permissions";

import type { SupportActor } from "./access";
import type { SupportContext } from "./context";
import { applyWorkflow, type Workflow } from "./model";
import { createRequest, listMine, listQueue, readRequest, reply, updateWorkflow, type SupportDeps } from "./service";
import type { EventWrite, StoredEvent, StoredMessage, StoredRequest } from "./store";

/**
 * The support rules on an in-memory store that behaves like the real one
 * (src/lib/support/store.ts): idempotent keys, revisions, and the "closed"
 * guard. The SQL itself runs on PGlite in support.integration.test.ts.
 */
function memory(options: { managers?: string[]; context?: SupportContext | "changed" | "hidden" } = {}) {
  const requests: StoredRequest[] = [];
  const messages: Array<StoredMessage & { requestId: string; clientKey: string }> = [];
  const events: StoredEvent[] = [];
  const told: string[] = [];
  let next = 0;
  /** Runs before the next write, as if someone else saved first. */
  let interrupt: (() => void) | null = null;

  const record = (requestId: string, actorId: string, list: readonly EventWrite[], messageId: string | null = null) =>
    list.map((event, index) => {
      const id = `ev-${++next}`;
      events.push({
        id,
        requestId,
        kind: event.kind,
        actorId,
        from: event.from,
        to: event.to,
        messageId: index === 0 ? messageId : null,
        visibility: event.visibility,
        notify: event.notify,
        notifiedAt: null,
        createdAt: new Date(next * 1000).toISOString(),
      });
      return id;
    });
  const move = (request: StoredRequest, workflow: Workflow) => Object.assign(request, workflow, { revision: request.revision + 1 });

  const deps: SupportDeps = {
    async insertRequest(write) {
      const existing = requests.find((item) => item.submitterId === write.submitterId && (item as StoredRequest & { submissionKey?: string }).submissionKey === write.submissionKey);
      if (existing) return { request: existing, created: false, eventId: null };
      const request = {
        ...write,
        submissionKey: write.submissionKey,
        id: `req-${++next}`,
        publicId: `R-${String(next).padStart(8, "0")}`,
        links: [...write.links],
        status: "open",
        waitingOn: "management",
        priority: "normal",
        assigneeId: null,
        revision: 1,
        createdAt: "",
        updatedAt: "",
        lastActivityAt: "",
        resolvedAt: null,
        closedAt: null,
      } as unknown as StoredRequest & { submissionKey: string };
      requests.push(request);
      const [eventId] = record(request.id, write.submitterId, [{ kind: "created", from: null, to: null, visibility: "public", notify: true }]);
      return { request, created: true, eventId };
    },
    getRequest: async (publicId) => {
      const found = requests.find((item) => item.publicId === publicId);
      return found ? { ...found } : null;
    },
    listMessages: async (requestId, internal) => messages.filter((item) => item.requestId === requestId && (internal || item.visibility === "public")),
    listEvents: async (requestId, internal) => events.filter((item) => item.requestId === requestId && (internal || item.visibility === "public")),
    async appendReply(write) {
      interrupt?.();
      interrupt = null;
      const request = requests.find((item) => item.id === write.requestId)!;
      const same = messages.find((item) => item.requestId === write.requestId && item.clientKey === write.clientKey);
      if (same) return { ok: true, messageId: same.id, revision: request.revision, eventIds: [], duplicate: true };
      if (request.revision !== write.expectedRevision) return { ok: false, reason: "conflict" };
      if (request.status === "closed" && !write.allowClosed) return { ok: false, reason: "closed" };
      const id = `msg-${++next}`;
      messages.push({ id, requestId: write.requestId, clientKey: write.clientKey, authorId: write.authorId, body: write.body, visibility: write.visibility, createdAt: "" });
      move(request, write.workflow);
      const eventIds = record(request.id, write.authorId, [write.replyEvent, ...write.events], id);
      return { ok: true, messageId: id, revision: request.revision, eventIds, duplicate: false };
    },
    async saveWorkflow(write) {
      interrupt?.();
      interrupt = null;
      const request = requests.find((item) => item.id === write.requestId)!;
      if (request.revision !== write.expectedRevision) return { ok: false, reason: "conflict" };
      move(request, write.workflow);
      return { ok: true, revision: request.revision, eventIds: record(request.id, write.actorId, write.events) };
    },
    listRequests: async (filter) => ({
      items: requests.filter((item) => !filter.submitterId || item.submitterId === filter.submitterId),
      more: false,
    }),
    isManager: async (userId) => (options.managers ?? []).includes(userId),
    async resolveContext() {
      const context = options.context ?? { v: 1 };
      if (context === "changed" || context === "hidden") return { ok: false, reason: context };
      return { ok: true, context };
    },
    tell: (ids) => told.push(...ids),
  };
  return { deps, requests, messages, events, told, interruptNextWrite: (run: () => void) => (interrupt = run) };
}

const person = (userId: string, ...permissions: Permission[]): SupportActor => ({ userId, can: (permission) => permissions.includes(permission) });
const MEMBER = person("user_john", "submit_support_requests");
const OTHER = person("user_mary", "submit_support_requests");
const DIRECTOR = person("user_director", "submit_support_requests", "manage_support_requests", "manage_service_plans");
const DELEGATE = person("user_helper", "submit_support_requests", "manage_support_requests");
const REVOKED = person("user_helper", "submit_support_requests");
const DENIED = person("user_denied");

const KEY = "6f9619ff-8b86-4d01-b42d-00c04fc964ff";
const key = (n: number) => `6f9619ff-8b86-4d01-b42d-${String(n).padStart(12, "0")}`;
const draft = { type: "sheet_music", category: "missing_sheet_music", title: "No clarinet part", description: "Hymn 12 has no clarinet part.", submissionKey: KEY };

async function sent(store: ReturnType<typeof memory>, as: SupportActor = MEMBER) {
  const result = await createRequest(as, draft, store.deps);
  if (!result.ok) throw new Error(result.problem);
  return result.request;
}

describe("sending a request", () => {
  it("records it once, however many times the same submission arrives", async () => {
    const store = memory();
    const first = await createRequest(MEMBER, draft, store.deps);
    const again = await createRequest(MEMBER, draft, store.deps);
    expect(first.ok && again.ok).toBe(true);
    expect(store.requests).toHaveLength(1);
    expect(again.ok && again.created).toBe(false);
    expect(store.told).toHaveLength(1);
  });

  it("needs the permission, a matching kind and real content", async () => {
    const store = memory();
    expect(await createRequest(DENIED, draft, store.deps)).toEqual({ ok: false, problem: "forbidden" });
    expect(await createRequest(MEMBER, { ...draft, type: "question" }, store.deps)).toEqual({ ok: false, problem: "invalid" });
    expect(await createRequest(MEMBER, { ...draft, title: " " }, store.deps)).toEqual({ ok: false, problem: "invalid" });
    expect(await createRequest(MEMBER, { ...draft, links: ["javascript:alert(1)"] }, store.deps)).toEqual({ ok: false, problem: "invalid" });
    expect(await createRequest(MEMBER, { ...draft, submissionKey: "again" }, store.deps)).toEqual({ ok: false, problem: "invalid" });
    expect(store.requests).toHaveLength(0);
  });

  it("refuses context the person cannot see, and says when a song list changed underneath them", async () => {
    const withContext = { ...draft, type: "problem", category: "wrong_key", context: { service: "2026-11-08-am", position: 1, songId: "BTH-001" } };
    expect(await createRequest(MEMBER, withContext, memory({ context: "hidden" }).deps)).toEqual({ ok: false, problem: "context" });
    expect(await createRequest(MEMBER, withContext, memory({ context: "changed" }).deps)).toEqual({ ok: false, problem: "changed" });
  });

  it("needs an assignment for a song leading problem", async () => {
    const leading = { ...draft, type: "problem", category: "leader_assignment" };
    expect(await createRequest(MEMBER, leading, memory().deps)).toEqual({ ok: false, problem: "context" });
  });
});

describe("reading", () => {
  it("shows a member their own request and nobody else's", async () => {
    const store = memory();
    const request = await sent(store);
    expect((await readRequest(MEMBER, request.publicId, store.deps)).ok).toBe(true);
    expect(await readRequest(OTHER, request.publicId, store.deps)).toEqual({ ok: false, problem: "not-found" });
    expect(await readRequest(DENIED, request.publicId, store.deps)).toEqual({ ok: false, problem: "not-found" });
    expect((await listMine(OTHER, 0, store.deps)).ok && (await listMine(OTHER, 0, store.deps))).toMatchObject({ items: [] });
  });

  it("lets delegated managers see everything, and stops at once when the permission goes", async () => {
    const store = memory();
    const request = await sent(store);
    expect((await readRequest(DELEGATE, request.publicId, store.deps)).ok).toBe(true);
    expect((await listQueue(DELEGATE, { view: "active", category: null, priority: null, offset: 0 }, store.deps)).ok).toBe(true);
    expect(await readRequest(REVOKED, request.publicId, store.deps)).toEqual({ ok: false, problem: "not-found" });
    expect(await listQueue(REVOKED, { view: "active", category: null, priority: null, offset: 0 }, store.deps)).toEqual({ ok: false, problem: "forbidden" });
  });

  it("never shows a submitter an internal note or management housekeeping", async () => {
    const store = memory({ managers: ["user_director"] });
    const request = await sent(store);
    await reply(DIRECTOR, { publicId: request.publicId, body: "Secret: ask Bob", visibility: "internal", clientKey: key(1) }, store.deps);
    await updateWorkflow(DIRECTOR, { publicId: request.publicId, expectedRevision: 2, assigneeId: "user_director", priority: "urgent" }, store.deps);
    const view = await readRequest(MEMBER, request.publicId, store.deps);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(JSON.stringify(view.view)).not.toContain("Secret");
    expect(view.view.events.map((event) => event.kind)).toEqual(["created"]);
    const managerView = await readRequest(DIRECTOR, request.publicId, store.deps);
    expect(managerView.ok && managerView.view.messages.map((message) => message.body)).toEqual(["Secret: ask Bob"]);
  });
});

describe("replying", () => {
  it("never lets a member write an internal note, or claim to be someone else", async () => {
    const store = memory();
    const request = await sent(store);
    expect(await reply(MEMBER, { publicId: request.publicId, body: "x", visibility: "internal", clientKey: key(1) }, store.deps)).toEqual({ ok: false, problem: "forbidden" });
    await reply(MEMBER, { publicId: request.publicId, body: "More detail", visibility: "public", clientKey: key(2), authorId: "user_director" } as never, store.deps);
    expect(store.messages.map((message) => message.authorId)).toEqual(["user_john"]);
    expect(await reply(OTHER, { publicId: request.publicId, body: "x", visibility: "public", clientKey: key(3) }, store.deps)).toEqual({ ok: false, problem: "not-found" });
  });

  it("keeps both of two replies sent at the same moment", async () => {
    const store = memory({ managers: ["user_director"] });
    const request = await sent(store);
    // The manager's reply lands while the member's is on its way: the member's is worked out again, not lost.
    store.interruptNextWrite(() => {
      const stored = store.requests[0];
      store.messages.push({ id: "msg-x", requestId: stored.id, clientKey: key(9), authorId: "user_director", body: "Which hymnal?", visibility: "public", createdAt: "" });
      Object.assign(stored, applyWorkflow(stored, { waitingOn: "submitter" }), { revision: stored.revision + 1 });
    });
    const result = await reply(MEMBER, { publicId: request.publicId, body: "The red one", visibility: "public", clientKey: key(1) }, store.deps);
    expect(result.ok).toBe(true);
    expect(store.messages.map((message) => message.body)).toEqual(["Which hymnal?", "The red one"]);
    expect(store.requests[0].waitingOn).toBe("management");
  });

  it("sends a retried reply once", async () => {
    const store = memory();
    const request = await sent(store);
    const input = { publicId: request.publicId, body: "Again", visibility: "public", clientKey: key(1) };
    await reply(MEMBER, input, store.deps);
    expect(await reply(MEMBER, input, store.deps)).toMatchObject({ ok: true, duplicate: true });
    expect(store.messages).toHaveLength(1);
  });

  it("reopens a resolved request only on an explicit request, records it, and refuses a closed one", async () => {
    const store = memory({ managers: ["user_director"] });
    const request = await sent(store);
    await reply(DIRECTOR, { publicId: request.publicId, body: "Added it.", visibility: "public", clientKey: key(1), after: "resolve" }, store.deps);
    expect(store.requests[0].status).toBe("resolved");
    await reply(MEMBER, { publicId: request.publicId, body: "Thanks!", visibility: "public", clientKey: key(2) }, store.deps);
    expect(store.requests[0].status).toBe("resolved");
    await reply(MEMBER, { publicId: request.publicId, body: "Still wrong", visibility: "public", clientKey: key(3), reopen: true }, store.deps);
    expect(store.requests[0].status).toBe("open");
    expect(store.events.filter((event) => event.kind === "reopened")).toHaveLength(1);

    await updateWorkflow(DIRECTOR, { publicId: request.publicId, expectedRevision: store.requests[0].revision, status: "closed" }, store.deps);
    expect(await reply(MEMBER, { publicId: request.publicId, body: "Hello?", visibility: "public", clientKey: key(4), reopen: true }, store.deps)).toEqual({ ok: false, problem: "closed" });
    expect(store.requests[0].status).toBe("closed");
  });

  it("owes a notification for public replies and none for internal notes", async () => {
    const store = memory({ managers: ["user_director"] });
    const request = await sent(store);
    await reply(DIRECTOR, { publicId: request.publicId, body: "Note", visibility: "internal", clientKey: key(1) }, store.deps);
    await reply(DIRECTOR, { publicId: request.publicId, body: "Which song?", visibility: "public", clientKey: key(2), after: "request_info" }, store.deps);
    const replies = store.events.filter((event) => event.kind === "replied");
    expect(replies.map((event) => [event.visibility, event.to, event.notify])).toEqual([
      ["internal", "internal", false],
      ["public", "request_info", true],
    ]);
  });
});

describe("managing", () => {
  it("is for managers only", async () => {
    const store = memory({ managers: ["user_director"] });
    const request = await sent(store);
    expect(await updateWorkflow(MEMBER, { publicId: request.publicId, expectedRevision: 1, priority: "urgent" }, store.deps)).toEqual({ ok: false, problem: "forbidden" });
    expect(store.requests[0].priority).toBe("normal");
  });

  it("refuses a change based on an older revision, and keeps the history of every change", async () => {
    const store = memory({ managers: ["user_director", "user_helper"] });
    const request = await sent(store);
    expect(await updateWorkflow(DIRECTOR, { publicId: request.publicId, expectedRevision: 1, status: "in_progress", assigneeId: "user_helper" }, store.deps)).toMatchObject({ ok: true });
    expect(await updateWorkflow(DELEGATE, { publicId: request.publicId, expectedRevision: 1, priority: "high" }, store.deps)).toEqual({ ok: false, problem: "conflict" });
    store.interruptNextWrite(() => (store.requests[0].revision += 1));
    expect(await updateWorkflow(DELEGATE, { publicId: request.publicId, expectedRevision: 2, priority: "high" }, store.deps)).toEqual({ ok: false, problem: "conflict" });
    expect(store.requests[0]).toMatchObject({ status: "in_progress", assigneeId: "user_helper", priority: "normal" });
    expect(store.events.map((event) => event.kind)).toEqual(["created", "status_changed", "assigned"]);
  });

  it("assigns only to someone who manages requests, and tells the assignee but not someone claiming it", async () => {
    const store = memory({ managers: ["user_director", "user_helper"] });
    const request = await sent(store);
    expect(await updateWorkflow(DIRECTOR, { publicId: request.publicId, expectedRevision: 1, assigneeId: "user_john" }, store.deps)).toEqual({ ok: false, problem: "invalid" });
    await updateWorkflow(DIRECTOR, { publicId: request.publicId, expectedRevision: 1, assigneeId: "user_director" }, store.deps);
    await updateWorkflow(DIRECTOR, { publicId: request.publicId, expectedRevision: 2, assigneeId: "user_helper" }, store.deps);
    expect(store.events.filter((event) => event.kind === "assigned").map((event) => event.notify)).toEqual([false, true]);
  });

  it("does not let a request wait on someone once it is resolved", async () => {
    const store = memory({ managers: ["user_director"] });
    const request = await sent(store);
    expect(await updateWorkflow(DIRECTOR, { publicId: request.publicId, expectedRevision: 1, status: "resolved", waitingOn: "submitter" }, store.deps)).toEqual({ ok: false, problem: "invalid" });
  });
});
