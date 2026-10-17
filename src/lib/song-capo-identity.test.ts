import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  catalog: [{ songId: "catalog-original", catalogId: "catalog-original", title: "Catalog Song", number: null, collection: null, defaultKey: "G" }],
  query: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getSql: () => ({ query: fixture.query, transaction: async () => [] }), applySchema: async () => {},
}));
vi.mock("@/lib/service-planner/store", () => ({ listCatalogSongs: async () => fixture.catalog }));
vi.mock("@/lib/sheet-music-index", () => ({ getSheetMusicIndex: async () => ({ ok: false, reason: "unavailable" }) }));

beforeEach(() => {
  vi.resetModules();
  fixture.query.mockImplementation(async (sql: string) => {
    if (/SELECT count\(\*\)/.test(sql)) return [{ count: 1 }];
    if (/SELECT title_key, capo_rule/.test(sql)) return [{ title_key: "catalog song", capo_rule: "always" }];
    return [];
  });
});

it("preserves an unambiguous old catalog-only capo override after UUID migration even during an index outage", async () => {
  const { getCapoRules } = await import("./auth/store");
  expect((await getCapoRules("development")).overrides["catalog-original"]).toBe("always");
});

it("clears a safe migrated legacy key together with its identity when choosing global", async () => {
  const { setSongCapoRule } = await import("./auth/store");
  await setSongCapoRule("development", "catalog-original", "global", "user", "catalog song");
  const deletion = fixture.query.mock.calls.find(([sql]) => /DELETE FROM song_settings/.test(sql));
  expect(deletion?.[1]).toEqual(["development", ["catalog-original", "catalog song"]]);
});
