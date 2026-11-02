import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The recording actions' permissions: each checks its own on the server
 * (withPermission), and nothing is read or written for someone without it.
 * withPermission itself is tested with the accounts; here it is stood in for
 * by one that holds a fixed set of permissions.
 */

const state = vi.hoisted(() => ({ permissions: new Set<string>() }));
const store = vi.hoisted(() => ({
  insertRecording: vi.fn(),
  updateRecording: vi.fn(),
  deleteRecording: vi.fn(),
  setPrimaryRecording: vi.fn(),
  insertMediaLink: vi.fn(),
  updateMediaLink: vi.fn(),
  deleteMediaLink: vi.fn(),
  getRecording: vi.fn(),
  saveSelection: vi.fn(),
}));
const planner = vi.hoisted(() => ({ getPlan: vi.fn() }));
const oembed = vi.hoisted(() => ({ youtubeOembed: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ updateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  withPermission: async (permission: string, action: (viewer: unknown) => Promise<unknown>) => {
    if (!state.permissions.has(permission)) return { ok: false, error: "forbidden" };
    return action({ userId: "user_1", env: "development", can: (p: string) => state.permissions.has(p) });
  },
}));
vi.mock("@/lib/recordings/store", () => store);
vi.mock("@/lib/recordings/load", () => ({ RECORDINGS_TAG: "recordings" }));
vi.mock("@/lib/recordings/oembed", () => oembed);
vi.mock("@/lib/schedule", () => ({ SCHEDULE_TAG: "schedule" }));
vi.mock("@/lib/service-planner/store", () => planner);

const ID = "11111111-1111-4111-8111-111111111111";
const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

beforeEach(() => {
  state.permissions = new Set();
  for (const fn of [...Object.values(store), planner.getPlan, oembed.youtubeOembed]) fn.mockReset();
  oembed.youtubeOembed.mockResolvedValue({ ok: true, title: "Amazing Grace", authorName: "Faithful Word Baptist Church" });
});

async function actions() {
  return import("./actions");
}

