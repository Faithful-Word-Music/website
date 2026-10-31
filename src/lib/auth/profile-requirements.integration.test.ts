import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Profile requirements' SQL on a real, isolated, in-memory PostgreSQL
 * (PGlite). It never reads DATABASE_URL and can reach nothing but the engine
 * this file creates. Optional, like the other *.integration.test.ts files:
 * set PROFILE_PGLITE (or LEADERSHIP_PGLITE) to the file URL of PGlite's
 * dist/index.js, then run
 *   npm test -- src/lib/auth/profile-requirements.integration.test.ts
 */

interface Engine {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  transaction<T>(work: (tx: Engine) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const local = vi.hoisted(() => ({ engine: null as Engine | null }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: () => {}, updateTag: () => {} }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: async () => null, auth: async () => ({ userId: null }), clerkClient: async () => ({}) }));
vi.mock("@/lib/db", () => {
  class Pending {
    constructor(readonly text: string, readonly params: unknown[] = []) {}
    then<A, B>(resolve: (rows: unknown) => A, reject: (error: unknown) => B) {
      return local.engine!.query(this.text, this.params).then((result) => resolve(result.rows), reject);
    }
  }
  const sql: {
    query: (text: string, params?: unknown[]) => Pending;
    transaction: (input: Pending[] | ((txn: unknown) => Pending[])) => Promise<unknown[]>;
  } = {
    query: (text: string, params?: unknown[]) => new Pending(text, params),
    // Both of the Neon driver's forms: a list, or a function of the transaction returning one.
    transaction: (input) => {
      const list = typeof input === "function" ? input(sql) : input;
      return local.engine!.transaction(async (tx) => {
        const out: unknown[] = [];
        for (const item of list) out.push((await tx.query(item.text, item.params)).rows);
        return out;
      });
    },
  };
  return {
    getSql: () => sql,
    applySchema: async (_sql: unknown, statements: readonly string[]) =>
      local.engine!.transaction(async (tx) => {
        for (const statement of statements) await tx.query(statement);
      }),
  };
});

