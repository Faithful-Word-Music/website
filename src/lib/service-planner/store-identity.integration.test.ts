import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface SqlEngine {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  transaction<T>(work: (sql: SqlEngine) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const local = vi.hoisted(() => ({ engine: null as SqlEngine | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  // This adapter never reads DATABASE_URL and can only reach this test's
  // explicitly created in-memory PostgreSQL engine.
  getSql: () => ({ query: async (sql: string, params?: unknown[]) => (await local.engine!.query(sql, params)).rows }),
  applySchema: async (_sql: unknown, statements: readonly string[]) => local.engine!.transaction(async (sql) => {
    for (const statement of statements) await sql.query(statement);
  }),
}));

// Optional test-only engine; no application dependency or lockfile change.
// Set SONG_IDENTITY_PGLITE to the file URL of PGlite's dist/index.js, then run
// npm test -- src/lib/service-planner/store-identity.integration.test.ts
const packageUrl = process.env.SONG_IDENTITY_PGLITE;

describe.skipIf(!packageUrl)("catalog migration on isolated PostgreSQL", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { PGlite } = await import(/* @vite-ignore */ packageUrl!) as { PGlite: new () => SqlEngine };
    local.engine = new PGlite();
    await local.engine.query(`CREATE TABLE catalog_songs (
      clerk_env text NOT NULL, title_key text NOT NULL, title text NOT NULL,
      number text, collection text, default_key text, created_by text,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (clerk_env, title_key)
    )`);
    await local.engine.query(`INSERT INTO catalog_songs
      (clerk_env, title_key, title, number, collection, default_key)
      VALUES ('development', 'all hail', 'All Hail', '168', 'SSSH1989', 'Ab'),
             ('production', 'all hail', 'All Hail', '167', 'SSSH1989', 'G'),
             ('production', 'ambiguous', 'All Hail', NULL, NULL, 'D')`);
  }, 20_000);

  afterEach(async () => {
    await local.engine?.close();
    local.engine = null;
  });

  it("copies idempotently under concurrent calls, isolates environments and catches late legacy writes", async () => {
    const { listCatalogSongs, createCatalogSong } = await import("./store");
    const original = (await local.engine!.query("SELECT * FROM catalog_songs ORDER BY clerk_env, title_key")).rows;
    const [first, concurrent] = await Promise.all([listCatalogSongs("development"), listCatalogSongs("development")]);
    expect(first).toEqual(concurrent);
    expect(first).toHaveLength(1);
    const stableId = first[0].songId;
    expect(stableId).toMatch(/^catalog-[0-9a-f-]{36}$/);
    expect((await local.engine!.query("SELECT count(*)::int AS count FROM catalog_songs_v2 WHERE clerk_env = 'production'")).rows)
      .toEqual([{ count: 0 }]);
    const production = await listCatalogSongs("production");
    expect(production).toHaveLength(2);
    expect(production.find((song) => song.number === "167")?.songId).not.toBe(stableId);

    await local.engine!.query(`UPDATE catalog_songs_v2 SET title = 'Corrected display', title_key = 'corrected display'
      WHERE clerk_env = 'development' AND song_id = $1`, [stableId]);
    await local.engine!.query(`INSERT INTO catalog_songs (clerk_env, title_key, title)
      VALUES ('production', 'late song', 'Late Song')`);
    expect((await listCatalogSongs("production"))).toHaveLength(3);
    expect(await listCatalogSongs("development")).toMatchObject([{ songId: stableId, title: "Corrected display" }]);
    expect((await local.engine!.query("SELECT * FROM catalog_songs WHERE title_key <> 'late song' ORDER BY clerk_env, title_key")).rows)
      .toEqual(original);

    const song = { title: "Same Title", number: null, collection: null, defaultKey: "G" };
    const [created, other] = await Promise.all([
      createCatalogSong("development", song, "user"), createCatalogSong("development", song, "user"),
    ]);
    expect(created).not.toBeNull();
    expect(other).not.toBeNull();
    expect(created!.songId).not.toBe(other!.songId);
    expect((await listCatalogSongs("development")).filter((item) => item.title === song.title)).toHaveLength(2);
    expect(await createCatalogSong("development", { ...song, songId: created!.songId }, "user")).toBeNull();
  }, 20_000);

  it("persists only unambiguous legacy associations without changing original records or new UUIDs", async () => {
    const { listCatalogSongs, createCatalogSong, associateCatalogSongs } = await import("./store");
    const entries = [
      { id: "SSSH1989-167", title: "All Hail", number: "167", collection: "SSSH1989" },
      { id: "SSSH1989-168", title: "All Hail", number: "168", collection: "SSSH1989" },
    ];
    const created = await createCatalogSong("production", { title: "All Hail", number: "168", collection: "SSSH1989", defaultKey: "Ab" }, "user");
    const original = (await local.engine!.query("SELECT * FROM catalog_songs ORDER BY clerk_env, title_key")).rows;
    await Promise.all([associateCatalogSongs("production", entries), associateCatalogSongs("production", entries)]);
    const songs = await listCatalogSongs("production");
    expect(songs.find((song) => song.number === "167")).toMatchObject({ songId: "SSSH1989-167", catalogId: expect.stringMatching(/^catalog-/) });
    expect(songs.find((song) => song.number === null)?.songId).toMatch(/^catalog-/);
    expect(songs.find((song) => song.catalogId === created!.catalogId)?.songId).toBe(created!.songId);
    expect((await local.engine!.query("SELECT indexed_song_id FROM catalog_songs_v2 WHERE clerk_env = 'development'")).rows).toEqual([]);

    // An index edit or outage must never replace an established association.
    await associateCatalogSongs("production", [{ ...entries[0], id: "REPLACEMENT-167" }]);
    expect((await listCatalogSongs("production")).find((song) => song.number === "167")?.songId).toBe("SSSH1989-167");
    expect((await local.engine!.query("SELECT * FROM catalog_songs ORDER BY clerk_env, title_key")).rows).toEqual(original);
  }, 20_000);
});
