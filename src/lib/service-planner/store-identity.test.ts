import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ query: vi.fn(), applySchema: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getSql: () => ({ query: db.query }), applySchema: db.applySchema }));

beforeEach(() => {
  vi.resetModules();
  db.query.mockReset().mockResolvedValue([]);
  db.applySchema.mockReset().mockResolvedValue(undefined);
});

describe("catalog identity storage", () => {
  it("creates an additive identity table without altering the legacy title key", async () => {
    const { listCatalogSongs } = await import("./store");
    await listCatalogSongs("development");
    const schema = db.applySchema.mock.calls[0][1] as string[];
    expect(schema.join("\n")).toContain("CREATE TABLE IF NOT EXISTS catalog_songs_v2");
    expect(schema.join("\n")).toContain("PRIMARY KEY (clerk_env, song_id)");
    expect(schema.join("\n")).toContain("UNIQUE (clerk_env, legacy_title_key)");
    expect(schema.join("\n")).not.toMatch(/(?:ALTER|DROP|TRUNCATE) TABLE catalog_songs\b/);
  });

  it("copies each environment once per server instance, not on every read", async () => {
    const { listCatalogSongs } = await import("./store");
    await listCatalogSongs("development");
    await listCatalogSongs("development");
    await listCatalogSongs("production");
    const copies = db.query.mock.calls.filter(([sql]) => /FROM catalog_songs\s/.test(sql));
    expect(copies).toHaveLength(2);
    expect(copies.map(([, params]) => params)).toEqual([["development"], ["production"]]);
    for (const [sql] of copies) {
      expect(sql).toContain("INSERT INTO catalog_songs_v2");
      expect(sql).toContain("WHERE clerk_env = $1");
      expect(sql).toContain("ON CONFLICT (clerk_env, legacy_title_key) DO NOTHING");
      expect(sql).toContain("md5(");
      expect(sql).not.toMatch(/UPDATE|DELETE|schema_fixups/);
    }
  });

  it("shares one atomic copy between concurrent initial reads", async () => {
    const { listCatalogSongs } = await import("./store");
    await Promise.all([listCatalogSongs("production"), listCatalogSongs("production")]);
    const copies = db.query.mock.calls.filter(([sql]) => /FROM catalog_songs\s/.test(sql));
    expect(copies).toHaveLength(1);
    expect(copies[0][0]).toContain("ON CONFLICT (clerk_env, legacy_title_key) DO NOTHING");
    expect(copies[0][0]).toMatch(/md5\([^)]*clerk_env[^)]*title_key/);
  });

  it("tries a failed copy again on the next read, and is only done once it succeeds", async () => {
    let failCopy = true;
    db.query.mockImplementation(async (sql: string) => {
      if (/FROM catalog_songs\s/.test(sql) && failCopy) {
        failCopy = false;
        throw new Error("connection lost");
      }
      return [];
    });
    const { listCatalogSongs } = await import("./store");
    await expect(listCatalogSongs("development")).rejects.toThrow("connection lost");
    await listCatalogSongs("development");
    await listCatalogSongs("development");
    const copies = db.query.mock.calls.filter(([sql]) => /FROM catalog_songs\s/.test(sql));
    expect(copies).toHaveLength(2);
  });

  it("creates two same-title records with different durable UUIDs and retains supplied identities", async () => {
    db.query.mockImplementation(async (sql: string, params: unknown[]) =>
      /RETURNING song_id/.test(sql) ? [{ song_id: params[1] }] : []);
    const { createCatalogSong } = await import("./store");
    const song = { title: "Same title", number: null, collection: null, defaultKey: "G" };
    const first = await createCatalogSong("development", song, "user");
    const second = await createCatalogSong("development", song, "user");
    expect(first).toMatchObject(song);
    expect(first?.songId).toMatch(/^catalog-[0-9a-f-]{36}$/);
    expect(second?.songId).not.toBe(first?.songId);
    const known = await createCatalogSong("development", { ...song, songId: "SSSH1989-168" }, "user");
    expect(known?.songId).toBe("SSSH1989-168");
    const writes = db.query.mock.calls.filter(([sql]) => /RETURNING song_id/.test(sql));
    expect(writes.every(([sql]) => sql.includes("ON CONFLICT (clerk_env, song_id) DO NOTHING"))).toBe(true);
  });

  it("returns persisted IDs unchanged even when a catalog title is corrected", async () => {
    db.query.mockImplementation(async (sql: string) => /SELECT song_id/.test(sql)
      ? [{ song_id: "catalog-stable", title: "Corrected title", number: null, collection: "Psalms", default_key: "D" }]
      : []);
    const { listCatalogSongs } = await import("./store");
    expect(await listCatalogSongs("development")).toEqual([
      { songId: "catalog-stable", catalogId: "catalog-stable", title: "Corrected title", number: null, collection: "Psalms", defaultKey: "D" },
    ]);
  });

  it("persists unique index associations only for migrated legacy rows", async () => {
    const legacy = { song_id: "catalog-old", title: "All Hail", number: "168", collection: "SSSH1989" };
    db.query.mockImplementation(async (sql: string) => /legacy_title_key IS NOT NULL/.test(sql) ? [legacy] : []);
    const { associateCatalogSongs } = await import("./store");
    await associateCatalogSongs("development", [
      { id: "SSSH1989-167", title: "All Hail", number: "167", collection: "SSSH1989" },
      { id: "SSSH1989-168", title: "All Hail", number: "168", collection: "SSSH1989" },
    ]);
    const update = db.query.mock.calls.find(([sql]) => /UPDATE catalog_songs_v2/.test(sql));
    expect(update?.[1]).toEqual(["development", ["catalog-old"], ["SSSH1989-168"]]);
    expect(update?.[0]).toContain("indexed_song_id IS NULL");
    expect(update?.[0]).toContain("clerk_env = $1");
    expect(db.query.mock.calls.some(([sql]) => sql.includes("legacy_title_key IS NOT NULL") && sql.includes("indexed_song_id IS NULL"))).toBe(true);
  });

  it("leaves ambiguous migrated rows and all new catalog UUIDs independent", async () => {
    db.query.mockImplementation(async (sql: string) => /legacy_title_key IS NOT NULL/.test(sql)
      ? [{ song_id: "catalog-old", title: "All Hail", number: null, collection: null }] : []);
    const { associateCatalogSongs } = await import("./store");
    await associateCatalogSongs("production", [
      { id: "SSSH1989-167", title: "All Hail", number: "167", collection: "SSSH1989" },
      { id: "SSSH1989-168", title: "All Hail", number: "168", collection: "SSSH1989" },
    ]);
    expect(db.query.mock.calls.some(([sql]) => /UPDATE catalog_songs_v2/.test(sql))).toBe(false);
    expect(db.query.mock.calls.find(([sql]) => /legacy_title_key IS NOT NULL/.test(sql))?.[1]).toEqual(["production"]);
  });

  it("keeps stored index association and catalog alias when the index is unavailable", async () => {
    db.query.mockImplementation(async (sql: string) => /SELECT song_id/.test(sql) ? [{
      song_id: "catalog-old", indexed_song_id: "SSSH1989-168", title: "All Hail", number: "168", collection: "SSSH1989", default_key: "Ab",
    }] : []);
    const { listCatalogSongs } = await import("./store");
    expect(await listCatalogSongs("development")).toEqual([
      { songId: "SSSH1989-168", catalogId: "catalog-old", title: "All Hail", number: "168", collection: "SSSH1989", defaultKey: "Ab" },
    ]);
    expect(db.query.mock.calls.some(([sql]) => /UPDATE catalog_songs_v2/.test(sql))).toBe(false);
  });
});

