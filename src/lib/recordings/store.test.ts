import { beforeEach, describe, expect, it, vi } from "vitest";

/** Each statement handed to a transaction, in order: [sql, params]. */
type Call = [string, unknown[] | undefined];

const db = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  applySchema: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getSql: () => ({
    // Statements are only recorded until a transaction (or an await) runs them.
    query: (sql: string, params?: unknown[]) => {
      const pending = Promise.resolve().then(() => db.query(sql, params));
      return Object.assign(pending, { sql, params });
    },
    transaction: db.transaction,
  }),
  applySchema: db.applySchema,
}));

beforeEach(() => {
  vi.resetModules();
  db.query.mockReset().mockResolvedValue([]);
  db.transaction.mockReset().mockResolvedValue([]);
  db.applySchema.mockReset().mockResolvedValue(undefined);
});

function transactionCalls(): Call[] {
  const list = db.transaction.mock.calls[0][0] as Array<{ sql: string; params?: unknown[] }>;
  return list.map((item) => [item.sql, item.params]);
}

describe("recordings schema", () => {
  it("holds one primary per song per environment, and never drops anything", async () => {
    const { listRecordings } = await import("./store");
    await listRecordings("development");
    const recordingsSchema = (db.applySchema.mock.calls.at(-1)![1] as string[]).join("\n");
    expect(recordingsSchema).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS song_recordings_one_primary\s+ON song_recordings \(clerk_env, song_id\) WHERE is_primary/);
    expect(recordingsSchema).toContain("REFERENCES song_recordings (id) ON DELETE SET NULL");
    expect(recordingsSchema).toContain("CHECK (provider IN ('youtube'))");
    expect(recordingsSchema).toContain("clerk_env text NOT NULL");
    expect(recordingsSchema).not.toMatch(/\b(DROP|TRUNCATE)\b|DELETE FROM/);
  });

  it("reads public recordings only when asked for public ones", async () => {
    const { listRecordings } = await import("./store");
    await listRecordings("production", { visibility: "public" });
    const [sql, params] = db.query.mock.calls.at(-1)!;
    expect(sql).toContain("clerk_env = $1");
    expect(sql).toContain("visibility = $2");
    expect(params).toEqual(["production", "public", null]);
  });
});

describe("primary recordings", () => {
  it("adding a recording never makes it the primary", async () => {
    db.query.mockResolvedValueOnce([
      { id: "r1", song_id: "S1", provider: "youtube", media_id: "dQw4w9WgXcQ", source_url: "u", title: "t", source_name: null, description: null, arrangement: null, music_key: null, visibility: "public", is_primary: false, updated_at: new Date() },
    ]);
    const { insertRecording } = await import("./store");
    const result = await insertRecording(
      "development",
      { songId: "S1", provider: "youtube", mediaId: "dQw4w9WgXcQ", sourceUrl: "u", title: "t", sourceName: null, description: null, arrangement: null, musicKey: null, visibility: "public" },
      "user_1",
    );
    expect(result).toMatchObject({ ok: true, recording: { isPrimary: false } });
    const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO song_recordings/.test(sql))!;
    expect(insert[0].split("VALUES")[0]).not.toContain("is_primary");
    expect(insert[0]).toContain("ON CONFLICT (clerk_env, song_id, provider, media_id) DO NOTHING");
  });

  it("a duplicate is refused, not added again", async () => {
    const { insertRecording } = await import("./store");
    const result = await insertRecording(
      "development",
      { songId: "S1", provider: "youtube", mediaId: "dQw4w9WgXcQ", sourceUrl: "u", title: "t", sourceName: null, description: null, arrangement: null, musicKey: null, visibility: "public" },
      "user_1",
    );
    expect(result).toEqual({ ok: false, reason: "duplicate" });
  });

  it("clears the old primary before setting the new one, in one transaction, after checking the song", async () => {
    const { setPrimaryRecording } = await import("./store");
    expect(await setPrimaryRecording("development", "S1", "11111111-1111-4111-8111-111111111111", "user_1")).toBe(true);
    const [check, clear, set] = transactionCalls();
    expect(check[0]).toContain("fwm_require");
    expect(check[0]).toContain("song_id = $2");
    expect(clear[0]).toContain("SET is_primary = false");
    expect(set[0]).toContain("SET is_primary = true");
    expect(set[1]).toEqual(["development", "S1", "user_1", "11111111-1111-4111-8111-111111111111"]);
  });

  it("can leave a song with no primary at all", async () => {
    const { setPrimaryRecording } = await import("./store");
    await setPrimaryRecording("development", "S1", null, "user_1");
    const calls = transactionCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toContain("SET is_primary = false");
  });

  it("refuses a recording of another song (or environment) as a conflict", async () => {
    db.transaction.mockRejectedValueOnce(new Error("fwm:conflict"));
    const { setPrimaryRecording } = await import("./store");
    expect(await setPrimaryRecording("development", "S1", "11111111-1111-4111-8111-111111111111", "user_1")).toBe(false);
  });

  it("deleting the primary promotes nothing in its place", async () => {
    const { deleteRecording } = await import("./store");
    await deleteRecording("development", "11111111-1111-4111-8111-111111111111");
    const writes = db.query.mock.calls.filter(([sql]) => /UPDATE song_recordings|DELETE FROM song_recordings/.test(sql));
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain("DELETE FROM song_recordings WHERE clerk_env = $1");
  });
});

