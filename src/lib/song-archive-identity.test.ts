import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexSong, SheetMusicIndex } from "./sheet-music";
import type { DatedService, SongListMonth } from "@/types/song-list";
import { siteConfig } from "@/config/site";

const data = vi.hoisted(() => ({
  stored: [] as DatedService[], published: [] as DatedService[], catalog: [] as unknown[],
  index: null as SheetMusicIndex | null, viewer: null as unknown, open: vi.fn(),
  months: [] as SongListMonth[],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/archive-store", () => ({ loadStoredServices: async () => data.stored, saveServices: vi.fn() }));
vi.mock("@/lib/schedule", () => ({ getSchedule: async () => ({ ok: true, months: data.months, published: data.published }), scheduleEnv: () => "development", publishedHistory: vi.fn() }));
vi.mock("@/lib/service-planner/store", () => ({ listCatalogSongs: async () => data.catalog, plannerConfigured: () => true, listPlans: async () => [] }));
vi.mock("@/lib/sheet-music-index", () => ({ getSheetMusicIndex: async () => data.index ? { ok: true, index: data.index } : { ok: false, reason: "unavailable" }, openDriveFile: data.open }));
vi.mock("@/lib/auth/session", () => ({ getViewer: async () => data.viewer }));

const title = "All Hail the Power of Jesus' Name";
const collection = siteConfig.sheetMusic.hymnalCollection;
const indexSong = (number: string, keys: string, rights: IndexSong["rights"] = "cleared"): IndexSong => ({
  id: `SSSH1989-${number}`, title, hymnNumber: number, collection, keys, rights,
  composer: null, lyricist: null, type: null, category: null, occasion: null, source: null,
  versions: [{ typeId: 1, label: "Standard", version: "1", keys, capoFret: null,
    files: [{ slug: `standard-${number}.pdf`, format: "pdf", driveFileId: `private-${number}`, md5: `${number}checksum` }] }],
});
const service = (number: string | null, key: string, songId?: string): DatedService => ({
  date: "2026-01-04", slot: "AM", startsAt: "2026-01-04T10:30:00-07:00", songs: [{ title, number, key, ...(songId ? { songId } : {}) }],
});

beforeEach(() => {
  vi.resetModules();
  data.stored = [service("167", "G"), { ...service("168", "Ab"), date: "2026-01-11", startsAt: "2026-01-11T10:30:00-07:00" }];
  data.published = [{ ...service("168", "Bb", "SSSH1989-168"), date: "2099-01-04", startsAt: "2099-01-04T10:30:00-07:00" }];
  data.index = { songs: [indexSong("167", "G"), indexSong("168", "A♭")], types: [{ id: 1, label: "Standard" }] };
  data.catalog = [];
  data.months = [];
  data.viewer = null;
  data.open.mockReset().mockResolvedValue(new ReadableStream());
});

describe("song page identity integration", () => {
  it("gives legacy published schedule slots the same identities as their historical hints", async () => {
    data.months = [{ title: "January 2099", heading: null, fallbackRows: null, services: [{
      ...service("167", "G"), date: "2099-01-04", startsAt: "2099-01-04T10:30:00-07:00", id: "future", dateLabel: "Sunday", serviceLabel: "Morning Service", pendingSongs: 0,
    }] }];
    const { getScheduleData } = await import("./song-archive");
    const result = await getScheduleData();
    expect(result.result.ok && result.result.months[0].services[0].songs[0].songId).toBe("SSSH1989-167");
    expect(result.plays?.["SSSH1989-167"]).toContain("2026-01-04T10:30:00-07:00");
  });
  it("identifies upcoming report references with the same identities as archived history", async () => {
    data.published[0].songs = [{ title, number: "168", key: "Bb" }];
    const { getReportInputs } = await import("./song-archive");
    const report = await getReportInputs();
    expect(report?.past[1].songs[0].songId).toBe("SSSH1989-168");
    expect(report?.upcoming[0].songs[0].songId).toBe("SSSH1989-168");
  });
  it("keeps each page's key, files, history, stats and upcoming appearances independent", async () => {
    const { getSongPage } = await import("./song-archive");
    const first = await getSongPage("all-hail-the-power-of-jesus-name-sssh1989-167");
    const second = await getSongPage("all-hail-the-power-of-jesus-name-sssh1989-168");
    expect(first).toMatchObject({ songId: "SSSH1989-167", number: "167", plays: [{ key: "G" }], upcoming: [], stats: { count: 1 }, sheetMusic: { keys: "G" } });
    expect(second).toMatchObject({ songId: "SSSH1989-168", number: "168", plays: [{ key: "Ab" }], upcoming: [{ key: "Bb" }], stats: { count: 1 }, sheetMusic: { keys: "A♭" } });
    expect(second?.sheetMusic?.versions[0].files[0].href).toContain("sssh1989-168/sheet-music/standard-168.pdf?v=168check");
    expect(first?.sheetMusic?.versions[0].files[0].href).toContain("sssh1989-167/sheet-music/standard-167.pdf");
    expect(JSON.stringify(second)).not.toContain("private-168");
  });
  it("includes unsung indexed entries and does not choose an ambiguous legacy title", async () => {
    data.stored = []; data.published = [];
    const { getLibraryData, getSongPage, getSongChoices } = await import("./song-archive");
    const library = await getLibraryData();
    expect(library.ok && library.songs.map((song) => song.songId)).toEqual(["SSSH1989-167", "SSSH1989-168"]);
    expect(await getSongPage("all-hail-the-power-of-jesus-name")).toBeNull();
    expect(await getSongChoices("all-hail-the-power-of-jesus-name")).toHaveLength(2);
    expect(await getSongPage("all-hail-the-power-of-jesus-name-missing-168")).toBeNull();
  });
  it("keeps insufficient historical evidence separate and never infers identity from the performed key", async () => {
    data.stored.push({ ...service(null, "G"), date: "2026-02-01", startsAt: "2026-02-01T10:30:00-07:00" });
    const { getSongPage, getArchiveData } = await import("./song-archive");
    expect((await getSongPage("all-hail-sssh1989-167"))?.stats.count).toBe(1);
    const archive = await getArchiveData();
    expect(archive.ok && archive.records).toHaveLength(3);
    expect(data.stored[0].songs[0]).not.toHaveProperty("songId");
  });
  it("keeps explicit identities during index outages and catalog-only songs addressable", async () => {
    data.index = null;
    data.stored = [service("168", "Ab", "SSSH1989-168")];
    data.catalog = [{ songId: "catalog-one", catalogId: "catalog-one", title: "New Song", number: null, collection: null, defaultKey: "C" }];
    const { getSongPage } = await import("./song-archive");
    expect(await getSongPage("old-title-sssh1989-168")).toMatchObject({ songId: "SSSH1989-168", number: "168", sheetMusic: null, stats: { count: 1 } });
    expect(await getSongPage("new-song-catalog-one")).toMatchObject({ songId: "catalog-one", plays: [] });
  });
  it("uses stored explicit associations for old published slots and hints during an index outage", async () => {
    data.index = null;
    data.stored = [service("168", "Ab", "SSSH1989-168")];
    data.published[0].songs = [{ title, number: "168", key: "Bb" }];
    data.months = [{ title: "January 2099", heading: null, fallbackRows: null, services: [{
      ...data.published[0], id: "future", dateLabel: "Sunday", serviceLabel: "Morning Service", pendingSongs: 0,
    }] }];
    const { getSongPage, getScheduleData, getReportInputs } = await import("./song-archive");
    expect((await getSongPage("old-title-sssh1989-168"))?.upcoming).toEqual([{ startsAt: "2099-01-04T10:30:00-07:00", slot: "AM", key: "Bb" }]);
    const schedule = await getScheduleData();
    expect(schedule.result.ok && schedule.result.months[0].services[0].songs[0].songId).toBe("SSSH1989-168");
    expect(schedule.plays?.["SSSH1989-168"]).toHaveLength(2);
    expect((await getReportInputs())?.upcoming[0].songs[0].songId).toBe("SSSH1989-168");
  });
});

describe("file route identity and access", () => {
  it("opens only the requested arrangement's file and rejects another arrangement's slug", async () => {
    const { GET } = await import("@/app/library/songs/[song]/sheet-music/[file]/route");
    const context = (file: string) => ({ params: Promise.resolve({ song: "all-hail-sssh1989-168", file }) });
    expect((await GET(new Request("https://example.test"), context("standard-167.pdf"))).status).toBe(404);
    expect(data.open).not.toHaveBeenCalled();
    expect((await GET(new Request("https://example.test"), context("standard-168.pdf"))).status).toBe(200);
    expect(data.open).toHaveBeenCalledWith("private-168");
  });
  it("does not fetch a copyrighted file without authorized membership", async () => {
    data.index!.songs[1].rights = "copyrighted";
    const { GET } = await import("@/app/library/songs/[song]/sheet-music/[file]/route");
    const context = () => ({ params: Promise.resolve({ song: "all-hail-sssh1989-168", file: "standard-168.pdf" }) });
    expect((await GET(new Request("https://example.test"), context())).status).toBe(401);
    data.viewer = { can: () => false };
    expect((await GET(new Request("https://example.test"), context())).status).toBe(403);
    expect(data.open).not.toHaveBeenCalled();
  });
});
