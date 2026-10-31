import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Permission } from "@/lib/auth/permissions";

/**
 * Context checks against stand-ins for the planner, the published schedule,
 * the song directory, the song leaders' board and the sheet music index.
 */
const data = vi.hoisted(() => ({
  plans: new Map<string, unknown>(),
  published: [] as unknown[],
  board: [] as unknown[],
  directory: [] as Array<{ id: string; title: string; number: string | null; collection: string | null }>,
  index: { songs: [] as unknown[], types: [] as unknown[] },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/service-planner/store", () => ({ getPlan: async (_env: string, date: string, slot: string) => data.plans.get(`${date}|${slot}`) ?? null }));
vi.mock("@/lib/schedule", () => ({ getSchedule: async () => ({ ok: true, months: [], published: data.published }) }));
vi.mock("@/lib/song-archive", () => ({ songDirectory: async () => data.directory }));
vi.mock("@/lib/leadership/load", () => ({ loadBoard: async () => ({ services: data.board, people: new Map(), exceptions: new Map() }) }));
vi.mock("@/lib/sheet-music-index", () => ({ getSheetMusicIndex: async () => ({ ok: true, index: data.index }) }));

const { resolveContext, serviceSongChoices } = await import("./context-load");

const NOW = Date.parse("2026-11-01T12:00:00-07:00");
const actor = (...permissions: Permission[]) => ({ userId: "user_john", can: (permission: Permission) => permissions.includes(permission) });
const member = actor("submit_support_requests", "view_sheet_music");
const planner = actor("submit_support_requests", "manage_service_plans");
const SHEPHERD = "The Lord’s My Shepherd";

const song = (title: string, number: string | null, key: string | null = "G", songId?: string) => ({ title, number, key, ...(songId ? { songId } : {}) });
function plan(status: string, slots: unknown[], places: string[], revision = 4) {
  return { date: "2026-11-08", slot: "AM", label: null, startsAt: "2026-11-08T10:30:00-07:00", status, slots, places, revision };
}

beforeEach(() => {
  data.plans.clear();
  data.published = [];
  data.board = [];
  data.directory = [
    { id: "BTH-012", title: "Holy, Holy, Holy", number: "12", collection: "BTH" },
    { id: "PS-023", title: SHEPHERD, number: null, collection: "Psalms" },
    { id: "ALT-023", title: SHEPHERD, number: null, collection: "Alt" },
  ];
  data.index = { songs: [], types: [] };
});

describe("the song a report is about", () => {
  it("keeps the song in the place as it was, by place ID, even when the same song is in the service twice", async () => {
    data.plans.set("2026-11-08|AM", plan("published", [song("Holy, Holy, Holy", "12", "Eb", "BTH-012"), null, song("Holy, Holy, Holy", "12", "D", "BTH-012")], ["a", "b", "c"]));
    const second = await resolveContext("development", member, "wrong_key", { service: "2026-11-08-am", placeId: "c" }, NOW);
    expect(second.ok && second.context.place).toEqual({ placeId: "c", position: 3, song: expect.objectContaining({ songId: "BTH-012", key: "D" }) });
    // From the song list: the second song (empty places are not counted there), checked against the song shown.
    const listed = await resolveContext("development", member, "wrong_key", { service: "2026-11-08-am", position: 2, songId: "BTH-012" }, NOW);
    expect(listed.ok && listed.context.place?.placeId).toBe("c");
    expect(listed.ok && listed.context.service?.planRevision).toBe(4);
  });

  it("refuses a song list that changed since the page showed it: reordered, replaced or removed", async () => {
    data.plans.set("2026-11-08|AM", plan("published", [song(SHEPHERD, null, "F", "PS-023"), song("Holy, Holy, Holy", "12", "Eb", "BTH-012")], ["b", "a"]));
    expect(await resolveContext("development", member, "wrong_key", { service: "2026-11-08-am", position: 1, songId: "BTH-012" }, NOW)).toEqual({ ok: false, reason: "changed" });
    expect(await resolveContext("development", member, "wrong_key", { service: "2026-11-08-am", placeId: "gone" }, NOW)).toEqual({ ok: false, reason: "changed" });
    expect(await resolveContext("development", member, "wrong_key", { service: "2026-11-08-am", position: 3, songId: "BTH-012" }, NOW)).toEqual({ ok: false, reason: "changed" });
  });

  it("tells apart two songs with the same title by their identity, never by the title", async () => {
    data.plans.set("2026-11-08|AM", plan("published", [song(SHEPHERD, null, "F", "ALT-023")], ["a"]));
    expect(await resolveContext("development", member, "wrong_key", { service: "2026-11-08-am", position: 1, songId: "PS-023" }, NOW)).toEqual({ ok: false, reason: "changed" });
    const right = await resolveContext("development", member, "wrong_key", { service: "2026-11-08-am", position: 1, songId: "ALT-023" }, NOW);
    expect(right.ok && right.context.place?.song?.songId).toBe("ALT-023");
  });

  it("marks an older record whose identity cannot be settled, rather than guessing", async () => {
    data.plans.set("2026-11-08|AM", plan("published", [song(SHEPHERD, null, "F")], ["a"]));
    const result = await resolveContext("development", member, "wrong_key", { service: "2026-11-08-am", placeId: "a" }, NOW);
    expect(result.ok && result.context.place?.song?.unresolved).toBe(true);
  });

  it("refuses a song the site does not know", async () => {
    expect(await resolveContext("development", member, "missing_sheet_music", { songId: "NOPE-1" }, NOW)).toEqual({ ok: false, reason: "missing" });
    const known = await resolveContext("development", member, "missing_sheet_music", { songId: "bth-012" }, NOW);
    expect(known.ok && known.context.song).toEqual({ songId: "BTH-012", title: "Holy, Holy, Holy", number: "12", collection: "BTH" });
  });
});

describe("what may be reported on", () => {
  it("keeps a draft's songs from anyone who does not plan services", async () => {
    data.plans.set("2026-11-08|AM", plan("draft", [song("Holy, Holy, Holy", "12", "Eb", "BTH-012")], ["a"]));
    expect(await resolveContext("development", member, "wrong_key", { service: "2026-11-08-am", placeId: "a" }, NOW)).toEqual({ ok: false, reason: "hidden" });
    expect(await serviceSongChoices("development", member, "2026-11-08-am", NOW)).toBeNull();
    const planned = await resolveContext("development", planner, "wrong_key", { service: "2026-11-08-am", placeId: "a" }, NOW);
    expect(planned.ok && planned.context.restricted).toBe(true);
  });

  it("lets a leader report their own assignment in a draft - positions only, never its songs", async () => {
    data.plans.set("2026-11-08|AM", plan("draft", [song("Holy, Holy, Holy", "12", "Eb", "BTH-012"), song(SHEPHERD, null, "F", "PS-023")], ["a", "b"]));
    data.board = [
      {
        anchor: "2026-11-08-am",
        date: "2026-11-08",
        slot: "AM",
        startsAt: "2026-11-08T10:30:00-07:00",
        label: "Secret Special",
        status: "draft",
        places: ["a", "b"],
        songs: null,
        leadership: { defaultUserId: null, overrides: { b: { kind: "assigned", userId: "user_john" } }, revision: 7 },
      },
    ];
    const result = await resolveContext("development", member, "leader_assignment", { service: "2026-11-08-am", leadership: true }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.context.leadership).toEqual({ revision: 7, positions: [2] });
    expect(result.context.restricted).toBe(true);
    expect(JSON.stringify(result.context)).not.toContain("Holy");
    expect(result.context.place).toBeUndefined();
    // Someone who leads nothing there cannot use it to look.
    const other = { ...member, userId: "user_mary" };
    expect(await resolveContext("development", other, "leader_assignment", { service: "2026-11-08-am", leadership: true }, NOW)).toEqual({ ok: false, reason: "hidden" });
  });

  it("offers only sheet music the person could open", async () => {
    const file = { format: "pdf", slug: "standard-1.pdf", driveFileId: "secret-drive-id" };
    data.index = { songs: [{ id: "BTH-012", rights: "copyrighted", versions: [{ typeId: 1, label: "Standard", version: "1", keys: null, capoFret: null, files: [file] }] }], types: [] };
    const asMember = await resolveContext("development", member, "wrong_sheet_music", { songId: "BTH-012", file: "standard-1.pdf" }, NOW);
    expect(asMember.ok && asMember.context.sheetMusic).toEqual({ file: "standard-1.pdf", label: "Standard", format: "pdf" });
    expect(JSON.stringify(asMember)).not.toContain("secret-drive-id");
    const publicOnly = actor("submit_support_requests");
    expect(await resolveContext("development", publicOnly, "wrong_sheet_music", { songId: "BTH-012", file: "standard-1.pdf" }, NOW)).toEqual({ ok: false, reason: "hidden" });
    expect(await resolveContext("development", member, "wrong_sheet_music", { songId: "BTH-012", file: "other.pdf" }, NOW)).toEqual({ ok: false, reason: "missing" });
  });
});
