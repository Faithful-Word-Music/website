import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), applySchema: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getSql: () => db, applySchema: db.applySchema }));

beforeEach(() => {
  vi.resetModules();
  db.query.mockReset().mockResolvedValue([]);
  db.applySchema.mockReset().mockResolvedValue(undefined);
  db.transaction.mockReset().mockImplementation(async (work) => typeof work === "function" ? Promise.all(work(db)) : Promise.all(work));
});

describe("archive identity storage", () => {
  const song = { songId: "SSSH1989-168", collection: "SSSH1989", title: "All Hail", number: "168", key: "Ab" };
  const service = { date: "2026-10-15", slot: "PM" as const, startsAt: "2026-10-16T01:00:00Z", songs: [song] };

  it("adds nullable columns and round trips identity on a newly written service", async () => {
    const { saveServices, loadStoredServices } = await import("./archive-store");
    expect(await saveServices([service], Date.parse("2026-10-16T08:00:00Z"))).toEqual({ added: 1, refreshed: 0, frozen: 0 });
    const schema = db.applySchema.mock.calls[0][1] as string[];
    expect(schema).toContain("ALTER TABLE service_songs ADD COLUMN IF NOT EXISTS song_id text");
    expect(schema).toContain("ALTER TABLE service_songs ADD COLUMN IF NOT EXISTS collection text");
    const write = db.query.mock.calls.find(([sql]) => /jsonb_to_recordset/.test(sql));
    expect(JSON.parse(write?.[1][2] as string)[0]).toMatchObject({ song_id: song.songId, collection: song.collection });
    db.query.mockResolvedValue([{ date: service.date, slot: service.slot, starts_at: service.startsAt, label: null, kind: null, songs: [song] }]);
    expect((await loadStoredServices())?.[0].songs).toEqual([song]);
    expect(db.query.mock.lastCall?.[0]).toContain("'songId', ss.song_id");
  });

  it("does not rewrite frozen historical services to attach an identity", async () => {
    db.query.mockResolvedValue([{ date: service.date, slot: service.slot }]);
    const { saveServices } = await import("./archive-store");
    expect(await saveServices([service], Date.parse("2026-12-01T00:00:00Z"))).toEqual({ added: 0, refreshed: 0, frozen: 1 });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.query.mock.calls.every(([sql]) => !/INSERT|UPDATE|DELETE/.test(sql))).toBe(true);
  });
});