describe("recordings chosen for a service", () => {
  const write = { date: "2026-11-08", slot: "AM" as const, placeId: "n1", songId: "S1", recordingId: "11111111-1111-4111-8111-111111111111" };

  it("checks the service's revision and that the recording is the song's, then saves", async () => {
    const { saveSelection } = await import("./store");
    expect(await saveSelection("development", write, 4, "user_1")).toEqual({ ok: true });
    const [guard, owns, upsert] = transactionCalls();
    expect(guard[0]).toContain("revision FROM service_plans");
    expect(guard[1]).toEqual(["development", "2026-11-08", "AM", 4]);
    expect(owns[0]).toContain("song_id = $3");
    expect(owns[1]).toEqual(["development", write.recordingId, "S1"]);
    expect(upsert[0]).toContain("INSERT INTO service_recording_selections");
  });

  it("clearing a choice deletes only that place's row", async () => {
    const { saveSelection } = await import("./store");
    await saveSelection("development", { ...write, recordingId: null }, 4, "user_1");
    const [, remove] = transactionCalls();
    expect(remove[0]).toContain("DELETE FROM service_recording_selections");
    expect(remove[1]).toEqual(["development", "2026-11-08", "AM", "n1"]);
  });

  it("reports someone else's save as a conflict", async () => {
    db.transaction.mockRejectedValueOnce(new Error("fwm:conflict"));
    const { saveSelection } = await import("./store");
    expect(await saveSelection("development", write, 4, "user_1")).toEqual({ ok: false, reason: "conflict" });
  });

  it("public pages read only published services' choices", async () => {
    const { listPublishedSelections } = await import("./store");
    await listPublishedSelections("production", "2026-11-01");
    const [sql] = db.query.mock.calls.at(-1)!;
    expect(sql).toContain("p.status = 'published'");
  });

  it("a planner save drops choices whose place is gone or holds another song", async () => {
    const { pruneSelectionsStatement, recordingsSql } = await import("./store");
    const sql = await recordingsSql();
    const statement = pruneSelectionsStatement(sql, "development", { date: "2026-11-08", slot: "AM" }, [{ placeId: "n1", songId: "S1" }]) as unknown as {
      sql: string;
      params: unknown[];
    };
    expect(statement.sql).toContain("DELETE FROM service_recording_selections");
    expect(statement.sql).toContain("k.song_id = s.song_id");
    expect(statement.params).toEqual(["development", "2026-11-08", "AM", ["n1"], ["S1"]]);
  });
});
