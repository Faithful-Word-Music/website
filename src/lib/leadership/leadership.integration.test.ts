import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Song leaders' SQL - and the notification outbox's - on a real, isolated,
 * in-memory PostgreSQL (PGlite). It never reads DATABASE_URL and can reach
 * nothing but the engine this file creates. Optional, like
 * store-identity.integration.test.ts: set LEADERSHIP_PGLITE (or
 * SONG_IDENTITY_PGLITE) to the file URL of PGlite's dist/index.js, then run
 *   npm test -- src/lib/leadership/leadership.integration.test.ts
 *
 * Statements are sent lazily, as the Neon driver does: a transaction's
 * statements run inside BEGIN/COMMIT, and one that fails undoes them all.
 */

interface Engine {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  transaction<T>(work: (tx: Engine) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const local = vi.hoisted(() => ({ engine: null as Engine | null }));

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
// The notification tables' connection comes through the accounts' store: the same engine here.
vi.mock("@/lib/auth/store", async () => {
  const { getSql } = await import("@/lib/db");
  return { db: async () => getSql() };
});

const packageUrl = process.env.LEADERSHIP_PGLITE ?? process.env.SONG_IDENTITY_PGLITE;
const where = { date: "2026-11-08", slot: "PM" as const };
const write = {
  date: where.date,
  slot: where.slot,
  kind: "regular" as const,
  label: null,
  startsAt: "2026-11-08T18:00:00-07:00",
  insertMode: "week" as const,
  slots: [null, null, null],
  places: ["a", "b", "c"],
};

describe.skipIf(!packageUrl)("song leaders on isolated PostgreSQL", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { PGlite } = (await import(/* @vite-ignore */ packageUrl!)) as { PGlite: new () => Engine };
    local.engine = new PGlite();
  }, 30_000);

  afterEach(async () => {
    await local.engine?.close();
    local.engine = null;
  });

  it("creates its tables again and again without harm, and reads a service never saved as 'p1'...", async () => {
    const store = await import("@/lib/service-planner/store");
    const { applySchema } = await import("@/lib/db");
    await store.listPlans("development");
    // A second server starting up: every statement again, unchanged.
    await store.plannerSql();
    await (applySchema as (sql: unknown, statements: string[]) => Promise<void>)(null, [
      `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS place_ids jsonb`,
    ]);
    // A row saved before places had IDs.
    await local.engine!.query(
      `INSERT INTO service_plans (clerk_env, service_date, slot, starts_at, slots) VALUES ('development', '2026-11-08', 'PM', now(), '[null, null]'::jsonb)`,
    );
    expect((await store.getPlan("development", where.date, where.slot))?.places).toEqual(["p1", "p2"]);
  }, 30_000);

  it("saves leaders against a revision, refuses a stale one, and keeps environments apart", async () => {
    const { savePlan } = await import("@/lib/service-planner/store");
    const { getLeadership, saveLeadership, listLeadership } = await import("./store");
    const saved = await savePlan("development", write, null, "user_director", []);
    expect(saved.ok && saved.plan.places).toEqual(["a", "b", "c"]);
    const planRevision = saved.ok ? saved.plan.revision : 0;

    const input = {
      expectedRevision: 0,
      write: { defaultUserId: "user_director", overrides: { c: { kind: "assigned" as const, userId: "user_brian" } } },
      dropped: [],
      actor: "user_director",
      change: null,
    };
    expect(await saveLeadership("development", where, planRevision, input)).toMatchObject({ ok: true, revision: 1 });
    // Someone else saved from the same starting point: refused, and nothing of theirs is written.
    expect(
      await saveLeadership("development", where, planRevision, { ...input, write: { defaultUserId: "user_carl", overrides: {} } }),
    ).toEqual({ ok: false, reason: "conflict" });
    // The songs changed since: refused too.
    expect(await saveLeadership("development", where, planRevision + 1, { ...input, expectedRevision: 1 })).toEqual({ ok: false, reason: "conflict" });
    expect(await getLeadership("development", where)).toEqual({
      defaultUserId: "user_director",
      overrides: { c: { kind: "assigned", userId: "user_brian" } },
      revision: 1,
    });
    expect((await listLeadership("production", { from: "2026-11-01", to: "2026-11-30" })).size).toBe(0);
    expect((await listLeadership("development", { from: "2026-11-01", to: "2026-11-30" })).size).toBe(1);
  }, 30_000);

