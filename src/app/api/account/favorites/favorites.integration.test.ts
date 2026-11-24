import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { FavoriteSongInfo, FavoritesPage } from "@/lib/favorites-api";

/**
 * The Favorites routes on a real, isolated, in-memory PostgreSQL (PGlite).
 * Never reads DATABASE_URL. Set PERSONAL_LIBRARY_PGLITE to the file URL of
 * PGlite's dist/index.js to run it. The session is a stand-in with the same
 * contract as withPermission (authorize.test.ts covers the real one).
 */

interface Engine {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  transaction<T>(work: (tx: Engine) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const state = vi.hoisted(() => ({
  engine: null as Engine | null,
  viewer: null as { userId: string; env: "development" | "production"; roleKeys: string[] } | null,
  blocked: false,
  directoryDown: false,
  directory: { ids: [] as string[], catalog: [] as Array<{ songId: string; catalogId?: string }> },
  songs: new Map<string, unknown>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => {
  const ACTION_ERRORS = {
    signedOut: "signed-out", forbidden: "forbidden", unavailable: "unavailable", failed: "failed", profileIncomplete: "profile",
  };
  return {
    ACTION_ERRORS,
    withPermission: async (_permission: unknown, action: (viewer: unknown) => Promise<unknown>) => {
      if (!state.viewer) return { ok: false, error: ACTION_ERRORS.signedOut };
      if (state.blocked) return { ok: false, error: ACTION_ERRORS.profileIncomplete };
      try {
        return await action(state.viewer);
      } catch {
        return { ok: false, error: ACTION_ERRORS.failed };
      }
    },
  };
});
vi.mock("@/lib/personal-library/server", async () => {
  const { buildPersonalDirectory } = await vi.importActual<typeof import("@/lib/personal-library/identity")>("@/lib/personal-library/identity");
  return {
    personalLibraryClient: async () => ({
      query: async (text: string, params?: unknown[]) => (await state.engine!.query(text, params)).rows,
      transaction: (statements: Array<{ text: string; params: unknown[] }>) =>
        state.engine!.transaction(async (tx) => {
          const out: Array<Array<Record<string, unknown>>> = [];
          for (const { text, params } of statements) out.push((await tx.query(text, params)).rows);
          return out;
        }),
    }),
    personalSongs: async () => state.directoryDown
      ? { directory: { status: "unavailable" }, songs: new Map() }
      : { directory: buildPersonalDirectory(state.directory.ids, state.directory.catalog), songs: state.songs },
  };
});

const packageUrl = process.env.PERSONAL_LIBRARY_PGLITE ?? process.env.MEMBERSHIP_PGLITE;
const ORIGIN = "https://faithfulwordmusic.test";
const info = (songId: string, title: string, number: string | null = null, collection: string | null = null): FavoriteSongInfo => ({
  songId, title, number, collection, href: `/library/songs/${songId.toLowerCase()}`,
});
const member = (userId = "user_a", roleKeys: string[] = [], env: "development" | "production" = "development") => ({ userId, env, roleKeys });

const put = (songId: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/account/favorites/${encodeURIComponent(songId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const membership = (ids: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/account/favorites/membership`, {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
    body: JSON.stringify({ ids }),
  });
const list = (query = "") => new Request(`${ORIGIN}/api/account/favorites${query}`);

describe.skipIf(!packageUrl)("Favorites routes on isolated PostgreSQL", () => {
  let routes: typeof import("./handlers");
  const set = async (songId: string, favorite: boolean, account = state.viewer?.userId ?? "x", extra: object = {}) =>
    routes.setFavoriteResponse(put(songId, { favorite, expectedAccount: account, ...extra }), songId);
  const rows = async (userId = "user_a") =>
    (await state.engine!.query(`SELECT song_id FROM user_song_favorites WHERE clerk_user_id = $1 ORDER BY song_id`, [userId])).rows.map((row) => row.song_id);
  const page = async (query = "") => (await (await routes.listFavoritesResponse(list(query))).json()) as FavoritesPage;
  const code = async (response: Response) => ((await response.json()) as { code: string }).code;

  beforeAll(async () => {
    const { PGlite } = (await import(/* @vite-ignore */ packageUrl!)) as { PGlite: new () => Engine };
    state.engine = new PGlite();
    const { PERSONAL_LIBRARY_SCHEMA } = await import("@/lib/personal-library/schema.mjs");
    for (const statement of PERSONAL_LIBRARY_SCHEMA) await state.engine.query(statement);
    routes = await import("./handlers");
  }, 60_000);

  afterAll(async () => {
    await state.engine?.close();
    state.engine = null;
  });

  beforeEach(async () => {
    await state.engine!.query(`TRUNCATE user_song_favorites, user_library_recent, user_song_notes, personal_library_erasures`);
    state.viewer = member();
    state.blocked = false;
    state.directoryDown = false;
    state.directory = { ids: ["SSSH-10", "SSSH-9", "BTH-200"], catalog: [{ songId: "SSSH-10", catalogId: "catalog-old" }] };
    state.songs = new Map([
      ["SSSH-10", info("SSSH-10", "Amazing Grace", "10", "SSSH")],
      ["SSSH-9", info("SSSH-9", "Be Thou My Vision", "9", "SSSH")],
      ["BTH-200", info("BTH-200", "Crown Him", "200", "BTH")],
    ]);
  });

  describe("who may use Favorites", () => {
    it.each([
      ["Approved External Member", ["external_member"]],
      ["Verified Church Member", ["church_member"]],
      ["Musician", ["musician"]],
      ["Song Leader", ["song_leader"]],
      ["Music Director", ["music_director"]],
      ["Administrator", ["admin"]],
      ["member with no role", []],
    ])("allows a %s", async (_name, roles) => {
      state.viewer = member("user_a", roles);
      expect((await set("SSSH-10", true)).status).toBe(200);
      expect((await page()).total).toBe(1);
    });

    it("refuses a signed-out visitor on every route, touching nothing", async () => {
      state.viewer = null;
      const responses = [await routes.listFavoritesResponse(list()), await routes.membershipResponse(membership(["SSSH-10"])), await set("SSSH-10", true, "user_a")];
      for (const response of responses) {
        expect(response.status).toBe(401);
        expect(await code(response)).toBe("unauthorized");
      }
      expect(await rows()).toEqual([]);
    });

    it("refuses a profile-blocked account on every route", async () => {
      state.blocked = true;
      for (const response of [await routes.listFavoritesResponse(list()), await routes.membershipResponse(membership(["SSSH-10"])), await set("SSSH-10", true)]) {
        expect(response.status).toBe(403);
        expect(await code(response)).toBe("profile-blocked");
      }
    });

    it("gives an administrator no way to read or change someone else's Favorites", async () => {
      await set("SSSH-10", true);
      state.viewer = member("user_admin", ["admin"]);
      expect((await page()).total).toBe(0);
      const answer = (await (await routes.membershipResponse(membership(["SSSH-10"]))).json()) as { songs: Record<string, { state: string }> };
      expect(answer.songs["SSSH-10"].state).toBe("not-favorited");
      expect((await set("SSSH-10", false, "user_a")).status).toBe(409);
      await set("SSSH-10", false, "user_admin");
      expect(await rows("user_a")).toEqual(["SSSH-10"]);
    });

    it("ignores any owner named in the request", async () => {
      const response = await routes.setFavoriteResponse(
        put("SSSH-10", { favorite: true, expectedAccount: "user_a", userId: "user_b", clerkEnv: "production", owner: "user_b" }),
        "SSSH-10",
      );
      expect(response.status).toBe(200);
      expect(await rows("user_a")).toEqual(["SSSH-10"]);
      expect(await rows("user_b")).toEqual([]);
    });

    it("keeps Development and Production apart", async () => {
      await set("SSSH-10", true);
      state.viewer = member("user_a", [], "production");
      expect((await page()).total).toBe(0);
    });

    it("refuses a request queued for a different account", async () => {
      const response = await set("SSSH-10", true, "user_previous");
      expect(response.status).toBe(409);
      expect(await code(response)).toBe("account-mismatch");
      expect(await rows()).toEqual([]);
    });
  });

  describe("erasure markers", () => {
    const close = async (complete: boolean) => {
      const { beginErasure, completeErasure } = await import("@/lib/personal-library/store");
      const sql = {
        query: async (text: string, params?: unknown[]) => (await state.engine!.query(text, params)).rows,
        transaction: (statements: Array<{ text: string; params: unknown[] }>) => state.engine!.transaction(async (tx) => {
          const out: Array<Array<Record<string, unknown>>> = [];
          for (const { text, params } of statements) out.push((await tx.query(text, params)).rows);
          return out;
        }),
      };
      await beginErasure(sql as never, { env: "development", userId: "user_a" }, randomUUID());
      if (complete) {
        await state.engine!.query(`UPDATE personal_library_erasures SET state = 'complete', open_attempts = '{}', completed_at = now()`);
      }
      void completeErasure;
    };

    it.each([["pending", false], ["completed", true]])("closes every route with a %s marker", async (_name, complete) => {
      await set("SSSH-10", true);
      await close(complete as boolean);
      const responses = [
        await routes.listFavoritesResponse(list()),
        await routes.membershipResponse(membership(["SSSH-10"])),
        await set("SSSH-9", true),
        await set("SSSH-10", false),
        await set("SSSH-10", false, "user_a", { exact: true }),
      ];
      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(await code(response)).toBe("account-erasing");
      }
      expect(await rows()).toEqual(["SSSH-10"]);
    });
  });

  describe("mutations", () => {
    it("adds and removes idempotently with explicit states", async () => {
      expect(await (await set("SSSH-10", true)).json()).toMatchObject({ favorite: true, changed: true, songId: "SSSH-10" });
      expect(await (await set("SSSH-10", true)).json()).toMatchObject({ favorite: true, changed: false });
      expect(await (await set("SSSH-10", false)).json()).toMatchObject({ favorite: false, changed: true });
      expect(await (await set("SSSH-10", false)).json()).toMatchObject({ favorite: false, changed: false });
    });

    it("keeps the original date when adding again", async () => {
      await set("SSSH-10", true);
      const before = (await page()).items[0].addedAt;
      await set("SSSH-10", true);
      expect((await page()).items[0].addedAt).toBe(before);
    });

    it("requires an explicit state, with no toggle", async () => {
      for (const body of [{ expectedAccount: "user_a" }, { favorite: "true", expectedAccount: "user_a" }, { favorite: true }, "nonsense", "[]"]) {
        expect((await routes.setFavoriteResponse(put("SSSH-10", body), "SSSH-10")).status).toBe(400);
      }
    });

    it("distinguishes why a song cannot be saved", async () => {
      expect(await code(await set("NOPE-1", true))).toBe("unknown-song");
      expect(await code(await set("legacy-t-abc", true))).toBe("unsupported-song");
      state.directory = { ids: [], catalog: [{ songId: "A-1", catalogId: "shared" }, { songId: "B-1", catalogId: "shared" }] };
      expect(await code(await set("shared", true))).toBe("ambiguous-song");
      state.directoryDown = true;
      expect(await code(await set("SSSH-10", true))).toBe("directory-unavailable");
      expect(await rows()).toEqual([]);
    });

    it("removes every safely resolved spelling of a song", async () => {
      await state.engine!.query(`INSERT INTO user_song_favorites (clerk_env, clerk_user_id, song_id)
        VALUES ('development', 'user_a', 'catalog-old'), ('development', 'user_a', 'sssh-10'), ('development', 'user_a', 'SSSH-9')`);
      await set("SSSH-10", false);
      expect(await rows()).toEqual(["SSSH-9"]);
    });

    it("never removes a spelling another song also claims", async () => {
      state.directory = { ids: ["A-1", "B-1"], catalog: [{ songId: "A-1", catalogId: "shared" }, { songId: "B-1", catalogId: "shared" }] };
      state.songs = new Map([["A-1", info("A-1", "A")], ["B-1", info("B-1", "B")]]);
      await state.engine!.query(`INSERT INTO user_song_favorites (clerk_env, clerk_user_id, song_id)
        VALUES ('development', 'user_a', 'A-1'), ('development', 'user_a', 'shared')`);
      await set("A-1", false);
      expect(await rows()).toEqual(["shared"]);
    });

    it("cannot duplicate a Favorite through a case variant", async () => {
      await set("sssh-10", true);
      await set("SSSH-10", true);
      expect(await rows()).toEqual(["SSSH-10"]);
    });

    it("removes an unavailable entry by its exact key, even in an outage", async () => {
      await state.engine!.query(`INSERT INTO user_song_favorites (clerk_env, clerk_user_id, song_id)
        VALUES ('development', 'user_a', 'GONE-1'), ('development', 'user_a', 'gone-1')`);
      state.directoryDown = true;
      expect(await (await set("GONE-1", false, "user_a", { exact: true })).json()).toMatchObject({ changed: true });
      expect(await rows()).toEqual(["gone-1"]);
      expect(await (await set("GONE-1", false, "user_a", { exact: true })).json()).toMatchObject({ changed: false });
    });

    it("cannot create anything through the exact path", async () => {
      expect((await set("ANY-1", true, "user_a", { exact: true })).status).toBe(400);
      expect(await rows()).toEqual([]);
    });
  });

  describe("request safety", () => {
    it("refuses cross-site writes and membership reads", async () => {
      const cross = { "sec-fetch-site": "cross-site" };
      expect((await routes.setFavoriteResponse(put("SSSH-10", { favorite: true, expectedAccount: "user_a" }, cross), "SSSH-10")).status).toBe(403);
      expect((await routes.membershipResponse(membership(["SSSH-10"], cross))).status).toBe(403);
      expect(await rows()).toEqual([]);
    });

    it("checks Origin when the browser sends no fetch metadata", async () => {
      const without = (origin?: string) => {
        const headers = new Headers({ "content-type": "application/json" });
        if (origin) headers.set("origin", origin);
        return new Request(`${ORIGIN}/api/account/favorites/SSSH-10`, { method: "PUT", headers, body: JSON.stringify({ favorite: true, expectedAccount: "user_a" }) });
      };
      expect((await routes.setFavoriteResponse(without("https://evil.test"), "SSSH-10")).status).toBe(403);
      expect((await routes.setFavoriteResponse(without(), "SSSH-10")).status).toBe(403);
      expect((await routes.setFavoriteResponse(without(ORIGIN), "SSSH-10")).status).toBe(200);
    });

    it("requires a JSON body", async () => {
      const response = await routes.setFavoriteResponse(
        put("SSSH-10", { favorite: true, expectedAccount: "user_a" }, { "content-type": "text/plain" }),
        "SSSH-10",
      );
      expect(response.status).toBe(400);
    });

    it("bounds and validates membership requests", async () => {
      for (const ids of [[], "SSSH-10", [1], ["x".repeat(201)], Array.from({ length: 201 }, (_, i) => `S-${i}`)]) {
        expect((await routes.membershipResponse(membership(ids))).status).toBe(400);
      }
      expect((await routes.membershipResponse(membership(Array.from({ length: 200 }, (_, i) => `S-${i}`)))).status).toBe(200);
    });

    it("validates list parameters", async () => {
      for (const query of ["?sort=rank", "?limit=0", "?limit=101", "?limit=abc", `?q=${"a".repeat(101)}`, `?cursor=${"a".repeat(1025)}`]) {
        expect((await routes.listFavoritesResponse(list(query))).status).toBe(400);
      }
      expect(await code(await routes.listFavoritesResponse(list("?cursor=nonsense")))).toBe("invalid-cursor");
    });

    it("marks every answer private and uncached, including refusals", async () => {
      const responses = [await routes.listFavoritesResponse(list()), await routes.membershipResponse(membership(["SSSH-10"])), await set("SSSH-10", true), await set("NOPE-1", true)];
      state.viewer = null;
      responses.push(await routes.listFavoritesResponse(list()));
      for (const response of responses) expect(response.headers.get("cache-control")).toBe("private, no-store");
    });

    it("hides internal failures behind a controlled answer", async () => {
      const engine = state.engine!;
      state.engine = { ...engine, query: async () => { throw new Error("secret database detail"); } } as unknown as Engine;
      try {
        const response = await routes.listFavoritesResponse(list());
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain("secret");
      } finally {
        state.engine = engine;
      }
    });

    it("returns only public song fields", async () => {
      state.songs.set("SSSH-10", { ...info("SSSH-10", "Amazing Grace"), driveFileId: "private-file", rights: "restricted" } as FavoriteSongInfo);
      await set("SSSH-10", true);
      const { items } = await page();
      expect(Object.keys(items[0]).sort()).toEqual(expect.arrayContaining(["key", "kind", "title"]));
      expect(items[0].kind).toBe("song");
    });
  });

  describe("reading the collection", () => {
    it("answers membership for aliases and case variants", async () => {
      await state.engine!.query(`INSERT INTO user_song_favorites (clerk_env, clerk_user_id, song_id)
        VALUES ('development', 'user_a', 'catalog-old')`);
      const body = (await (await routes.membershipResponse(membership(["SSSH-10", "sssh-10", "SSSH-9", "legacy-t-x"]))).json()) as { songs: Record<string, unknown> };
      expect(body.songs).toEqual({
        "SSSH-10": { state: "favorited", songId: "SSSH-10" },
        "sssh-10": { state: "favorited", songId: "SSSH-10" },
        "SSSH-9": { state: "not-favorited", songId: "SSSH-9" },
        "legacy-t-x": { state: "unsupported" },
      });
    });

    it("presents aliases as one Favorite with the earliest date", async () => {
      await state.engine!.query(`INSERT INTO user_song_favorites (clerk_env, clerk_user_id, song_id, created_at)
        VALUES ('development', 'user_a', 'catalog-old', '2026-01-02T00:00:00.000001Z'),
               ('development', 'user_a', 'SSSH-10', '2026-01-01T00:00:00.000002Z')`);
      const { items, total } = await page();
      expect(total).toBe(1);
      expect(items[0]).toMatchObject({ kind: "song", key: "SSSH-10", addedAt: "2026-01-01T00:00:00.000002Z" });
      expect(await rows()).toEqual(["SSSH-10", "catalog-old"]);
    });

    it("keeps unavailable entries visible, and lists everything in an outage", async () => {
      await set("SSSH-10", true);
      await state.engine!.query(`INSERT INTO user_song_favorites (clerk_env, clerk_user_id, song_id) VALUES ('development', 'user_a', 'GONE-1')`);
      expect((await page()).items.map((item) => item.kind).sort()).toEqual(["song", "unavailable"]);
      state.directoryDown = true;
      const down = await page("?sort=title");
      expect(down).toMatchObject({ directory: "unavailable", sort: "recent", total: 2 });
      expect(down.items.every((item) => item.kind === "unknown")).toBe(true);
      expect(await code(await routes.listFavoritesResponse(list("?q=grace")))).toBe("directory-unavailable");
      expect(await rows()).toHaveLength(2);
    });

    it("searches and sorts past the first page of a large collection", async () => {
      const ids = Array.from({ length: 500 }, (_, i) => `S-${String(i).padStart(3, "0")}`);
      state.directory = { ids, catalog: [] };
      state.songs = new Map(ids.map((id, i) => [id, info(id, i === 7 ? "Zebra Hymn" : `Song ${id}`, String(i), "SSSH")]));
      await state.engine!.query(
        `INSERT INTO user_song_favorites (clerk_env, clerk_user_id, song_id, created_at)
         SELECT 'development', 'user_a', 'S-' || lpad(i::text, 3, '0'), '2026-01-01'::timestamptz + (i || ' seconds')::interval
           FROM generate_series(0, 499) AS i`,
      );
      expect((await page("?q=zebra")).items.map((item) => item.key)).toEqual(["S-007"]);
      expect((await page("?sort=title&limit=1")).items[0].key).toBe("S-000");
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string = `?sort=number&limit=100${cursor ? `&cursor=${cursor}` : ""}`;
        const next: FavoritesPage = await page(query);
        seen.push(...next.items.map((item) => item.key));
        cursor = next.nextCursor;
      } while (cursor);
      expect(new Set(seen).size).toBe(500);
    });
  });

  describe.skipIf(!process.env.FAVORITES_PERF)("measured cost", () => {
    it.each([0, 1, 50, 500, 5000])("%i favorites", async (size) => {
      const ids = Array.from({ length: Math.max(size, 1) }, (_, i) => `S-${i}`);
      state.directory = { ids, catalog: [] };
      state.songs = new Map(ids.map((id, i) => [id, info(id, `Song ${ids.length - i}`, String(i), i % 2 ? "A" : "B")]));
      if (size > 0) {
        await state.engine!.query(
          `INSERT INTO user_song_favorites (clerk_env, clerk_user_id, song_id, created_at)
           SELECT 'development', 'user_a', 'S-' || i, '2026-01-01'::timestamptz + (i || ' milliseconds')::interval
             FROM generate_series(0, $1::int - 1) AS i`,
          [size],
        );
      }
      const time = async (work: () => Promise<unknown>) => {
        const start = performance.now();
        await work();
        return Math.round((performance.now() - start) * 10) / 10;
      };
      const results = {
        recent: await time(() => routes.listFavoritesResponse(list())),
        title: await time(() => routes.listFavoritesResponse(list("?sort=title"))),
        number: await time(() => routes.listFavoritesResponse(list("?sort=number"))),
        search: await time(() => routes.listFavoritesResponse(list("?q=song%201"))),
        membership200: await time(() => routes.membershipResponse(membership(ids.slice(0, 200)))),
      };
      console.info(`[perf] ${size} favorites (ms): ${JSON.stringify(results)}`);
    }, 60_000);
  });
});
