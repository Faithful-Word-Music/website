import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveSheetEntitlement, type SheetFacts, type SheetResourceClass } from "@/lib/auth/sheet-entitlement";

const state = vi.hoisted(() => ({
  resource: "public" as string | null,
  viewer: null as unknown,
  viewerFails: false,
  blocked: false,
  confirmed: { md5: "abc123" } as { md5: string | null } | null,
  open: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/lib/song-archive", () => ({
  getIndexSongForPage: async () => ({
    ok: true,
    song: {
      id: "BTH-001",
      title: "Test Song",
      rights: "copyrighted",
      versions: [{ typeId: 1, label: "Standard", version: "1", keys: null, capoFret: null, files: [{ format: "pdf", slug: "standard-1.pdf", driveFileId: "secret-id" }] }],
    },
  }),
}));
vi.mock("@/lib/sheet-music-index", () => ({
  currentFileResource: async () => state.resource,
  confirmDriveFile: state.confirm,
  openDriveFile: state.open,
}));
vi.mock("@/lib/auth/session", () => ({
  getViewer: async () => {
    if (state.viewerFails) throw new Error("database down");
    return state.viewer;
  },
  isProfileBlocked: async () => state.blocked,
  PROFILE_INCOMPLETE: { error: "profile-incomplete", href: "/welcome" },
  sheetSubject: async (viewer: { sheet: unknown }) => ({ kind: "account", entitlement: viewer.sheet, profileBlocked: state.blocked }),
}));

const { GET } = await import("./route");

const accountWith = (facts: Partial<SheetFacts>) => ({
  sheet: resolveSheetEntitlement({ mode: "enforcing", roleKeys: [], rolePermissions: new Map([["librarian", ["manage_sheet_music"]]]), overrides: [], affiliation: null, ...facts }),
});
const call = (headers: HeadersInit = {}, file = "standard-1.pdf") =>
  GET(new Request("https://example.test/file", { headers }), {
    params: Promise.resolve({ song: "test-song", file }),
  } as never);

beforeEach(() => {
  state.resource = "public";
  state.viewer = null;
  state.viewerFails = false;
  state.blocked = false;
  state.open.mockReset().mockResolvedValue(new ReadableStream());
  state.confirm.mockReset().mockImplementation(async () => state.confirmed);
  state.confirmed = { md5: "abc123" };
});

describe("who gets the file", () => {
  it("serves a public file with no session, keeping it out of shared caches", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(response.headers.get("ETag")).toBe('"abc123"');
  });

  it("serves a restricted file to an entitled person, never stored", async () => {
    state.resource = "restricted";
    state.viewer = accountWith({ affiliation: "verified" });
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("ETag")).toBeNull();
  });

  it("opens a withheld file for a reviewer, never stored", async () => {
    state.resource = "withheld";
    state.viewer = accountWith({ roleKeys: ["librarian"] });
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each<[string, SheetResourceClass | null, unknown, number]>([
    ["rights unreadable", null, null, 503],
    ["restricted, signed out", "restricted", null, 401],
    ["restricted, External Member", "restricted", accountWith({}), 403],
    ["restricted, individually denied", "restricted", accountWith({ roleKeys: ["musician"], overrides: [{ permission: "view_sheet_music", effect: "deny" }] }), 403],
    ["withheld, signed out", "withheld", null, 401],
    ["withheld, entitled musician", "withheld", accountWith({ roleKeys: ["musician"] }), 403],
    ["withheld, denied reviewer", "withheld", accountWith({ roleKeys: ["librarian"], overrides: [{ permission: "view_sheet_music", effect: "deny" }] }), 403],
  ])("%s: refused without touching Drive", async (_name, resource, viewer, status) => {
    state.resource = resource;
    state.viewer = viewer;
    const response = await call();
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(state.confirm).not.toHaveBeenCalled();
    expect(state.open).not.toHaveBeenCalled();
  });

  it("refuses a profile-blocked account without touching Drive", async () => {
    state.resource = "restricted";
    state.blocked = true;
    state.viewer = accountWith({ affiliation: "verified" });
    expect((await call()).status).toBe(403);
    expect(state.open).not.toHaveBeenCalled();
  });

  it("answers 503, not sign-in, when the session cannot be read", async () => {
    state.resource = "restricted";
    state.viewerFails = true;
    expect((await call()).status).toBe(503);
    expect(state.open).not.toHaveBeenCalled();
  });

  it("does not fetch a file Drive no longer confirms", async () => {
    state.confirmed = null;
    expect((await call()).status).toBe(503);
    expect(state.open).not.toHaveBeenCalled();
  });

  it("never exposes the Drive ID", async () => {
    state.resource = "restricted";
    const response = await call();
    expect(await response.text()).not.toContain("secret-id");
  });
});

describe("browser revalidation", () => {
  it("answers 304 for an unchanged public file without fetching it", async () => {
    const response = await call({ "If-None-Match": '"abc123"' });
    expect(response.status).toBe(304);
    expect(state.open).not.toHaveBeenCalled();
  });

  it("does not answer 304 once the file has become restricted", async () => {
    state.resource = "restricted";
    expect((await call({ "If-None-Match": '"abc123"' })).status).toBe(401);
  });

  it("sends the file when the checksum has changed", async () => {
    expect((await call({ "If-None-Match": '"old"' })).status).toBe(200);
  });
});