  it("drops a removed place's leader in the same transaction as the songs - or neither", async () => {
    const { savePlan, savePlanWith } = await import("@/lib/service-planner/store");
    const { getLeadership, leadershipStatements, saveLeadership, listUnnotifiedChanges, markChangeNotified } = await import("./store");
    const first = await savePlan("development", write, null, "user_director", []);
    const revision = first.ok ? first.plan.revision : 0;
    await saveLeadership("development", where, revision, {
      expectedRevision: 0,
      write: { defaultUserId: null, overrides: { b: { kind: "assigned", userId: "user_brian" }, c: { kind: "unassigned" } } },
      dropped: [],
      actor: "user_director",
      change: null,
    });
    const change = {
      cause: "songs" as const,
      details: {
        before: { defaultUserId: null, places: [{ id: "a", userId: null }, { id: "b", userId: "user_brian" }, { id: "c", userId: null }] },
        after: { defaultUserId: null, places: [{ id: "a", userId: null }, { id: "c", userId: null }] },
      },
    };
    const more = (expectedRevision: number) => (sql: Parameters<typeof leadershipStatements>[0]) =>
      leadershipStatements(sql, "development", where, { expectedRevision, write: null, dropped: ["b"], actor: "user_director", change }).statements;

    // Stale songs revision: the whole transaction is undone - the leader stays.
    expect(await savePlanWith("development", { ...write, slots: [null, null], places: ["a", "c"] }, revision + 5, "user_director", [], more(1))).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect((await getLeadership("development", where)).overrides).toHaveProperty("b");
    // Stale leaders revision: undone too - the songs stay as they were.
    expect(await savePlanWith("development", { ...write, slots: [null, null], places: ["a", "c"] }, revision, "user_director", [], more(0))).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect((await local.engine!.query(`SELECT jsonb_array_length(slots) AS n FROM service_plans`)).rows).toEqual([{ n: 3 }]);

    const saved = await savePlanWith("development", { ...write, slots: [null, null], places: ["a", "c"] }, revision, "user_director", [], more(1));
    expect(saved.ok && saved.plan.places).toEqual(["a", "c"]);
    expect(await getLeadership("development", where)).toEqual({ defaultUserId: null, overrides: { c: { kind: "unassigned" } }, revision: 2 });

    // The change is recorded, owed until told - and told once.
    const [owed] = await listUnnotifiedChanges("development", 0);
    expect(owed).toMatchObject({ cause: "songs", details: change.details, notifiedAt: null });
    expect(await markChangeNotified("development", owed.id)).toBe(true);
    expect(await markChangeNotified("development", owed.id)).toBe(false);
    expect(await listUnnotifiedChanges("development", 0)).toEqual([]);
  }, 30_000);

