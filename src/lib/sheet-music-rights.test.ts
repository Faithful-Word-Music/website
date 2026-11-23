import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IndexSong, SheetFile } from "./sheet-music";
import { classify, readSheetMusic, songRights, toPublicSheetMusic } from "./sheet-music";

const google = vi.hoisted(() => ({
  songs: [] as string[][],
  fileRights: [] as string[][],
  failSheets: false,
  mode: "enforcing" as "legacy" | "enforcing",
  meta: { parents: ["folder-1"] } as Record<string, unknown>,
  reads: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/google-auth", () => ({ getGoogleAccessToken: async () => "token", isGoogleConfigured: () => true }));
vi.mock("@/lib/auth/store", () => ({
  sheetMusicTypesForSite: async () => [],
  deliveryPolicyMode: async () => google.mode,
  displayPolicyMode: async () => google.mode,
}));

const HEADER = ["Song ID", "Title", "Copyrighted?"];
const song = { id: "BTH-001", rights: "cleared" } as IndexSong;
const file: SheetFile = { format: "pdf", slug: "s.pdf", driveFileId: "file-1", folders: ["Cleared"], parentId: "folder-1" };

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("delivery rights", () => {
  let index: typeof import("./sheet-music-index");
  const NOW = 1_800_000_000_000;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    google.songs = [HEADER, ["BTH-001", "Song", "No"]];
    google.fileRights = [["Target", "Arrangement Rights"], ["Cleared", "Cleared"]];
    google.failSheets = false;
    google.mode = "enforcing";
    google.meta = { parents: ["folder-1"] };
    google.reads = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("/spreadsheets/")) {
        if (google.failSheets) return new Response("no", { status: 503 });
        if (url.includes("values:batchGet")) {
          google.reads += 1;
          return json({ valueRanges: [{ values: google.songs }, { values: google.fileRights }] });
        }
        return json({ sheets: [{ properties: { title: "Songs" } }, { properties: { title: "File Rights" } }] });
      }
      return json(google.meta);
    });
    index = await import("./sheet-music-index");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("classifies from the current sheet", async () => {
    expect(await index.currentFileResource(song, file)).toBe("public");
  });

  it("reuses one read within the minute", async () => {
    await index.currentFileResource(song, file);
    await index.currentFileResource(song, file);
    expect(google.reads).toBe(1);
  });

  it("shares one read between simultaneous requests", async () => {
    await Promise.all([index.currentFileResource(song, file), index.currentFileResource(song, file)]);
    expect(google.reads).toBe(1);
  });

  it("stops treating a file as public within 60 seconds of a rights change", async () => {
    await index.currentFileResource(song, file);
    google.songs = [HEADER, ["BTH-001", "Song", "Yes"]];
    vi.setSystemTime(NOW + 60_000);
    expect(await index.currentFileResource(song, file)).toBe("restricted");
  });

  it("refuses rather than reuse an expired answer when Google fails", async () => {
    await index.currentFileResource(song, file);
    google.failSheets = true;
    vi.setSystemTime(NOW + 60_000);
    expect(await index.currentFileResource(song, file)).toBeNull();
  });

  it("refuses when the sheet has no readable songs", async () => {
    google.songs = [];
    expect(await index.currentFileResource(song, file)).toBeNull();
  });

  it("withholds a song missing from the sheet", async () => {
    google.songs = [HEADER, ["BTH-002", "Other", "No"]];
    expect(await index.currentFileResource(song, file)).toBe("withheld");
  });

  it("withholds a file with no arrangement rule", async () => {
    expect(await index.currentFileResource(song, { ...file, folders: ["Elsewhere"] })).toBe("withheld");
  });

  it("keeps the song-level answer before activation", async () => {
    google.mode = "legacy";
    expect(await index.currentFileResource(song, { ...file, folders: ["Elsewhere"] })).toBe("public");
  });

  it("confirms a file still in its folder", async () => {
    google.meta = { parents: ["folder-1"], md5Checksum: "abc" };
    expect(await index.confirmDriveFile(file)).toEqual({ md5: "abc" });
  });

  it("refuses a file moved to another folder", async () => {
    google.meta = { parents: ["folder-2"] };
    expect(await index.confirmDriveFile(file)).toBeNull();
  });

  it("refuses a trashed file", async () => {
    google.meta = { parents: ["folder-1"], trashed: true };
    expect(await index.confirmDriveFile(file)).toBeNull();
  });
});

