import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config/site";
import type { CandidateSong } from "@/lib/service-planner/intelligence";
import { planSong } from "@/lib/service-planner/model";

import { buildBrief, describeCandidate, NO_LIBRARY, type PlanContext } from "./brief";
import { linkLibrary } from "./library";
import { isAiLocked, toggleAiLock } from "./locks";
import { planAiRequestSchema } from "./protocol";
import { christmasEligible } from "./season";
import { applyPlan, applySuggestions } from "./validate";

const HYMNAL = siteConfig.sheetMusic.hymnalCollection;
const title = "All Hail the Power of Jesus' Name";
const candidate = (number: string, key: string): CandidateSong => ({
  id: `SSSH1989-${number}`, songId: `SSSH1989-${number}`, title, number, collection: HYMNAL,
  plays: [], playCount: 3, upcoming: [], defaultKey: key, sheetMusic: "complete", christmas: false,
  isNew: false, inIndex: true, missingFor: [], missingForAll: false, capoFor: [],
});
const first = candidate("167", "G");
const second = candidate("168", "Ab");
const sung = (song = first) => planSong({ songId: song.id, title: song.title, number: song.number, collection: song.collection, key: song.defaultKey });
const context: PlanContext = {
  service: { date: "2026-10-18", slot: "AM", startsAt: "2026-10-18T10:30:00-07:00", label: null, special: false },
  revision: null, cancelled: false, frozen: false, candidates: [first, second], past: [], week: [],
};
const brief = (slots = [sung(), null], locked = [true, false]) => buildBrief({ mode: "generate", slots, locked, instruction: "" }, context, NO_LIBRARY, HYMNAL);

describe("AI planner arrangement identity", () => {
  it("keeps canonical identity through request validation and independently locks identically titled arrangements", () => {
    const request = planAiRequestSchema.parse({ mode: "generate", anchor: "2026-10-18-am", revision: null, slots: [sung(), sung(second)], locked: [true, false] });
    expect(request.slots[1]).toMatchObject({ songId: "SSSH1989-168", collection: HYMNAL });
    const locks = toggleAiLock(sung(), {});
    expect(isAiLocked(sung(), locks)).toBe(true);
    expect(isAiLocked(sung(second), locks)).toBe(false);
    expect(isAiLocked({ ...sung(), title: "A corrected display title" }, locks)).toBe(true);
  });

  it("round-trips long unresolved identities through the AI request protocol", () => {
    const songId = `legacy-t-${"ab".repeat(1000)}`;
    const request = planAiRequestSchema.parse({ mode: "generate", anchor: "2026-10-18-am", revision: null, slots: [{ songId, title: "Unindexed Song", number: null, collection: "Other Songs", key: "G" }], locked: [true] });
    expect(request.slots[0]?.songId).toBe(songId);
  });

  it("resolves a legacy locked place by number and offers the other arrangement independently", () => {
    const value = brief([planSong({ title, number: "167", key: "G" }), null]);
    expect(value.places[0].song?.id).toBe("SSSH1989-167");
    expect([...value.offered]).toEqual(["SSSH1989-168"]);
    const result = applyPlan(value, { places: [{ place: 2, songId: "SSSH1989-168" }], summary: "" });
    expect(result).toMatchObject({ ok: true, changed: [1], slots: [{ number: "167" }, { songId: "SSSH1989-168", number: "168", key: "Ab", collection: HYMNAL }] });
  });

  it("detects a repeated Song ID despite a stale display title", () => {
    const value = brief([{ ...sung(), title: "An old name" }, null]);
    expect(value.offered.has("SSSH1989-167")).toBe(false);
    expect(applyPlan(value, { places: [{ place: 2, songId: "SSSH1989-167" }], summary: "" }).ok).toBe(false);
  });

  it("suggests the other arrangement with its identity and key", () => {
    const value = buildBrief({ mode: "replace", target: 0, slots: [sung()], locked: [false], instruction: "" }, context, NO_LIBRARY, HYMNAL);
    expect(applySuggestions(value, { suggestions: [{ songId: "SSSH1989-168", reason: "Another arrangement." }] })).toMatchObject({ ok: true, suggestions: [{ songId: "SSSH1989-168", collection: HYMNAL, number: "168", key: "Ab" }] });
  });

  it("links lyrics by Song ID and never substitutes a same-title copy", () => {
    const library = [first, second].map((song) => ({ songId: song.id, title, titleKey: "all hail the power of jesus name", collection: HYMNAL, hymnNumber: song.number, status: "indexed" as const }));
    const links = linkLibrary([first, second], library, HYMNAL);
    expect(links.songOf.get("SSSH1989-168")?.hymnNumber).toBe("168");
    expect(links.candidateOf.get("SSSH1989-167")).toBe("SSSH1989-167");
    expect(linkLibrary([first], [library[1]], HYMNAL).songOf.size).toBe(0);
  });

  it("uses arrangement identity for this week's context and seasonal history", () => {
    const week = [{ date: "2026-10-18", service: "Sunday evening", status: "planned" as const, songs: [{ songId: second.id, title, number: "168", collection: HYMNAL }] }];
    const input = { startsAt: context.service.startsAt, hymnal: HYMNAL, week, openings: new Map() };
    expect(describeCandidate(first, input).inThisWeek).toBeUndefined();
    expect(describeCandidate(second, input).inThisWeek).toEqual(["Sunday evening"]);
    const past = [{ date: "2025-12-07", slot: "AM" as const, startsAt: "2025-12-07T10:30:00-07:00", songs: [sung()] }];
    expect([...christmasEligible({ candidates: [first, second], past, nativity: new Set() })]).toEqual(["SSSH1989-167"]);
  });
});