  it("stores the place IDs a leaders-only save used, so publishing never detaches its leaders", async () => {
    const { getPlan, publishPlans, savePlan } = await import("@/lib/service-planner/store");
    const { getLeadership, saveLeadership } = await import("./store");
    const { effectiveLeaders } = await import("./model");
    await savePlan("development", write, null, "user_director", []);
    // An older version of the site changed the songs without their IDs: they no longer match.
    await local.engine!.query(`UPDATE service_plans SET slots = '[null, null, null, null]'::jsonb`);
    const before = (await getPlan("development", where.date, where.slot))!;
    expect(before.placesReset).toBe(true);

    const saved = await saveLeadership("development", where, before.revision, {
      expectedRevision: 0,
      write: { defaultUserId: null, overrides: { [before.places[3]]: { kind: "assigned", userId: "user_brian" } } },
      dropped: [],
      actor: "user_director",
      change: null,
      places: before.places,
    });
    expect(saved.ok).toBe(true);
    // Publishing moves the songs' revision on; the IDs - and so the leader - must not move with it.
    await publishPlans("development", [where], "user_director");
    const after = (await getPlan("development", where.date, where.slot))!;
    expect(after.places).toEqual(before.places);
    expect(after.placesReset).toBeUndefined();
    expect(effectiveLeaders(after.places, await getLeadership("development", where))[3].userId).toBe("user_brian");
  }, 30_000);

  it("stores a legacy service's 'p1'... IDs with its first leaders, without moving its revision", async () => {
    const { getPlan } = await import("@/lib/service-planner/store");
    const { saveLeadership } = await import("./store");
    await (await import("@/lib/service-planner/store")).plannerSql();
    await local.engine!.query(
      `INSERT INTO service_plans (clerk_env, service_date, slot, starts_at, slots) VALUES ('development', '2026-11-08', 'PM', now(), '[null, null]'::jsonb)`,
    );
    const legacy = (await getPlan("development", where.date, where.slot))!;
    expect(
      await saveLeadership("development", where, legacy.revision, {
        expectedRevision: 0,
        write: { defaultUserId: null, overrides: { p2: { kind: "unassigned" } } },
        dropped: [],
        actor: "user_director",
        change: null,
        places: legacy.places,
      }),
    ).toMatchObject({ ok: true });
    expect((await local.engine!.query(`SELECT place_ids, revision FROM service_plans`)).rows).toEqual([{ place_ids: ["p1", "p2"], revision: legacy.revision }]);
  }, 30_000);

  it("keeps leaders given to a service nobody had planned through its first save - and refuses them once it was stored", async () => {
    const { getPlan, savePlanWith } = await import("@/lib/service-planner/store");
    const { getLeadership, saveLeadership } = await import("./store");
    const { effectiveLeaders } = await import("./model");
    const { positionalPlaceIds } = await import("@/lib/service-planner/model");
    const unplanned = positionalPlaceIds(5);
    const leaders = {
      expectedRevision: 0,
      write: { defaultUserId: "user_director", overrides: { p5: { kind: "assigned" as const, userId: "user_brian" } } },
      dropped: [],
      actor: "user_director",
      change: null,
      places: null,
    };
    // No service_plans row: it stays unplanned (no draft is made).
    expect(await saveLeadership("development", where, 0, leaders)).toMatchObject({ ok: true, revision: 1 });
    expect(await getPlan("development", where.date, where.slot)).toBeNull();

    // Its first save, from a page that showed "p1"..."p5".
    const first = await savePlanWith("development", { ...write, slots: [null, null, null, null, null], places: unplanned }, null, "user_director", [], () => []);
    expect(first.ok && first.plan.places).toEqual(unplanned);
    const leadership = await getLeadership("development", where);
    expect(effectiveLeaders(unplanned, leadership).map((place) => place.userId)).toEqual([
      "user_director", "user_director", "user_director", "user_director", "user_brian",
    ]);
    // A leaders save worked out while it was still unplanned is refused now that it is stored.
    expect(await saveLeadership("development", where, 0, { ...leaders, expectedRevision: 1 })).toEqual({ ok: false, reason: "conflict" });
  }, 30_000);

  it("refuses a second first save of the same service rather than silently ignoring it", async () => {
    const { savePlanWith } = await import("@/lib/service-planner/store");
    expect((await savePlanWith("development", write, null, "user_director", [], () => [])).ok).toBe(true);
    expect(await savePlanWith("development", write, null, "user_carl", [], () => [])).toEqual({ ok: false, reason: "conflict" });
  }, 30_000);

