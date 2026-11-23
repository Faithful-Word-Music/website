import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveSheetEntitlement } from "@/lib/auth/sheet-entitlement";

const state = vi.hoisted(() => ({
  resources: {} as Record<string, string | null>,
  open: vi.fn(),
  built: [] as string[],
}));

const fileA = { format: "pdf", slug: "a.pdf", driveFileId: "drive-a", eligibility: "restricted" };
const fileB = { format: "pdf", slug: "b.pdf", driveFileId: "drive-b", eligibility: "restricted" };

vi.mock("@/lib/auth/session", () => ({
  getViewer: async () => ({
    env: "development",
    userId: "user_1",
    can: (permission: string) => permission === "view_sheet_music",
    sheet: resolveSheetEntitlement({ mode: "enforcing", roleKeys: ["musician"], rolePermissions: new Map(), overrides: [], affiliation: null }),
  }),
  isProfileBlocked: async () => false,
  PROFILE_INCOMPLETE: { error: "profile-incomplete", href: "/welcome" },
  sheetSubject: async (viewer: { sheet: unknown }) => ({ kind: "account", entitlement: viewer.sheet, profileBlocked: false }),
}));
vi.mock("@/lib/auth/store", () => ({ getSheetMusicTypes: async () => [1] }));
vi.mock("@/lib/schedule", () => ({
  getSchedule: async () => ({ ok: true, months: [{ services: [{ placeholder: false, date: "2026-12-06", slot: "AM", dateLabel: "Dec 6", serviceLabel: "AM" }] }] }),
}));
vi.mock("@/lib/site-search", () => ({ serviceAnchor: () => "2026-12-06-am" }));
vi.mock("@/lib/dashboard/coming-up", () => ({
  serviceSheets: () => [
    { number: "1", title: "A", found: { song: { id: "A-1", rights: "copyrighted" }, version: { typeId: 1, files: [fileA] } } },
    { number: "2", title: "B", found: { song: { id: "B-2", rights: "copyrighted" }, version: { typeId: 1, files: [fileB] } } },
  ],
}));
vi.mock("@/lib/sheet-music-type", () => ({
  pdfVersionsOfType: (song: { id: string }, _type: number, may: (file: unknown) => boolean) =>
    [song.id === "A-1" ? fileA : fileB].filter(may).map((file) => ({ version: { version: "1" }, file })),
}));
vi.mock("@/lib/sheet-music-index", () => ({
  getSheetMusicIndex: async () => ({ ok: true, index: { songs: [], types: [] } }),
  currentFileResource: async (_song: unknown, file: { slug: string }) => state.resources[file.slug],
  confirmDriveFile: async () => ({ md5: null }),
  openDriveFile: state.open,
}));
vi.mock("@/lib/service-sheet-pdf", () => ({
  buildServicePacket: async (_title: string, songs: Array<{ title: string }>) => {
    state.built = songs.map((song) => song.title);
    return new Uint8Array([1]);
  },
}));

const { GET } = await import("./route");
const call = () =>
  GET(new Request("https://example.test/packet"), { params: Promise.resolve({ service: "2026-12-06-am" }) } as never);

beforeEach(() => {
  state.resources = { "a.pdf": "restricted", "b.pdf": "restricted" };
  state.built = [];
  state.open.mockReset().mockImplementation(async () => new Response(new Uint8Array([1])).body);
});

describe("the service packet", () => {
  it("includes each file that is still allowed, never stored", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(state.built).toEqual(["A", "B"]);
  });

  it.each([["withheld"], [null]])("leaves out a file now %s, without asking Drive for it", async (resource) => {
    state.resources["b.pdf"] = resource;
    await call();
    expect(state.built).toEqual(["A"]);
    expect(state.open).toHaveBeenCalledTimes(1);
    expect(state.open).toHaveBeenCalledWith("drive-a");
  });

  it("sends nothing when no file is allowed", async () => {
    state.resources = { "a.pdf": "withheld", "b.pdf": "withheld" };
    expect((await call()).status).toBe(502);
    expect(state.open).not.toHaveBeenCalled();
  });
});
