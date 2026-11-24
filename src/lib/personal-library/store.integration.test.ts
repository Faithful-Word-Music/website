import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH_SCHEMA } from "@/lib/auth/schema.mjs";

import { eraseAccount, recoverPendingErasures, type ClerkDeletion } from "./erasure";
import { PERSONAL_LIBRARY_SCHEMA, PERSONAL_LIBRARY_SCHEMA_READY } from "./schema.mjs";
import {
  addFavorite,
  beginErasure,
  clearRecent,
  completeErasure,
  createNote,
  deleteNote,
  deletePersonalLibraryData,
  favoriteMembership,
  isFavorite,
  listFavoriteRows,
  listFavorites,
  listPendingErasures,
  listRecent,
  loadNote,
  noteErasureRecovery,
  recordRecent,
  releaseErasureAttempt,
  removeExactFavorite,
  removeFavorite,
  updateNote,
  type LibraryOwner,
  type PersonalLibrarySql,
  type SongNote,
} from "./store";

/**
 * The store on a real, isolated, in-memory PostgreSQL (PGlite). Never reads
 * DATABASE_URL. Set PERSONAL_LIBRARY_PGLITE to the file URL of PGlite's
 * dist/index.js to run it.
 *
 * One engine is shared and emptied between tests, to keep memory low; the
 * install tests make their own and close them. PGlite has a single backend, so
 * "concurrent" here means overlapping requests queued on that backend. It does
 * not reproduce lock contention between separate PostgreSQL connections.
 */