  it("deletes a never-published special service's leaders with it", async () => {
    const { savePlan, deleteDraftSpecial } = await import("@/lib/service-planner/store");
    const { getLeadership, saveLeadership } = await import("./store");
    const saved = await savePlan("development", { ...write, kind: "special", label: "Conference" }, null, "user_director", []);
    await saveLeadership("development", where, saved.ok ? saved.plan.revision : 0, {
      expectedRevision: 0,
      write: { defaultUserId: "user_brian", overrides: { a: { kind: "unassigned" } } },
      dropped: [],
      actor: "user_director",
      change: null,
    });
    expect(await deleteDraftSpecial("development", where.date, where.slot)).toBe(true);
    expect(await getLeadership("development", where)).toEqual({ defaultUserId: null, overrides: {}, revision: 0 });
    expect((await local.engine!.query(`SELECT count(*)::int AS n FROM service_leader_overrides`)).rows).toEqual([{ n: 0 }]);
  }, 30_000);

  it("records a notification and its email together, once per dedupe key, and lets one worker claim each email", async () => {
    const { notificationDeps } = await import("@/lib/notifications/store");
    const { emailDeps } = await import("@/lib/notifications/email-store");
    const deps = notificationDeps("development");
    await deps.listCategories(); // the tables, and the starting categories
    const write = {
      category: "song_leading",
      eventKey: "song_leading.assigned",
      actorUserId: "user_director",
      entityType: "service_leading",
      entityId: "2026-11-08-pm",
      payload: { anchor: "2026-11-08-pm" },
      title: "You're leading song 3 at Sunday Evening",
      body: "Sunday, November 8: you have been assigned to lead song 3.",
      actionUrl: "/dashboard",
      priority: "normal" as const,
      recipients: [{ userId: "user_brian", inApp: true, push: false, email: true }, { userId: "user_carl", inApp: true, push: false, email: false }],
      coalesce: { family: "song_leading.service", windowMinutes: 15, title: "x", body: "y" },
      dedupeKey: "leadership:change-1:user_brian",
      email: { subject: "You're leading song 3", text: "text", html: "<p>html</p>" },
    };
    const first = await deps.record(write);
    expect(first.duplicate).toBeUndefined();
    expect(first.notifications).toHaveLength(2);
    expect(first.emails).toHaveLength(1);
    // The same change again: nothing at all.
    expect(await deps.record(write)).toMatchObject({ duplicate: true, notifications: [], emails: [] });
    expect((await local.engine!.query(`SELECT count(*)::int AS n FROM notifications`)).rows).toEqual([{ n: 2 }]);

    // A later change to the same service supersedes the email still waiting.
    const later = await deps.record({ ...write, dedupeKey: "leadership:change-2:user_brian" });
    const statuses = (await local.engine!.query(`SELECT id::text, status FROM notification_email_outbox ORDER BY created_at, id`)).rows;
    expect(statuses.find((row) => row.id === first.emails![0])?.status).toBe("superseded");
    expect(statuses.find((row) => row.id === later.emails![0])?.status).toBe("pending");

    // Two workers at once: each row is taken by one of them only.
    const email = emailDeps("development");
    const [a, b] = await Promise.all([email.claim(10), email.claim(10)]);
    expect([...a, ...b].map((row) => row.id)).toEqual([later.emails![0]]);
    expect(await emailDeps("production").claim(10)).toEqual([]);
    await email.settle([...a, ...b][0], { status: "sent", providerId: "re_1" });
    expect((await local.engine!.query(`SELECT status, attempts FROM notification_email_outbox WHERE id = $1::uuid`, [later.emails![0]])).rows).toEqual([
      { status: "sent", attempts: 1 },
    ]);
    expect((await local.engine!.query(`SELECT channel, status FROM notification_deliveries`)).rows).toEqual([{ channel: "email", status: "sent" }]);
  }, 30_000);
});
