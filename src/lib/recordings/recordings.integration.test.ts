import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Recordings' SQL on a real, isolated, in-memory PostgreSQL (PGlite) - the
 * one-primary index, a deleted recording's selections, environment
 * isolation, and the guard on a service saved by someone else. Optional,
 * like the leaders' integration test: set RECORDINGS_PGLITE (or
 * SONG_IDENTITY_PGLITE / LEADERSHIP_PGLITE) to the file URL of PGlite's
 * dist/index.js, then run
 *   npm test -- src/lib/recordings/recordings.integration.test.ts
 */

interface Engine {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  transaction<T>(work: (tx: Engine) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const local = vi.hoisted(() => ({ engine: null as Engine | null }));

vi.mock("server-only", () => ({}));
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

const packageUrl = process.env.RECORDINGS_PGLITE ?? process.env.SONG_IDENTITY_PGLITE ?? process.env.LEADERSHIP_PGLITE;

const base = {
  songId: "S1",
  provider: "youtube" as const,
  sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  title: "Amazing Grace",
  sourceName: "Faithful Word Baptist Church",
  description: null,
  arrangement: null,
  musicKey: null,
  visibility: "public" as const,
};

describe.skipIf(!packageUrl)("recordings on isolated PostgreSQL", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { PGlite } = (await import(/* @vite-ignore */ packageUrl!)) as { PGlite: new () => Engine };
    local.engine = new PGlite();
  }, 30_000);

  afterEach(async () => {
    await local.engine?.close();
    local.engine = null;
  });

  it("keeps one primary per song, set explicitly, and never promotes another on delete", async () => {
    const store = await import("./store");
    const a = await store.insertRecording("development", { ...base, mediaId: "aaaaaaaaaaa" }, "u");
    const b = await store.insertRecording("development", { ...base, mediaId: "bbbbbbbbbbb" }, "u");
    if (!a.ok || !b.ok) throw new Error("not added");
    expect(a.recording.isPrimary).toBe(false);

    expect(await store.setPrimaryRecording("development", "S1", a.recording.id, "u")).toBe(true);
    expect(await store.setPrimaryRecording("development", "S1", b.recording.id, "u")).toBe(true);
    let list = await store.listRecordings("development", { songIds: ["S1"] });
    expect(list.filter((item) => item.isPrimary).map((item) => item.id)).toEqual([b.recording.id]);

    // The index itself refuses a second primary, whatever the code does.
    await expect(local.engine!.query(`UPDATE song_recordings SET is_primary = true WHERE id = $1`, [a.recording.id])).rejects.toThrow();

    await store.deleteRecording("development", b.recording.id);
    list = await store.listRecordings("development", { songIds: ["S1"] });
    expect(list.map((item) => [item.id, item.isPrimary])).toEqual([[a.recording.id, false]]);
  });

  it("refuses a duplicate, and a primary from another song or environment", async () => {
    const store = await import("./store");
    const a = await store.insertRecording("development", { ...base, mediaId: "aaaaaaaaaaa" }, "u");
    expect(await store.insertRecording("development", { ...base, mediaId: "aaaaaaaaaaa" }, "u")).toEqual({ ok: false, reason: "duplicate" });
    if (!a.ok) throw new Error("not added");
    expect(await store.setPrimaryRecording("development", "S2", a.recording.id, "u")).toBe(false);
    expect(await store.setPrimaryRecording("production", "S1", a.recording.id, "u")).toBe(false);
    expect(await store.listRecordings("production")).toEqual([]);
  });

  it("guards a selection by the service's revision, and leaves it pointing at nothing when its recording is deleted", async () => {
    const planner = await import("@/lib/service-planner/store");
    const store = await import("./store");
    const saved = await planner.savePlan(
      "development",
      { date: "2026-11-08", slot: "AM", kind: "regular", label: null, startsAt: "2026-11-08T10:30:00-08:00", insertMode: "week", slots: [{ title: "Amazing Grace", number: "1", key: "G", songId: "S1", insert: false }], places: ["n1"] },
      null,
      "u",
      [],
    );
    if (!saved.ok) throw new Error("not saved");
    const a = await store.insertRecording("development", { ...base, mediaId: "aaaaaaaaaaa" }, "u");
    if (!a.ok) throw new Error("not added");
    const write = { date: "2026-11-08", slot: "AM" as const, placeId: "n1", songId: "S1", recordingId: a.recording.id };

    expect(await store.saveSelection("development", write, saved.plan.revision + 1, "u")).toEqual({ ok: false, reason: "conflict" });
    expect(await store.saveSelection("development", { ...write, songId: "S2" }, saved.plan.revision, "u")).toEqual({ ok: false, reason: "conflict" });
    expect(await store.saveSelection("development", write, saved.plan.revision, "u")).toEqual({ ok: true });

    await store.deleteRecording("development", a.recording.id);
    expect(await store.listSelections("development", { from: "2026-11-01" })).toEqual([{ ...write, recordingId: null }]);
    // Drafts never reach public pages.
    expect(await store.listPublishedSelections("development", "2026-11-01")).toEqual([]);
  });

  it("prunes a selection whose place now holds another song", async () => {
    const store = await import("./store");
    const sql = await store.recordingsSql();
    await local.engine!.query(
      `INSERT INTO service_recording_selections (clerk_env, service_date, slot, place_id, song_id) VALUES
        ('development', '2026-11-08', 'AM', 'n1', 'S1'), ('development', '2026-11-08', 'AM', 'n2', 'S2')`,
    );
    await sql.transaction([store.pruneSelectionsStatement(sql, "development", { date: "2026-11-08", slot: "AM" }, [{ placeId: "n1", songId: "S1" }, { placeId: "n2", songId: "S9" }])]);
    expect((await store.listSelections("development", { from: "2026-11-01" })).map((item) => item.placeId)).toEqual(["n1"]);
  });
});
