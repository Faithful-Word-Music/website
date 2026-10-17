import { describe, expect, it, vi } from "vitest";

import type { DatedService, Service } from "@/types/song-list";

const data = vi.hoisted(() => ({ past: [] as DatedService[], upcoming: [] as DatedService[], services: [] as Service[] }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/schedule", () => ({ getSchedule: async () => ({ ok: true, months: [{ services: data.services }], published: data.upcoming }) }));
vi.mock("@/lib/song-archive", () => ({
  getReportInputs: async () => ({ past: data.past, upcoming: data.upcoming, loadedAt: 1, persistent: true }),
  songDirectory: async () => [],
}));
vi.mock("@/lib/sheet-music-index", () => ({ getSheetMusicIndex: async () => ({ ok: false, reason: "unavailable" }) }));

describe("dashboard history identity evidence", () => {
  it("identifies raw schedule and report references from existing history during an index outage", async () => {
    const raw = { title: "All Hail the Power of Jesus' Name", number: "168", collection: "Soul-Stirring Songs and Hymns 1989", key: "Ab" };
    data.past = [{ date: "2026-09-27", slot: "AM", startsAt: "2026-09-27T10:30:00-07:00", songs: [raw, { ...raw, songId: "SSSH1989-168" }] }];
    data.upcoming = [{ date: "2026-10-18", slot: "AM", startsAt: "2026-10-18T10:30:00-07:00", songs: [raw] }];
    data.services = [{ ...data.upcoming[0], id: "upcoming", dateLabel: "Sunday", serviceLabel: "Morning Service", pendingSongs: 0, plannedInserts: [raw] }];
    const { loadMusicData } = await import("./load");
    const music = await loadMusicData();
    expect(music.past[0].songs.map((song) => song.songId)).toEqual(["SSSH1989-168", "SSSH1989-168"]);
    expect(music.upcoming[0].songs[0].songId).toBe("SSSH1989-168");
    expect(music.services?.[0].songs[0].songId).toBe("SSSH1989-168");
    expect(music.services?.[0].plannedInserts?.[0].songId).toBe("SSSH1989-168");
    expect(raw).not.toHaveProperty("songId");
  });
});