interface Engine {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  transaction<T>(work: (tx: Engine) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const packageUrl = process.env.PERSONAL_LIBRARY_PGLITE ?? process.env.MEMBERSHIP_PGLITE;
const A: LibraryOwner = { env: "development", userId: "user_a" };
const B: LibraryOwner = { env: "development", userId: "user_b" };
const PROD_A: LibraryOwner = { env: "production", userId: "user_a" };
const SONG = "SSSH1989-167";
const ALIAS = "catalog-aaaaaaaa-1111-4222-8333-444455556666";
const IDS = [SONG, ALIAS];
const T0 = Date.parse("2026-06-01T12:00:00.000Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function adapter(engine: Engine): PersonalLibrarySql {
  return {
    query: async (text, params) => (await engine.query(text, params)).rows,
    transaction: (statements) =>
      engine.transaction(async (tx) => {
        const out: Array<Array<Record<string, unknown>>> = [];
        for (const { text, params } of statements) out.push((await tx.query(text, params)).rows);
        return out;
      }),
  };
}

const newEngine = async () => {
  const { PGlite } = (await import(/* @vite-ignore */ packageUrl!)) as { PGlite: new () => Engine };
  return new PGlite();
};

describe.skipIf(!packageUrl)("Personal Library on isolated PostgreSQL", () => {
  let engine: Engine;
  let sql: PersonalLibrarySql;

  const count = async (table: string, owner: LibraryOwner = A) =>
    (await engine.query(`SELECT count(*)::int AS n FROM ${table} WHERE clerk_env = $1 AND clerk_user_id = $2`, [owner.env, owner.userId])).rows[0].n;
  const marker = async (owner: LibraryOwner = A) =>
    (await engine.query(`SELECT state, open_attempts FROM personal_library_erasures WHERE clerk_env = $1 AND clerk_user_id = $2`, [owner.env, owner.userId])).rows[0];
  const create = (
    owner: LibraryOwner = A,
    content = "first",
    mutationId: string = randomUUID(),
    storedIds = IDS,
    songId = SONG,
    afterDeletedNoteId: string | null = null,
  ) => createNote(sql, owner, { songId, storedIds, content, mutationId, noteId: randomUUID(), afterDeletedNoteId });
  const created = async (owner: LibraryOwner = A, content = "first", afterDeletedNoteId: string | null = null): Promise<SongNote> => {
    const result = await create(owner, content, randomUUID(), IDS, SONG, afterDeletedNoteId);
    if (result.status !== "created") throw new Error(result.status);
    return result.note;
  };
  const view = (owner: LibraryOwner, key: string, at: number, kind: "song" | "sheet_file" = "song") =>
    recordRecent(sql, owner, { kind, key, at: new Date(at) });

  beforeAll(async () => {
    engine = await newEngine();
    for (const statement of PERSONAL_LIBRARY_SCHEMA) await engine.query(statement);
    sql = adapter(engine);
  }, 60_000);

  afterAll(async () => {
    await engine?.close();
  });

  beforeEach(async () => {
    await engine.query(`TRUNCATE user_song_favorites, user_library_recent, user_song_notes, personal_library_erasures`);
  });

  describe("schema", () => {
    it("reports not ready, installs, and repeats harmlessly with data in place", async () => {
      const own = await newEngine();
      try {
        expect((await own.query(PERSONAL_LIBRARY_SCHEMA_READY)).rows[0].ready).toBe(false);
        for (const statement of PERSONAL_LIBRARY_SCHEMA) await own.query(statement);
        await own.query(`INSERT INTO user_song_favorites (clerk_env, clerk_user_id, song_id) VALUES ('development', 'u', 's')`);
        for (const statement of PERSONAL_LIBRARY_SCHEMA) await own.query(statement);
        expect((await own.query(PERSONAL_LIBRARY_SCHEMA_READY)).rows[0].ready).toBe(true);
        expect((await own.query(`SELECT count(*)::int AS n FROM user_song_favorites`)).rows[0].n).toBe(1);
      } finally {
        await own.close();
      }
    }, 60_000);

    it("recovers from an install interrupted partway, and leaves the account tables alone", async () => {
      const own = await newEngine();
      try {
        for (const statement of AUTH_SCHEMA) await own.query(statement);
        const tables = async () => (await own.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`)).rows[0].n as number;
        const before = await tables();
        for (const statement of PERSONAL_LIBRARY_SCHEMA.slice(0, 3)) await own.query(statement);
        expect((await own.query(PERSONAL_LIBRARY_SCHEMA_READY)).rows[0].ready).toBe(false);
        for (const statement of PERSONAL_LIBRARY_SCHEMA) await own.query(statement);
        expect((await own.query(PERSONAL_LIBRARY_SCHEMA_READY)).rows[0].ready).toBe(true);
        expect(await tables()).toBe(before + 4);
      } finally {
        await own.close();
      }
    }, 60_000);

    it("enforces its constraints in the database", async () => {
      const insert = (columns: string, values: string) => engine.query(`INSERT INTO ${columns} VALUES ${values}`);
      await expect(insert(`user_song_favorites (clerk_env, clerk_user_id, song_id)`, `('staging', 'u', 's')`)).rejects.toThrow();
      await expect(insert(`user_song_favorites (clerk_env, clerk_user_id, song_id)`, `('development', 'u', '')`)).rejects.toThrow();
      await expect(insert(`user_library_recent (clerk_env, clerk_user_id, resource_kind, resource_key, first_viewed_at, last_viewed_at)`, `('development', 'u', 'playlist', 'k', now(), now())`)).rejects.toThrow();
      await expect(insert(`user_library_recent (clerk_env, clerk_user_id, resource_kind, resource_key, first_viewed_at, last_viewed_at)`, `('development', 'u', 'song', 'k', now(), now() - interval '1 day')`)).rejects.toThrow();
      await expect(engine.query(
        `INSERT INTO user_song_notes (clerk_env, clerk_user_id, song_id, content, note_id, last_mutation_id) VALUES ('development', 'u', 's', repeat('a', 20001), $1, $2)`,
        [randomUUID(), randomUUID()],
      )).rejects.toThrow();
      await expect(insert(`personal_library_erasures (clerk_env, clerk_user_id, state)`, `('development', 'u', 'complete')`)).rejects.toThrow();
    });

    it("has no foreign keys", async () => {
      const { rows } = await engine.query(`SELECT count(*)::int AS n FROM pg_constraint WHERE contype = 'f'`);
      expect(rows[0].n).toBe(0);
    });
  });

  describe("favorites", () => {
    it("adds and removes idempotently", async () => {
      expect(await addFavorite(sql, A, { songId: SONG, storedIds: IDS })).toBe("added");
      expect(await addFavorite(sql, A, { songId: SONG, storedIds: IDS })).toBe("already");
      expect(await count("user_song_favorites")).toBe(1);
      expect(await isFavorite(sql, A, IDS)).toBe(true);
      expect(await removeFavorite(sql, A, IDS)).toBe("removed");
      expect(await removeFavorite(sql, A, IDS)).toBe("absent");
      expect(await isFavorite(sql, A, IDS)).toBe(false);
    });

    it("adds once under overlapping requests", async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => addFavorite(sql, A, { songId: SONG, storedIds: IDS })));
      expect(results.filter((result) => result === "added")).toHaveLength(1);
      expect(await count("user_song_favorites")).toBe(1);
    });

    it("treats a favorite under an old alias as the same song, and removes it", async () => {
      await addFavorite(sql, A, { songId: ALIAS, storedIds: [ALIAS] });
      expect(await addFavorite(sql, A, { songId: SONG, storedIds: IDS })).toBe("already");
      expect((await listFavorites(sql, A)).items.map((item) => item.songId)).toEqual([ALIAS]);
      expect(await removeFavorite(sql, A, IDS)).toBe("removed");
    });

    it("keeps a favorite whose song has left the directory", async () => {
      await addFavorite(sql, A, { songId: "GONE-1", storedIds: ["GONE-1"] });
      expect((await listFavorites(sql, A)).items).toHaveLength(1);
    });

    it("pages a large collection with ties, without repeats or gaps", async () => {
      await engine.query(
        `INSERT INTO user_song_favorites (clerk_env, clerk_user_id, song_id, created_at)
         SELECT 'development', 'user_a', 'S-' || lpad(i::text, 4, '0'),
                '2026-01-01T00:00:00.123456Z'::timestamptz + ((i / 100) || ' seconds')::interval
           FROM generate_series(1, 1200) AS i`,
      );
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page: Awaited<ReturnType<typeof listFavorites>> = await listFavorites(sql, A, { limit: 97, cursor });
        seen.push(...page.items.map((item) => item.songId));
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen).toHaveLength(1200);
      expect(new Set(seen).size).toBe(1200);
    });

    it("rejects a malformed cursor", async () => {
      await expect(listFavorites(sql, A, { cursor: "nonsense" })).rejects.toThrow();
    });

    describe("case variants", () => {
      const stored = async () =>
        (await engine.query(`SELECT song_id FROM user_song_favorites WHERE clerk_user_id = 'user_a' ORDER BY song_id`)).rows.map((row) => row.song_id);
      const seed = (id: string) =>
        engine.query(`INSERT INTO user_song_favorites (clerk_env, clerk_user_id, song_id) VALUES ('development', 'user_a', $1)`, [id]);

      it("cannot create a duplicate through a case variant", async () => {
        await seed("bth-001");
        expect(await addFavorite(sql, A, { songId: "BTH-001", storedIds: ["BTH-001"] })).toBe("already");
        expect(await stored()).toEqual(["bth-001"]);
      });

      it("finds and removes a row stored in another case", async () => {
        await seed("bth-001");
        expect(await isFavorite(sql, A, ["BTH-001"])).toBe(true);
        expect(await favoriteMembership(sql, A, ["bth-001"])).toEqual({ blocked: false, present: new Set(["bth-001"]) });
        expect(await removeFavorite(sql, A, ["BTH-001"])).toBe("removed");
        expect(await stored()).toEqual([]);
      });

      it("agrees with the resolver's fold, leaving non-ASCII lookalikes alone", async () => {
        await seed("K-1");
        await seed("É-1");
        expect(await removeFavorite(sql, A, ["K-1", "é-1"])).toBe("absent");
        expect(await stored()).toHaveLength(2);
      });

      it("removes an exact stored key only, never its case variants or aliases", async () => {
        await seed("GONE-1");
        await seed("gone-1");
        expect(await removeExactFavorite(sql, A, "Gone-1")).toBe("absent");
        expect(await removeExactFavorite(sql, A, "GONE-1")).toBe("removed");
        expect(await removeExactFavorite(sql, A, "GONE-1")).toBe("absent");
        expect(await stored()).toEqual(["gone-1"]);
      });

      it("removes an exact key for its owner only", async () => {
        await seed("GONE-1");
        expect(await removeExactFavorite(sql, B, "GONE-1")).toBe("absent");
        expect(await removeExactFavorite(sql, PROD_A, "GONE-1")).toBe("absent");
        expect(await stored()).toEqual(["GONE-1"]);
      });
    });

    it("answers membership in one query, for this owner only", async () => {
      await addFavorite(sql, A, { songId: SONG, storedIds: IDS });
      expect(await favoriteMembership(sql, B, [SONG.toLowerCase()])).toEqual({ blocked: false, present: new Set() });
      expect(await favoriteMembership(sql, A, [SONG.toLowerCase(), "other"])).toEqual({ blocked: false, present: new Set([SONG.toLowerCase()]) });
      expect(await favoriteMembership(sql, A, [])).toEqual({ blocked: false, present: new Set() });
    });

    it("lists every row with microsecond timestamps, and an empty collection", async () => {
      expect(await listFavoriteRows(sql, A)).toEqual({ blocked: false, rows: [] });
      await engine.query(`INSERT INTO user_song_favorites (clerk_env, clerk_user_id, song_id, created_at)
        VALUES ('development', 'user_a', 'S-1', '2026-01-01T00:00:00.123456Z')`);
      expect(await listFavoriteRows(sql, A)).toEqual({ blocked: false, rows: [{ songId: "S-1", createdAt: "2026-01-01T00:00:00.123456Z" }] });
    });

    it("isolates owners and environments", async () => {
      await addFavorite(sql, A, { songId: SONG, storedIds: IDS });
      expect(await isFavorite(sql, B, IDS)).toBe(false);
      expect(await isFavorite(sql, PROD_A, IDS)).toBe(false);
      expect(await removeFavorite(sql, B, IDS)).toBe("absent");
      expect(await isFavorite(sql, A, IDS)).toBe(true);
    });
  });

  describe("recently viewed", () => {
    it("supports songs and sheet files, newest first", async () => {
      const file = `sf1_${"b".repeat(64)}`;
      await view(A, SONG, T0);
      await view(A, file, T0 + MINUTE, "sheet_file");
      expect((await listRecent(sql, A, { at: new Date(T0 + 2 * MINUTE) })).map((row) => row.kind)).toEqual(["sheet_file", "song"]);
    });

    it("refuses an unsupported resource", async () => {
      await expect(recordRecent(sql, A, { kind: "playlist" as "song", key: "x" })).rejects.toThrow();
      await expect(recordRecent(sql, A, { kind: "sheet_file", key: "raw-drive-id" })).rejects.toThrow();
    });

    it("deduplicates under five minutes, and counts exactly five as new", async () => {
      expect(await view(A, SONG, T0)).toBe("recorded");
      expect(await view(A, SONG, T0 + 5 * MINUTE - 1)).toBe("deduplicated");
      expect((await listRecent(sql, A, { at: new Date(T0 + MINUTE) }))[0].lastViewedAt).toContain("12:00:00.000000");
      expect(await view(A, SONG, T0 + 5 * MINUTE)).toBe("recorded");
      const [row] = await listRecent(sql, A, { at: new Date(T0 + 6 * MINUTE) });
      expect(row.firstViewedAt).toContain("12:00:00");
      expect(row.lastViewedAt).toContain("12:05:00");
    });

    it("orders matching timestamps deterministically", async () => {
      for (const key of ["C-1", "A-1", "B-1"]) await view(A, key, T0);
      expect((await listRecent(sql, A, { at: new Date(T0 + 1) })).map((row) => row.key)).toEqual(["A-1", "B-1", "C-1"]);
    });

    it("hides entries at ninety days and removes them on the next write", async () => {
      await view(A, "OLD-1", T0);
      const edge = new Date(T0 + 90 * DAY);
      expect(await listRecent(sql, A, { at: new Date(edge.getTime() - 1) })).toHaveLength(1);
      expect(await listRecent(sql, A, { at: edge })).toHaveLength(0);
      expect(await count("user_library_recent")).toBe(1);
      await view(A, "NEW-1", edge.getTime());
      expect(await count("user_library_recent")).toBe(1);
    });

    it("starts a fresh history for a resource viewed again after expiry", async () => {
      await view(A, SONG, T0);
      await view(A, SONG, T0 + 91 * DAY);
      const [row] = await listRecent(sql, A, { at: new Date(T0 + 91 * DAY + 1) });
      expect(row.firstViewedAt).toBe(row.lastViewedAt);
    });

    it("keeps at most 100 across kinds, dropping the oldest", async () => {
      for (let i = 0; i < 105; i += 1) await view(A, `S-${i}`, T0 + i * 1000);
      await view(A, `sf1_${"c".repeat(64)}`, T0 + 200_000, "sheet_file");
      expect(await count("user_library_recent")).toBe(100);
      const rows = await listRecent(sql, A, { at: new Date(T0 + 300_000) });
      expect(rows).toHaveLength(100);
      expect(rows[0].kind).toBe("sheet_file");
      expect(rows.some((row) => row.key === "S-5")).toBe(false);
    }, 60_000);

    it("holds the limit under overlapping inserts", async () => {
      await Promise.all(Array.from({ length: 130 }, (_, i) => view(A, `S-${i}`, T0 + i)));
      expect(await count("user_library_recent")).toBe(100);
    }, 60_000);

    it("clears only the owner's history", async () => {
      await view(A, SONG, T0);
      await view(B, SONG, T0);
      await view(PROD_A, SONG, T0);
      expect(await clearRecent(sql, A)).toBe(1);
      expect(await count("user_library_recent", B)).toBe(1);
      expect(await count("user_library_recent", PROD_A)).toBe(1);
    });
  });

  describe("song notes", () => {
    it("creates, reads, updates and deletes", async () => {
      const note = await created();
      expect(note.revision).toBe(1);
      expect(await loadNote(sql, A, IDS)).toMatchObject({ status: "ok", note: { content: "first" } });
      const updated = await updateNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 1, content: "second", mutationId: randomUUID() });
      expect(updated).toMatchObject({ status: "updated", note: { revision: 2, content: "second" } });
      expect(await deleteNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 2 })).toEqual({ status: "deleted" });
      expect(await loadNote(sql, A, IDS)).toEqual({ status: "none", deletedNoteId: note.noteId });
    });

    it("keeps blank content as a note, not a deletion", async () => {
      const note = await created(A, "text");
      await updateNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 1, content: "", mutationId: randomUUID() });
      expect(await loadNote(sql, A, IDS)).toMatchObject({ status: "ok", note: { content: "", revision: 2 } });
    });

    it("stores exactly the maximum and refuses one more", async () => {
      expect((await create(A, "a".repeat(20_000))).status).toBe("created");
      await expect(create(B, "a".repeat(20_001))).rejects.toThrow();
    });

    it("creates once under overlapping requests, and never overwrites", async () => {
      const results = await Promise.all(["a", "b", "c", "d"].map((text) => create(A, text)));
      expect(results.filter((result) => result.status === "created")).toHaveLength(1);
      expect(results.filter((result) => result.status === "conflict")).toHaveLength(3);
      expect(await count("user_song_notes")).toBe(1);
    });

    it("rejects a stale update without changing the note", async () => {
      const note = await created();
      await updateNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 1, content: "newer", mutationId: randomUUID() });
      const stale = await updateNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 1, content: "stale", mutationId: randomUUID() });
      expect(stale).toMatchObject({ status: "conflict", notes: [{ content: "newer", revision: 2 }] });
    });

    it("lets only one of two overlapping updates win", async () => {
      const note = await created();
      const results = await Promise.all(["x", "y"].map((content) =>
        updateNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 1, content, mutationId: randomUUID() })));
      expect(results.map((result) => result.status).sort()).toEqual(["conflict", "updated"]);
    });

    it("rejects a stale delete", async () => {
      const note = await created();
      await updateNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 1, content: "newer", mutationId: randomUUID() });
      expect((await deleteNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 1 })).status).toBe("conflict");
      expect(await count("user_song_notes")).toBe(1);
    });

    it("protects a recreated note at the same revision from old requests (ABA)", async () => {
      const old = await created(A, "old");
      await deleteNote(sql, A, { storedIds: IDS, noteId: old.noteId, expectedRevision: 1 });
      const fresh = await created(A, "fresh", old.noteId);
      expect(fresh.revision).toBe(old.revision);
      expect((await updateNote(sql, A, { storedIds: IDS, noteId: old.noteId, expectedRevision: 1, content: "stale", mutationId: randomUUID() })).status).toBe("conflict");
      expect((await deleteNote(sql, A, { storedIds: IDS, noteId: old.noteId, expectedRevision: 1 })).status).toBe("conflict");
      expect(await loadNote(sql, A, IDS)).toMatchObject({ note: { content: "fresh", noteId: fresh.noteId } });
    });

    describe("retries after an uncertain outcome", () => {
      it("replays a create that did land", async () => {
        const mutationId = randomUUID();
        const first = await create(A, "text", mutationId);
        const retry = await create(A, "text", mutationId);
        expect(retry.status).toBe("replayed");
        if (first.status === "created" && retry.status === "replayed") expect(retry.note.noteId).toBe(first.note.noteId);
        expect(await count("user_song_notes")).toBe(1);
      });

      it("creates when the first attempt never landed", async () => {
        const mutationId = randomUUID();
        expect((await create(A, "text", mutationId)).status).toBe("created");
      });

      it("returns conflict for a create retried after a newer update", async () => {
        const mutationId = randomUUID();
        const first = await create(A, "text", mutationId);
        if (first.status !== "created") throw new Error("setup");
        await updateNote(sql, A, { storedIds: IDS, noteId: first.note.noteId, expectedRevision: 1, content: "newer", mutationId: randomUUID() });
        expect(await create(A, "text", mutationId)).toMatchObject({ status: "conflict", notes: [{ content: "newer" }] });
      });

      it("replays an update that did land, without another revision", async () => {
        const note = await created();
        const input = { storedIds: IDS, noteId: note.noteId, expectedRevision: 1, content: "second", mutationId: randomUUID() };
        await updateNote(sql, A, input);
        expect(await updateNote(sql, A, input)).toMatchObject({ status: "replayed", note: { revision: 2 } });
      });

      it("never lets an old update overwrite a newer one", async () => {
        const note = await created();
        const old = { storedIds: IDS, noteId: note.noteId, expectedRevision: 1, content: "second", mutationId: randomUUID() };
        await updateNote(sql, A, old);
        await updateNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 2, content: "third", mutationId: randomUUID() });
        expect(await updateNote(sql, A, old)).toMatchObject({ status: "conflict", notes: [{ content: "third", revision: 3 }] });
        expect(await loadNote(sql, A, IDS)).toMatchObject({ note: { content: "third", revision: 3 } });
      });

      it("refuses a mutation ID reused for different content", async () => {
        const note = await created();
        const mutationId = randomUUID();
        await updateNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 1, content: "second", mutationId });
        const reused = await updateNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 2, content: "other", mutationId });
        expect(reused.status).toBe("conflict");
        expect(await loadNote(sql, A, IDS)).toMatchObject({ note: { content: "second", revision: 2 } });
      });

      it("reports a retried update of a deleted note as not found", async () => {
        const note = await created();
        const input = { storedIds: IDS, noteId: note.noteId, expectedRevision: 1, content: "second", mutationId: randomUUID() };
        await deleteNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 1 });
        expect((await updateNote(sql, A, input)).status).toBe("not-found");
        expect((await loadNote(sql, A, IDS)).status).toBe("none");
      });

      it("answers a repeated delete as already absent", async () => {
        const note = await created();
        const input = { storedIds: IDS, noteId: note.noteId, expectedRevision: 1 };
        await deleteNote(sql, A, input);
        expect(await deleteNote(sql, A, input)).toEqual({ status: "already-absent" });
      });

      it("does not let a retried delete remove a recreated note", async () => {
        const note = await created(A, "old");
        const input = { storedIds: IDS, noteId: note.noteId, expectedRevision: 1 };
        await deleteNote(sql, A, input);
        await created(A, "recreated", note.noteId);
        expect((await deleteNote(sql, A, input)).status).toBe("conflict");
        expect(await loadNote(sql, A, IDS)).toMatchObject({ note: { content: "recreated" } });
      });

      it("does not resurrect a deleted note when its original create is retried", async () => {
        const mutationId = randomUUID();
        const first = await create(A, "text", mutationId);
        if (first.status !== "created") throw new Error("setup");
        // The client never received that response. The note is then deleted.
        await deleteNote(sql, A, { storedIds: IDS, noteId: first.note.noteId, expectedRevision: 1 });
        const retry = await create(A, "text", mutationId);
        expect(retry.status).not.toBe("created");
        expect((await loadNote(sql, A, IDS)).status).toBe("none");
      });
    });

    describe("deletion tombstones", () => {
      const remove = (note: SongNote) => deleteNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: note.revision });
      const rawRows = async () =>
        (await engine.query(`SELECT row_to_json(n)::text AS raw, content, deleted_at FROM user_song_notes n WHERE clerk_user_id = 'user_a'`)).rows;

      it("reports a retried create as deleted-since and writes nothing", async () => {
        const mutationId = randomUUID();
        const first = await create(A, "secret text", mutationId);
        if (first.status !== "created") throw new Error("setup");
        await remove(first.note);
        expect(await create(A, "secret text", mutationId)).toEqual({ status: "deleted-since", deletedNoteId: first.note.noteId });
        const [row] = await rawRows();
        expect(row.content).toBe("");
        expect(row.deleted_at).not.toBeNull();
      });

      it("allows a genuinely new create that names the deleted note", async () => {
        const old = await created(A, "old");
        await remove(old);
        const loaded = await loadNote(sql, A, IDS);
        if (loaded.status !== "none" || !loaded.deletedNoteId) throw new Error("setup");
        const fresh = await created(A, "new", loaded.deletedNoteId);
        expect(fresh).toMatchObject({ content: "new", revision: 1 });
        expect(fresh.noteId).not.toBe(old.noteId);
        expect(await loadNote(sql, A, IDS)).toMatchObject({ status: "ok", note: { content: "new" } });
      });

      it("replays a new-generation create that landed, and refuses it once that note is deleted", async () => {
        const old = await created(A, "old");
        await remove(old);
        const mutationId = randomUUID();
        const second = await create(A, "second", mutationId, IDS, SONG, old.noteId);
        if (second.status !== "created") throw new Error("setup");
        expect((await create(A, "second", mutationId, IDS, SONG, old.noteId)).status).toBe("replayed");
        await remove(second.note);
        expect(await create(A, "second", mutationId, IDS, SONG, old.noteId)).toEqual({
          status: "deleted-since",
          deletedNoteId: second.note.noteId,
        });
        expect((await loadNote(sql, A, IDS)).status).toBe("none");
      });

      it("refuses a create naming an older generation, or a deletion that never happened", async () => {
        const first = await created(A, "one");
        await remove(first);
        const second = await created(A, "two", first.noteId);
        await remove(second);
        expect((await create(A, "stale", randomUUID(), IDS, SONG, first.noteId)).status).toBe("deleted-since");
        expect((await create(B, "invented", randomUUID(), IDS, SONG, first.noteId)).status).toBe("deleted-since");
        expect(await count("user_song_notes", B)).toBe(0);
      });

      it("keeps stale create, update and delete away from a newer generation", async () => {
        const createId = randomUUID();
        const firstResult = await create(A, "one", createId);
        if (firstResult.status !== "created") throw new Error("setup");
        const first = firstResult.note;
        await remove(first);
        const second = await created(A, "two", first.noteId);
        expect((await create(A, "one", createId)).status).toBe("conflict");
        expect((await updateNote(sql, A, { storedIds: IDS, noteId: first.noteId, expectedRevision: 1, content: "x", mutationId: randomUUID() })).status).toBe("conflict");
        expect((await deleteNote(sql, A, { storedIds: IDS, noteId: first.noteId, expectedRevision: 1 })).status).toBe("conflict");
        expect(await loadNote(sql, A, IDS)).toMatchObject({ status: "ok", note: { noteId: second.noteId, content: "two", revision: 1 } });
      });

      it("lets one of several overlapping creates replace a tombstone", async () => {
        const old = await created(A, "old");
        await remove(old);
        const results = await Promise.all(["a", "b", "c"].map((text) => create(A, text, randomUUID(), IDS, SONG, old.noteId)));
        expect(results.filter((result) => result.status === "created")).toHaveLength(1);
        expect(results.filter((result) => result.status === "conflict")).toHaveLength(2);
        expect(await count("user_song_notes")).toBe(1);
      });

      it("reconciles an uncertain delete whether or not it landed", async () => {
        const landed = await created(A, "text");
        await remove(landed);
        expect(await remove(landed)).toEqual({ status: "already-absent" });
        const loaded = await loadNote(sql, A, IDS);
        expect(loaded).toEqual({ status: "none", deletedNoteId: landed.noteId });

        const live = await created(A, "again", landed.noteId);
        expect(await remove(live)).toEqual({ status: "deleted" });
      });

      it("does not update or revive a tombstone through an old update", async () => {
        const note = await created(A, "text");
        await remove(note);
        const result = await updateNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 1, content: "revived", mutationId: randomUUID() });
        expect(result.status).toBe("not-found");
        expect((await rawRows())[0].content).toBe("");
      });

      it("removes the note's text from its row", async () => {
        const note = await created(A, "very private words");
        await remove(note);
        const [row] = await rawRows();
        expect(row.raw).not.toContain("very private words");
      });

      it("will not store text in a tombstone", async () => {
        const note = await created(A, "text");
        await remove(note);
        await expect(engine.query(`UPDATE user_song_notes SET content = 'x' WHERE clerk_user_id = 'user_a'`)).rejects.toThrow();
      });

      it("honours a tombstone stored under an alias", async () => {
        const result = await create(A, "alias text", randomUUID(), [ALIAS], ALIAS);
        if (result.status !== "created") throw new Error("setup");
        await deleteNote(sql, A, { storedIds: IDS, noteId: result.note.noteId, expectedRevision: 1 });
        expect((await create(A, "retry")).status).toBe("deleted-since");
        const fresh = await created(A, "fresh", result.note.noteId);
        expect(fresh.songId).toBe(ALIAS);
        expect(await count("user_song_notes")).toBe(1);
      });

      it("hides tombstones from a conflict, leaving only live notes", async () => {
        const a = await create(A, "catalog", randomUUID(), [ALIAS], ALIAS);
        const b = await create(A, "index", randomUUID(), [SONG], SONG);
        if (a.status !== "created" || b.status !== "created") throw new Error("setup");
        await deleteNote(sql, A, { storedIds: IDS, noteId: a.note.noteId, expectedRevision: 1 });
        expect(await loadNote(sql, A, IDS)).toMatchObject({ status: "ok", note: { content: "index" } });
      });

      it("adds tombstones to a notes table installed before them, keeping its notes", async () => {
        const own = await newEngine();
        try {
          const older = PERSONAL_LIBRARY_SCHEMA.map((statement) => statement.replace(/\s*deleted_at\s+timestamptz,/, ""))
            .filter((statement) => !statement.includes("ADD COLUMN IF NOT EXISTS deleted_at") && !statement.includes("user_song_notes_tombstone_empty"));
          for (const statement of older) await own.query(statement);
          await own.query(
            `INSERT INTO user_song_notes (clerk_env, clerk_user_id, song_id, content, note_id, last_mutation_id) VALUES ('development', 'u', 's', 'kept', $1, $2)`,
            [randomUUID(), randomUUID()],
          );
          expect((await own.query(PERSONAL_LIBRARY_SCHEMA_READY)).rows[0].ready).toBe(false);
          for (const statement of PERSONAL_LIBRARY_SCHEMA) await own.query(statement);
          expect((await own.query(PERSONAL_LIBRARY_SCHEMA_READY)).rows[0].ready).toBe(true);
          expect((await own.query(`SELECT content, deleted_at FROM user_song_notes`)).rows).toEqual([{ content: "kept", deleted_at: null }]);
        } finally {
          await own.close();
        }
      }, 60_000);
    });

    describe("identity", () => {
      it("finds a note stored under an alias and refuses a second one", async () => {
        await create(A, "under alias", randomUUID(), [ALIAS], ALIAS);
        expect(await loadNote(sql, A, IDS)).toMatchObject({ status: "ok", note: { songId: ALIAS } });
        expect((await create(A, "second")).status).toBe("conflict");
      });

      it("keeps both texts when a later merge makes two notes one song", async () => {
        const a = await create(A, "catalog text", randomUUID(), [ALIAS], ALIAS);
        const b = await create(A, "index text", randomUUID(), [SONG], SONG);
        expect([a.status, b.status]).toEqual(["created", "created"]);
        const merged = await loadNote(sql, A, IDS);
        expect(merged.status).toBe("conflict");
        if (merged.status === "conflict") {
          expect(merged.notes.map((note) => note.content).sort()).toEqual(["catalog text", "index text"]);
          const [first, second] = merged.notes;
          await updateNote(sql, A, { storedIds: IDS, noteId: first.noteId, expectedRevision: 1, content: "edited", mutationId: randomUUID() });
          const after = await loadNote(sql, A, IDS);
          if (after.status !== "conflict") throw new Error("both must remain");
          expect(after.notes.find((note) => note.noteId === second.noteId)?.content).toBe(second.content);
        }
      });

      it("keeps a note whose song is missing, under its stored key", async () => {
        await create(A, "kept", randomUUID(), ["GONE-1"], "GONE-1");
        expect(await loadNote(sql, A, ["GONE-1"])).toMatchObject({ status: "ok", note: { content: "kept" } });
      });
    });

    it("isolates other accounts, including an administrator's, and environments", async () => {
      const note = await created(A, "private");
      const admin: LibraryOwner = { env: "development", userId: "user_admin" };
      expect(await loadNote(sql, admin, IDS)).toEqual({ status: "none" });
      expect(await loadNote(sql, PROD_A, IDS)).toEqual({ status: "none" });
      expect((await updateNote(sql, admin, { storedIds: IDS, noteId: note.noteId, expectedRevision: 1, content: "x", mutationId: randomUUID() })).status).toBe("not-found");
      expect((await deleteNote(sql, admin, { storedIds: IDS, noteId: note.noteId, expectedRevision: 1 })).status).toBe("already-absent");
      expect(await loadNote(sql, A, IDS)).toMatchObject({ note: { content: "private", revision: 1 } });
    });
  });

  describe("account erasure", () => {
    const fill = async (owner: LibraryOwner) => {
      await addFavorite(sql, owner, { songId: SONG, storedIds: IDS });
      await view(owner, SONG, Date.now());
      await create(owner, "note");
    };
    const totals = async (owner: LibraryOwner) =>
      [await count("user_song_favorites", owner), await count("user_library_recent", owner), await count("user_song_notes", owner)];

    it("refuses every kind of write once the marker is down", async () => {
      await beginErasure(sql, A, randomUUID());
      expect(await addFavorite(sql, A, { songId: SONG, storedIds: IDS })).toBe("account-erasing");
      expect(await view(A, SONG, T0)).toBe("account-erasing");
      expect((await create(A)).status).toBe("account-erasing");
      expect(await totals(A)).toEqual([0, 0, 0]);
    });

    describe.each(["pending", "complete"] as const)("with a %s marker", (state) => {
      const close = async (owner: LibraryOwner = A) => {
        await beginErasure(sql, owner, randomUUID());
        if (state === "complete") {
          await engine.query(
            `UPDATE personal_library_erasures SET state = 'complete', open_attempts = '{}', completed_at = now()
              WHERE clerk_env = $1 AND clerk_user_id = $2`,
            [owner.env, owner.userId],
          );
        }
      };

      it("refuses favorite removal, exact removal, clearing history and deleting a note, changing nothing", async () => {
        await fill(A);
        const [note] = (await engine.query(`SELECT note_id FROM user_song_notes WHERE clerk_user_id = 'user_a'`)).rows;
        await close();
        expect(await removeFavorite(sql, A, IDS)).toBe("account-erasing");
        expect(await removeExactFavorite(sql, A, SONG)).toBe("account-erasing");
        expect(await clearRecent(sql, A)).toBe("account-erasing");
        expect(await deleteNote(sql, A, { storedIds: IDS, noteId: note.note_id as string, expectedRevision: 1 })).toEqual({ status: "account-erasing" });
        expect(await totals(A)).toEqual([1, 1, 1]);
        const [kept] = (await engine.query(`SELECT content, deleted_at FROM user_song_notes WHERE clerk_user_id = 'user_a'`)).rows;
        expect(kept).toMatchObject({ content: "note", deleted_at: null });
      });

      it("exposes no favorites through any read", async () => {
        await addFavorite(sql, A, { songId: SONG, storedIds: IDS });
        await close();
        expect(await isFavorite(sql, A, IDS)).toBe(false);
        expect((await listFavorites(sql, A)).items).toEqual([]);
        expect(await listFavoriteRows(sql, A)).toEqual({ blocked: true });
        expect(await favoriteMembership(sql, A, [SONG.toLowerCase()])).toEqual({ blocked: true });
      });

      it("does not prune an erasing account's history", async () => {
        await view(A, SONG, Date.now() - 200 * DAY);
        await close();
        expect(await view(A, "OTHER-1", Date.now())).toBe("account-erasing");
        expect(await count("user_library_recent")).toBe(1);
      });

      it("still lets the privileged cleanup remove everything", async () => {
        await fill(A);
        await close();
        await deletePersonalLibraryData(sql, A);
        expect(await totals(A)).toEqual([0, 0, 0]);
      });

      it("leaves another account's operations alone", async () => {
        await fill(B);
        await close();
        expect(await removeFavorite(sql, B, IDS)).toBe("removed");
        expect(await clearRecent(sql, B)).toBe(1);
      });
    });

    it("settles overlapping removals and an erasure one before the other", async () => {
      await addFavorite(sql, A, { songId: SONG, storedIds: IDS });
      const [removed] = await Promise.all([removeFavorite(sql, A, IDS), beginErasure(sql, A, randomUUID())]);
      expect(["removed", "account-erasing"]).toContain(removed);
      expect(await count("user_song_favorites")).toBe(removed === "removed" ? 0 : 1);
    });

    it("refuses an update to an existing note once the marker is down", async () => {
      const note = await created();
      await beginErasure(sql, A, randomUUID());
      expect((await updateNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 1, content: "late", mutationId: randomUUID() })).status).toBe("account-erasing");
      expect(await loadNote(sql, A, IDS)).toMatchObject({ note: { content: "first" } });
    });

    it("removes all three categories for this owner and environment only", async () => {
      await Promise.all([fill(A), fill(B), fill(PROD_A)]);
      await beginErasure(sql, A, randomUUID());
      await deletePersonalLibraryData(sql, A);
      await completeErasure(sql, A);
      expect(await totals(A)).toEqual([0, 0, 0]);
      expect(await totals(B)).toEqual([1, 1, 1]);
      expect(await totals(PROD_A)).toEqual([1, 1, 1]);
      expect(await marker(B)).toBeUndefined();
      expect(await marker(PROD_A)).toBeUndefined();
    });

    it("can be repeated, and overlapping runs agree", async () => {
      await fill(A);
      await beginErasure(sql, A, randomUUID());
      await Promise.all([deletePersonalLibraryData(sql, A), deletePersonalLibraryData(sql, A), completeErasure(sql, A), completeErasure(sql, A)]);
      await deletePersonalLibraryData(sql, A);
      await completeErasure(sql, A);
      expect(await totals(A)).toEqual([0, 0, 0]);
      expect((await marker()).state).toBe("complete");
    });

    it("keeps a complete account closed to late writes", async () => {
      await beginErasure(sql, A, randomUUID());
      await completeErasure(sql, A);
      expect((await create(A)).status).toBe("account-erasing");
      expect(await totals(A)).toEqual([0, 0, 0]);
    });

    it("stays pending until completion is recorded, and is listed for recovery", async () => {
      await beginErasure(sql, A, randomUUID());
      await deletePersonalLibraryData(sql, A);
      expect((await marker()).state).toBe("pending");
      expect(await listPendingErasures(sql, "development", 25)).toEqual(["user_a"]);
      expect(await listPendingErasures(sql, "production", 25)).toEqual([]);
      await completeErasure(sql, A);
      expect(await listPendingErasures(sql, "development", 25)).toEqual([]);
    });

    it("reopens after a definitive refusal when it was the only attempt", async () => {
      const attempt = randomUUID();
      await beginErasure(sql, A, attempt);
      await releaseErasureAttempt(sql, A, attempt);
      expect(await marker()).toBeUndefined();
      expect((await create(A)).status).toBe("created");
    });

    it("stays closed while an earlier uncertain attempt could still succeed", async () => {
      const uncertain = randomUUID();
      const refused = randomUUID();
      await beginErasure(sql, A, uncertain);
      await beginErasure(sql, A, refused);
      await releaseErasureAttempt(sql, A, refused);
      expect((await marker()).state).toBe("pending");
      expect((await create(A)).status).toBe("account-erasing");
    });

    it("ignores releasing an attempt it does not hold", async () => {
      await beginErasure(sql, A, randomUUID());
      await releaseErasureAttempt(sql, A, randomUUID());
      expect((await marker()).state).toBe("pending");
    });

    it("never reopens a completed erasure", async () => {
      const attempt = randomUUID();
      await beginErasure(sql, A, attempt);
      await completeErasure(sql, A);
      await releaseErasureAttempt(sql, A, attempt);
      await beginErasure(sql, A, randomUUID());
      expect(await marker()).toMatchObject({ state: "complete" });
    });

    it("removes note tombstones and all their metadata", async () => {
      const note = await created(A, "text");
      await deleteNote(sql, A, { storedIds: IDS, noteId: note.noteId, expectedRevision: 1 });
      expect(await count("user_song_notes")).toBe(1);
      await beginErasure(sql, A, randomUUID());
      await deletePersonalLibraryData(sql, A);
      await completeErasure(sql, A);
      expect(await count("user_song_notes")).toBe(0);
    });

    describe("recovery through the real store", () => {
      const steps = (owner: LibraryOwner, failing: string | null = null, calls: string[] = []) => ({
        purgeLibrary: () => deletePersonalLibraryData(sql, owner),
        deleteUserData: async () => {
          calls.push("user");
          if (failing === "user") throw new Error("failed");
        },
        deleteNotificationData: async () => {
          calls.push("notifications");
          if (failing === "notifications") throw new Error("failed");
        },
        complete: () => completeErasure(sql, owner),
      });
      const erase = (owner: LibraryOwner, clerk: ClerkDeletion, failing: string | null = null) =>
        eraseAccount(
          {
            ...steps(owner, failing),
            newAttempt: randomUUID,
            begin: async (attempt) => {
              await beginErasure(sql, owner, attempt);
              return true;
            },
            deleteClerkAccount: async () => clerk,
            release: (attempt) => releaseErasureAttempt(sql, owner, attempt),
          },
          true,
        );
      const recover = (gone: boolean | null, failing: string | null = null, limit = 25) =>
        recoverPendingErasures(
          {
            listPending: (max) => listPendingErasures(sql, "development", max),
            accountGone: async () => gone,
            cleanupFor: (userId) => steps({ env: "development", userId }, failing),
            noteTried: (userId) => noteErasureRecovery(sql, { env: "development", userId }),
          },
          limit,
        );

      it.each(["user", "notifications"])("stays pending when %s cleanup fails, then recovery completes it", async (failing) => {
        await fill(A);
        expect(await erase(A, "deleted", failing)).toBe("cleanup-pending");
        expect((await marker()).state).toBe("pending");
        expect(await recover(true, failing)).toMatchObject({ completed: 0, failed: 1 });
        expect((await marker()).state).toBe("pending");
        expect(await recover(true)).toMatchObject({ completed: 1, failed: 0 });
        expect((await marker()).state).toBe("complete");
        expect(await totals(A)).toEqual([0, 0, 0]);
      });

      it("keeps an uncertain deletion closed, with data intact, while the account exists", async () => {
        await fill(A);
        expect(await erase(A, "uncertain")).toBe("uncertain");
        expect(await recover(false)).toMatchObject({ completed: 0, waiting: 1 });
        expect(await recover(null)).toMatchObject({ completed: 0, failed: 1 });
        expect((await marker()).state).toBe("pending");
        expect(await totals(A)).toEqual([1, 1, 1]);
        expect((await create(A, "late", randomUUID(), [ALIAS], ALIAS)).status).toBe("account-erasing");
      });

      it("does not reopen on a later refusal while an uncertain attempt remains", async () => {
        await fill(A);
        await erase(A, "uncertain");
        expect(await erase(A, "refused")).toBe("refused");
        expect((await marker()).state).toBe("pending");
        expect(((await marker()).open_attempts as string[])).toHaveLength(1);
      });

      it("finishes when an administrator retries the deletion and it succeeds", async () => {
        await fill(A);
        await erase(A, "uncertain");
        expect(await erase(A, "deleted")).toBe("erased");
        expect((await marker()).state).toBe("complete");
        expect(await totals(A)).toEqual([0, 0, 0]);
      });

      it("finishes when the uncertain deletion turns out to have worked", async () => {
        await fill(A);
        await erase(A, "uncertain");
        expect(await recover(true)).toMatchObject({ completed: 1 });
        expect((await marker()).state).toBe("complete");
      });

      it("is safe when recovery runs overlap", async () => {
        await fill(A);
        await erase(A, "deleted", "notifications");
        const runs = await Promise.all([recover(true), recover(true), recover(true)]);
        expect(runs.every((run) => run.failed === 0)).toBe(true);
        expect((await marker()).state).toBe("complete");
        expect(await totals(A)).toEqual([0, 0, 0]);
        expect((await recover(true)).checked).toBe(0);
      });

      it("takes turns, so one stuck account cannot starve the others", async () => {
        await erase(A, "uncertain");
        await erase(B, "uncertain");
        await recover(false, null, 1);
        expect(await listPendingErasures(sql, "development", 1)).toEqual(["user_b"]);
      });
    });

    it("orders an overlapping write and erasure so nothing survives", async () => {
      await beginErasure(sql, B, randomUUID());
      const writes = Array.from({ length: 6 }, (_, i) => addFavorite(sql, A, { songId: `S-${i}`, storedIds: [`S-${i}`] }));
      const erase = (async () => {
        await beginErasure(sql, A, randomUUID());
        await deletePersonalLibraryData(sql, A);
        await completeErasure(sql, A);
      })();
      const late = Array.from({ length: 6 }, (_, i) => addFavorite(sql, A, { songId: `L-${i}`, storedIds: [`L-${i}`] }));
      await Promise.all([...writes, erase, ...late]);
      await completeErasure(sql, A);
      expect(await count("user_song_favorites")).toBe(0);
    });
  });
});