const packageUrl = process.env.PROFILE_PGLITE ?? process.env.LEADERSHIP_PGLITE;
const ENV = "development" as const;
const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!packageUrl)("profile requirements on isolated PostgreSQL", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { PGlite } = (await import(/* @vite-ignore */ packageUrl!)) as { PGlite: new () => Engine };
    local.engine = new PGlite();
  }, 30_000);

  afterEach(async () => {
    await local.engine?.close();
    local.engine = null;
  });

  it("applies the schema twice without harm, and counts an existing non-empty pattern as reviewed", async () => {
    const { AUTH_SCHEMA } = await import("./schema.mjs");
    const { applySchema, getSql } = await import("@/lib/db");
    await applySchema(getSql()!, AUTH_SCHEMA);
    await local.engine!.query(
      `INSERT INTO user_profiles (clerk_env, clerk_user_id, service_availability) VALUES ($1, 'user_set', '{sunday_am}'), ($1, 'user_empty', '{}')`,
      [ENV],
    );
    await local.engine!.query(`UPDATE user_profiles SET availability_reviewed_at = NULL`);
    await applySchema(getSql()!, AUTH_SCHEMA);
    const rows = (await local.engine!.query(`SELECT clerk_user_id, availability_reviewed_at FROM user_profiles ORDER BY 1`)).rows;
    expect(rows.find((row) => row.clerk_user_id === "user_set")?.availability_reviewed_at).not.toBeNull();
    expect(rows.find((row) => row.clerk_user_id === "user_empty")?.availability_reviewed_at).toBeNull();
  });

  it("upgrades a database made with the first three experience levels, carrying answers over", async () => {
    // As the first version of this change created it.
    await local.engine!.query(`CREATE TABLE user_song_leading (
       clerk_env text NOT NULL CHECK (clerk_env IN ('development', 'production')),
       clerk_user_id text NOT NULL,
       experience text CHECK (experience IN ('new', 'some', 'experienced')),
       unfamiliar_hymns text, unaccompanied_leading text,
       updated_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (clerk_env, clerk_user_id))`);
    await local.engine!.query(
      `INSERT INTO user_song_leading (clerk_env, clerk_user_id, experience) VALUES ($1, 'user_a', 'new'), ($1, 'user_b', 'some'), ($1, 'user_c', 'experienced'), ($1, 'user_d', NULL)`,
      [ENV],
    );
    const { AUTH_SCHEMA, AUTH_SCHEMA_READY } = await import("./schema.mjs");
    const { applySchema, getSql } = await import("@/lib/db");
    expect((await local.engine!.query(AUTH_SCHEMA_READY)).rows[0].ready).toBe(false);
    await applySchema(getSql()!, AUTH_SCHEMA);
    expect((await local.engine!.query(AUTH_SCHEMA_READY)).rows[0].ready).toBe(true);
    const rows = (await local.engine!.query(`SELECT clerk_user_id, experience FROM user_song_leading ORDER BY 1`)).rows;
    expect(rows.map((row) => row.experience)).toEqual(["beginner", "low_intermediate", "high_intermediate", null]);
    await expect(local.engine!.query(`UPDATE user_song_leading SET experience = 'new' WHERE clerk_user_id = 'user_a'`)).rejects.toThrow();
    await local.engine!.query(`UPDATE user_song_leading SET experience = 'advanced' WHERE clerk_user_id = 'user_a'`);
    // Applying it again changes nothing.
    await applySchema(getSql()!, AUTH_SCHEMA);
    expect((await local.engine!.query(`SELECT experience FROM user_song_leading WHERE clerk_user_id = 'user_a'`)).rows[0].experience).toBe("advanced");
  });

  it("saves one section without touching another, and never writes normal availability", async () => {
    const store = await import("./store");
    const { setNormalAvailability } = await import("@/lib/availability/store");
    await setNormalAvailability(ENV, "user_mary", ["sunday_pm"], "user_mary");
    await store.updateProfileFields(ENV, "user_mary", { readsSheetMusic: false, voicePart: "alto", theoryLevel: null });
    await store.updateProfileFields(ENV, "user_mary", { preferredName: "Mae", bio: "Hello" });
    const [{ id }] = (await local.engine!.query(`SELECT id FROM instruments WHERE clerk_env = $1 ORDER BY sort_order LIMIT 1`, [ENV])).rows as Array<{ id: number }>;
    await store.updateProfileFields(ENV, "user_mary", { learningStyle: 3 }, [{ instrumentId: id, proficiency: "confident", isPrimary: true }]);

    const profile = await store.getProfile(ENV, "user_mary");
    expect(profile).toMatchObject({ readsSheetMusic: false, voicePart: "alto", preferredName: "Mae", bio: "Hello", learningStyle: 3 });
    expect(profile.serviceAvailability).toEqual(["sunday_pm"]);
    expect(profile.availabilityReviewedAt).not.toBeNull();
    expect(await store.getUserInstruments(ENV, "user_mary")).toMatchObject([{ instrumentId: id, proficiency: "confident", isPrimary: true }]);
  });

  it("records who reviewed availability, and an explicitly empty pattern counts", async () => {
    const { setNormalAvailability } = await import("@/lib/availability/store");
    const store = await import("./store");
    await store.db(ENV);
    await setNormalAvailability(ENV, "user_none", [], "user_director");
    const row = (await local.engine!.query(`SELECT service_availability, availability_reviewed_by FROM user_profiles WHERE clerk_user_id = 'user_none'`)).rows[0];
    expect(row).toMatchObject({ service_availability: [], availability_reviewed_by: "user_director" });
    expect((await store.getProfile(ENV, "user_none")).availabilityReviewedAt).not.toBeNull();
  });

  it("writes the policy once, keeps its date through concurrent activations and every later change", async () => {
    const policies = await import("./requirements-store");
    const [first, second] = await Promise.all([policies.createPolicyOnce(ENV, "user_a"), policies.createPolicyOnce(ENV, "user_b")]);
    expect(second.activatedAt).toBe(first.activatedAt);
    expect(first.snapshot).toBe("pending");
    const paused = await policies.patchPolicy(ENV, { pausedAt: new Date().toISOString(), snapshot: "complete" }, "user_a");
    expect(paused?.activatedAt).toBe(first.activatedAt);
    expect(paused?.snapshot).toBe("complete");
    expect((await policies.patchPolicy(ENV, { pausedAt: null }, "user_a"))?.pausedAt).toBeNull();
    // The other environment has none.
    expect(await policies.getRequirementPolicy("production")).toBeNull();
  });

  it("never moves a recorded deadline, except an administrator's extension", async () => {
    const policies = await import("./requirements-store");
    const due = "2026-11-09T17:00:00.000Z";
    await policies.recordDeadlines(ENV, "user_x", [{ key: "name", firstAppliedAt: "2026-11-02T17:00:00.000Z", dueAt: due }], "snapshot");
    const again = await policies.recordDeadlines(ENV, "user_x", [{ key: "name", firstAppliedAt: "2026-12-01T00:00:00.000Z", dueAt: "2026-12-08T00:00:00.000Z" }], "first_seen");
    expect(again.get("name")).toBe(due);
    await policies.writeSnapshotPage(ENV, [{ userId: "user_x", deadlines: [{ key: "name", firstAppliedAt: due, dueAt: "2030-01-01T00:00:00.000Z" }] }]);
    expect((await policies.listDeadlines(ENV, "user_x"))[0].dueAt).toBe(due);
    expect(await policies.countBaselines(ENV, ["user_x", "user_y"])).toBe(1);
    expect(await policies.extendDeadlines(ENV, "user_x", 7, "user_admin")).toBe(1);
    const extended = await policies.listDeadlines(ENV, "user_x");
    expect(Date.parse(extended[0].dueAt)).toBeGreaterThan(Date.now() + 6 * DAY);
    expect(extended[0].extendedBy).toBe("user_admin");
  });

  it("works a song leader's status through the real tables: grace, blocked, then complete once saved", async () => {
    const policies = await import("./requirements-store");
    const { evaluateProfile } = await import("./requirements");
    const { setNormalAvailability } = await import("@/lib/availability/store");
    const store = await import("./store");
    const policy = await policies.createPolicyOnce(ENV, "user_admin");
    await policies.patchPolicy(ENV, { snapshot: "complete" }, "user_admin");
    const activated = Date.parse(policy.activatedAt);
    const who = {
      roleKeys: ["song_leader"],
      explicit: new Set(["lead_songs", "view_availability"] as const),
      account: { firstName: "John", lastName: "Doe", createdAt: activated - 100 * DAY },
    };

    const early = await evaluateProfile(ENV, "user_john", { ...who, now: activated + DAY });
    expect(early.state).toBe("grace");
    expect(early.dueAt).toBe(new Date(activated + 7 * DAY).toISOString());

    // Looked at late, the deadline is still seven days from activation, and has passed.
    const late = await evaluateProfile(ENV, "user_john", { ...who, now: activated + 20 * DAY });
    expect(late.state).toBe("blocked");
    expect(late.dueAt).toBe(early.dueAt);

    await store.updateProfileFields(ENV, "user_john", { readsSheetMusic: false });
    await policies.saveSongLeading(ENV, "user_john", { experience: "beginner", unfamiliarHymns: "still_learning", unaccompaniedLeading: "with_preparation" });
    await setNormalAvailability(ENV, "user_john", [], "user_john");
    expect((await evaluateProfile(ENV, "user_john", { ...who, now: activated + 20 * DAY })).state).toBe("complete");
  });

  it("gives a member who joined after activation no grace, then seven days for a role gained later", async () => {
    const policies = await import("./requirements-store");
    const { evaluateProfile } = await import("./requirements");
    const policy = await policies.createPolicyOnce(ENV, "user_admin");
    await policies.patchPolicy(ENV, { snapshot: "complete" }, "user_admin");
    const activated = Date.parse(policy.activatedAt);
    const joined = activated + 3 * DAY;
    const account = { firstName: "Ann", lastName: "Lee", createdAt: joined };

    const first = await evaluateProfile(ENV, "user_ann", {
      roleKeys: ["musician"],
      explicit: new Set(["view_availability"] as const),
      account,
      now: joined + 60_000,
    });
    expect(first.state).toBe("blocked");

    const later = joined + 30 * DAY;
    const leader = await evaluateProfile(ENV, "user_ann", {
      roleKeys: ["musician", "song_leader"],
      explicit: new Set(["view_availability", "lead_songs"] as const),
      account,
      now: later,
    });
    const leading = leader.missing.find((item) => item.key === "leading_experience");
    expect(leading?.dueAt).toBe(new Date(later + 7 * DAY).toISOString());
  });

  it("looks without recording when asked (an administrator viewing someone)", async () => {
    const policies = await import("./requirements-store");
    const { evaluateProfile } = await import("./requirements");
    await policies.createPolicyOnce(ENV, "user_admin");
    await evaluateProfile(ENV, "user_quiet", {
      roleKeys: [],
      explicit: new Set(),
      account: { firstName: null, lastName: null, createdAt: 0 },
      record: false,
    });
    expect(await policies.listDeadlines(ENV, "user_quiet")).toEqual([]);
    expect(await policies.countBaselines(ENV, ["user_quiet"])).toBe(0);
  });

  it("forgets everything about a deleted account", async () => {
    const policies = await import("./requirements-store");
    const store = await import("./store");
    await policies.saveSongLeading(ENV, "user_gone", { experience: "low_intermediate", unfamiliarHymns: null, unaccompaniedLeading: null });
    await policies.recordDeadlines(ENV, "user_gone", [{ key: "name", firstAppliedAt: "2026-11-02T00:00:00.000Z", dueAt: "2026-11-09T00:00:00.000Z" }], "first_seen");
    await policies.markOnboardingStep(ENV, "user_gone", "started");
    await store.deleteUserData(ENV, "user_gone");
    for (const table of ["user_song_leading", "profile_requirement_deadlines", "profile_requirement_baselines", "onboarding_progress"]) {
      expect((await local.engine!.query(`SELECT 1 FROM ${table} WHERE clerk_user_id = 'user_gone'`)).rows).toHaveLength(0);
    }
  });
});