describe("songRights", () => {
  it("makes disagreeing duplicate rows unknown, in either order", () => {
    expect(songRights([HEADER, ["BTH-001", "A", "No"], ["BTH-001", "A", "Yes"]]).get("bth-001")).toBe("unknown");
    expect(songRights([HEADER, ["BTH-001", "A", "Yes"], ["BTH-001", "A", "No"]]).get("bth-001")).toBe("unknown");
  });

  it("treats IDs differing only in case as the same song", () => {
    expect(songRights([HEADER, ["BTH-001", "A", "No"], ["bth-001", "A", "Yes"]]).get("bth-001")).toBe("unknown");
  });

  it("keeps agreeing duplicates", () => {
    expect(songRights([HEADER, ["BTH-001", "A", "Yes"], ["BTH-001", "A", "Yes"]]).get("bth-001")).toBe("copyrighted");
  });

  it("carries the conflict into the parsed song", () => {
    const { songs } = readSheetMusic({ songs: [HEADER, ["BTH-001", "A", "No"], ["BTH-001", "A", "Yes"]], versions: [], drive: [] });
    expect(songs[0].rights).toBe("unknown");
  });
});

describe("what the browser is told about a withheld file", () => {
  const indexSong = {
    id: "BTH-001",
    rights: "cleared",
    versions: [
      { typeId: 1, label: "Standard", version: "1", keys: null, capoFret: null, files: [{ format: "pdf", slug: "open.pdf", driveFileId: "d1", md5: "aaaa", eligibility: "public" }] },
      { typeId: 2, label: "Secret Type", version: "1", keys: null, capoFret: null, files: [{ format: "pdf", slug: "secret.pdf", driveFileId: "d2", md5: "bbbb", eligibility: "withheld" }] },
    ],
  } as unknown as IndexSong;

  it("leaves it out entirely", () => {
    const view = toPublicSheetMusic(indexSong, (f) => f.eligibility === "public", (f) => `/x/${f.slug}?v=${f.md5}`, () => true);
    const text = JSON.stringify(view);
    expect(text).toContain("open.pdf");
    expect(text).not.toContain("secret.pdf");
    expect(text).not.toContain("Secret Type");
    expect(text).not.toContain("bbbb");
  });
});

describe("classify", () => {
  const sources = (rights: string) =>
    readSheetMusic({
      songs: [["Song ID", "Title", "Collection", "Hymn Number", "Copyrighted?"], ["BTH-001", "Song", "Hymns", "1", rights]],
      versions: [],
      drive: [
        { id: "root", name: "Sheet Music", mimeType: "application/vnd.google-apps.folder" },
        { id: "hymns", name: "Hymns", mimeType: "application/vnd.google-apps.folder", parents: ["root"] },
        { id: "f1", name: "001 - Song.pdf", mimeType: "application/pdf", parents: ["hymns"] },
      ],
    });
  const types = [{ id: 1, label: "Standard", sources: [["Hymns"]] }];

  it("marks files by the song's rights before activation", () => {
    expect(classify(sources("No"), types, "legacy").songs[0].versions[0].files[0].eligibility).toBe("public");
    expect(classify(sources("Needs Review"), types, "legacy").songs[0].versions[0].files[0].eligibility).toBe("restricted");
  });

  it("withholds a cleared song with no arrangement rule once enforcing", () => {
    expect(classify(sources("No"), types, "enforcing").songs[0].versions[0].files[0].eligibility).toBe("withheld");
  });

  it("makes a cleared song public once its folder is cleared", () => {
    const withRules = { ...sources("No"), fileRights: [{ fileId: null, path: ["hymns"], status: "cleared" as const }] };
    expect(classify(withRules, types, "enforcing").songs[0].versions[0].files[0].eligibility).toBe("public");
  });

  it("records the file's folder for the delivery check", () => {
    expect(classify(sources("No"), types, "legacy").songs[0].versions[0].files[0].parentId).toBe("hymns");
  });
});
