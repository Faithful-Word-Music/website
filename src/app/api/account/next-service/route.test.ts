import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Service } from "@/types/song-list";

/** What the route's sources answer, set per test. */
const state = vi.hoisted(() => ({
  viewer: null as null | { userId: string; env: string; can: (p: string) => boolean },
  viewerThrows: false,
  blocked: false,
  types: [] as number[],
  scheduleOk: true,
  indexOk: true,
  services: [] as unknown[],
  packetFor: null as null | ((args: { sheetTypes: number[]; viewer: unknown }) => { href: string } | null),
}));

vi.mock("@/lib/auth/session", () => ({
  getViewer: vi.fn(async () => {
    if (state.viewerThrows) throw new Error("session lookup failed");
    return state.viewer;
  }),
  isProfileBlocked: vi.fn(async () => state.blocked),
}));
vi.mock("@/lib/auth/store", () => ({ getSheetMusicTypes: vi.fn(async () => state.types) }));
vi.mock("@/lib/schedule", () => ({
  getSchedule: vi.fn(async () => (state.scheduleOk ? { ok: true, months: [{ services: state.services }] } : { ok: false, reason: "down" })),
}));
vi.mock("@/lib/sheet-music-index", () => ({
  getSheetMusicIndex: vi.fn(async () => (state.indexOk ? { ok: true, index: { types: [] } } : { ok: false })),
}));
vi.mock("@/lib/dashboard/coming-up", () => ({
  servicePacket: vi.fn((_service: unknown, options: { sheetTypes: number[]; viewer: unknown }) => state.packetFor?.(options) ?? null),
}));

const { GET } = await import("./route");

const soon = new Date(Date.now() + 2 * 86_400_000);
const date = soon.toISOString().slice(0, 10);
const nextService: Service = {
  id: `${date}-am`,
  dateLabel: date,
  serviceLabel: null,
  slot: "AM",
  date,
  startsAt: soon.toISOString(),
  songs: [],
  pendingSongs: 0,
};

const member = (...permissions: string[]) => ({ userId: "user_1", env: "development", can: (p: string) => permissions.includes(p) });

beforeEach(() => {
  Object.assign(state, {
    viewer: member(),
    viewerThrows: false,
    blocked: false,
    types: [3],
    scheduleOk: true,
    indexOk: true,
    services: [nextService],
    packetFor: () => ({ href: `/dashboard/sheet-music/${date}-am` }),
  });
});

async function call() {
  const response = await GET();
  return { status: response.status, cache: response.headers.get("Cache-Control"), body: await response.json() };
}

describe("GET /api/account/next-service", () => {
  it("gives the person their own sheet music link for the next service, never cached anywhere shared", async () => {
    expect(await call()).toEqual({
      status: 200,
      cache: "private, no-store",
      body: { anchor: `${date}-am`, sheetMusicHref: `/dashboard/sheet-music/${date}-am` },
    });
  });

  it("401 with no session, or an expired one - and no links", async () => {
    state.viewer = null;
    const result = await call();
    expect(result.status).toBe(401);
    expect(result.body.sheetMusicHref).toBeUndefined();
    expect(result.cache).toBe("private, no-store");
  });

  it("no link while the profile is overdue (the PDF route refuses them too)", async () => {
    state.blocked = true;
    expect((await call()).body).toEqual({ anchor: null, sheetMusicHref: null });
  });

  it("no link without sheet music types assigned", async () => {
    state.types = [];
    expect((await call()).body).toEqual({ anchor: null, sheetMusicHref: null });
  });

  it("no link when none of the service's songs has their music", async () => {
    state.packetFor = () => null;
    expect((await call()).body).toEqual({ anchor: `${date}-am`, sheetMusicHref: null });
  });

  it("checks files as a member only for someone holding view_sheet_music", async () => {
    const seen: unknown[] = [];
    state.packetFor = ({ viewer }) => {
      seen.push(viewer);
      return null;
    };
    await call();
    state.viewer = member("view_sheet_music");
    await call();
    expect(seen).toEqual([{ kind: "public" }, { kind: "member" }]);
  });

  it("503 and no link when the schedule or the Index cannot be read", async () => {
    state.scheduleOk = false;
    expect(await call()).toMatchObject({ status: 503, body: { sheetMusicHref: null } });
    state.scheduleOk = true;
    state.indexOk = false;
    expect(await call()).toMatchObject({ status: 503, body: { sheetMusicHref: null } });
  });

  it("no link with nothing coming", async () => {
    state.services = [];
    expect((await call()).body).toEqual({ anchor: null, sheetMusicHref: null });
  });

  it("500 and no link when something fails, without leaking why", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.viewerThrows = true;
    const result = await call();
    expect(result).toMatchObject({ status: 500, body: { anchor: null, sheetMusicHref: null } });
    expect(JSON.stringify(result.body)).not.toContain("session lookup failed");
  });
});