describe("planner reference persistence", () => {
  it("reads identity in JSON plan slots without losing legacy slots", async () => {
    const identity = { songId: "SSSH1989-168", collection: "SSSH1989", title: "All Hail", number: "168", key: "Ab" };
    db.query.mockResolvedValue([{
      id: 1, date: "2026-10-18", slot: "AM", kind: "regular", label: null,
      starts_at: "2026-10-18T17:30:00Z", status: "draft", insert_mode: "week",
      slots: JSON.stringify([identity, { title: "Legacy", number: null, key: null }]), revision: 1,
      created_by: null, created_at: "2026-10-16T00:00:00Z", updated_by: null, updated_at: "2026-10-16T00:00:00Z",
      published_by: null, published_at: null, publication_id: null,
    }]);
    const { getPlan } = await import("./store");
    expect((await getPlan("development", "2026-10-18", "AM"))?.slots).toEqual([
      { ...identity, insert: false }, { title: "Legacy", number: null, key: null, insert: true },
    ]);
  });

  it("writes and reads identity for weekly inserts", async () => {
    const reference = { songId: "catalog-insert", collection: "Psalms", title: "A Psalm", number: null, key: "D" };
    const { setWeekInserts, listInsertWeeks } = await import("./store");
    await setWeekInserts("development", "2026-10-18", [reference], "user");
    const write = db.query.mock.calls.find(([sql]) => /WITH wanted/.test(sql));
    expect(JSON.parse(write?.[1][2] as string)[0]).toMatchObject({ song_id: reference.songId, collection: reference.collection });
    db.query.mockResolvedValue([{ week_start: "2026-10-18", insert_index: 1, ...reference, song_id: reference.songId }]);
    expect(await listInsertWeeks("development", "2026-10-18", "2026-10-18")).toEqual([
      { weekStart: "2026-10-18", index: 1, ...reference },
    ]);
  });
});