describe("recording actions refuse anyone without manage_songs", () => {
  const calls: Array<[string, (a: Awaited<ReturnType<typeof actions>>) => Promise<{ ok: boolean }>]> = [
    ["lookUpRecording", (a) => a.lookUpRecording({ url: YT })],
    ["addRecording", (a) => a.addRecording({ songId: "S1", url: YT, title: "t" })],
    ["updateRecording", (a) => a.updateRecording({ id: ID, title: "t" })],
    ["deleteRecording", (a) => a.deleteRecording({ id: ID })],
    ["setPrimaryRecording", (a) => a.setPrimaryRecording({ songId: "S1", recordingId: ID })],
    ["addMediaLink", (a) => a.addMediaLink({ songId: "S1", url: "https://drive.google.com/x", title: "t" })],
    ["editMediaLink", (a) => a.editMediaLink({ id: ID, url: "https://drive.google.com/x", title: "t" })],
    ["removeMediaLink", (a) => a.removeMediaLink({ id: ID })],
  ];

  it.each(calls)("%s", async (_, call) => {
    // A planner alone may choose recordings for services, not change the songs' own.
    state.permissions = new Set(["manage_service_plans"]);
    const result = await call(await actions());
    expect(result).toEqual({ ok: false, error: "forbidden" });
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("choosing a recording for a service", () => {
  it("needs manage_service_plans", async () => {
    state.permissions = new Set(["manage_songs"]);
    const { setServiceRecording } = await actions();
    expect(await setServiceRecording({ anchor: "2026-11-08-am", placeId: "n1", planRevision: 2, recordingId: ID })).toEqual({ ok: false, error: "forbidden" });
    expect(store.saveSelection).not.toHaveBeenCalled();
  });

  it("refuses a recording of a different song than the one in that place", async () => {
    state.permissions = new Set(["manage_service_plans"]);
    planner.getPlan.mockResolvedValue({
      status: "draft",
      startsAt: "2099-11-08T10:30:00-08:00",
      revision: 2,
      places: ["n1"],
      slots: [{ title: "Amazing Grace", number: "1", key: "G", songId: "S1", insert: false }],
    });
    store.getRecording.mockResolvedValue({ id: ID, songId: "S2" });
    const { setServiceRecording } = await actions();
    const result = await setServiceRecording({ anchor: "2099-11-08-am", placeId: "n1", planRevision: 2, recordingId: ID });
    expect(result.ok).toBe(false);
    expect(store.saveSelection).not.toHaveBeenCalled();
  });

  it("refuses when the service changed since the page was read", async () => {
    state.permissions = new Set(["manage_service_plans"]);
    planner.getPlan.mockResolvedValue({ status: "draft", startsAt: "2099-11-08T10:30:00-08:00", revision: 3, places: ["n1"], slots: [{ title: "A", number: "1", key: null, songId: "S1" }] });
    const { setServiceRecording } = await actions();
    const result = await setServiceRecording({ anchor: "2099-11-08-am", placeId: "n1", planRevision: 2, recordingId: null });
    expect(result.ok).toBe(false);
    expect(store.saveSelection).not.toHaveBeenCalled();
  });

  it("saves a choice for the song in that place", async () => {
    state.permissions = new Set(["manage_service_plans"]);
    planner.getPlan.mockResolvedValue({ status: "published", startsAt: "2099-11-08T10:30:00-08:00", revision: 2, places: ["n1"], slots: [{ title: "A", number: "1", key: null, songId: "S1" }] });
    store.getRecording.mockResolvedValue({ id: ID, songId: "S1" });
    store.saveSelection.mockResolvedValue({ ok: true });
    const { setServiceRecording } = await actions();
    expect((await setServiceRecording({ anchor: "2099-11-08-am", placeId: "n1", planRevision: 2, recordingId: ID })).ok).toBe(true);
    expect(store.saveSelection).toHaveBeenCalledWith(
      "development",
      { date: "2099-11-08", slot: "AM", placeId: "n1", songId: "S1", recordingId: ID },
      2,
      "user_1",
    );
  });
});

describe("adding recordings", () => {
  it("refuses an address no supported player can play, before anything is saved", async () => {
    state.permissions = new Set(["manage_songs"]);
    const { addRecording } = await actions();
    const result = await addRecording({ songId: "S1", url: "https://drive.google.com/file/d/abc/view", title: "Practice audio" });
    expect(result.ok).toBe(false);
    expect(store.insertRecording).not.toHaveBeenCalled();
  });

  it("refuses a private or embed-disabled video", async () => {
    state.permissions = new Set(["manage_songs"]);
    oembed.youtubeOembed.mockResolvedValue({ ok: false, reason: "not-embeddable" });
    const { addRecording } = await actions();
    expect((await addRecording({ songId: "S1", url: YT, title: "t" })).ok).toBe(false);
    expect(store.insertRecording).not.toHaveBeenCalled();
  });

  it("stores the clean address and fills in the channel as the source", async () => {
    state.permissions = new Set(["manage_songs"]);
    store.insertRecording.mockResolvedValue({ ok: true, recording: { id: ID } });
    const { addRecording } = await actions();
    await addRecording({ songId: "S1", url: "https://youtu.be/dQw4w9WgXcQ?si=x", title: "Amazing Grace" });
    expect(store.insertRecording).toHaveBeenCalledWith(
      "development",
      expect.objectContaining({ provider: "youtube", mediaId: "dQw4w9WgXcQ", sourceUrl: YT, sourceName: "Faithful Word Baptist Church", visibility: "public" }),
      "user_1",
    );
  });

  it("refuses an unsafe external link", async () => {
    state.permissions = new Set(["manage_songs"]);
    const { addMediaLink } = await actions();
    expect((await addMediaLink({ songId: "S1", url: "javascript:alert(1)", title: "x" })).ok).toBe(false);
    expect(store.insertMediaLink).not.toHaveBeenCalled();
  });
});
