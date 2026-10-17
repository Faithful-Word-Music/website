import { describe, expect, it } from "vitest";

import { carriesInsert, diffSlots, followsWeek, insertSongs, planSong, slotSongs, withWeekInsert, type InsertWeek } from "./model";

const title = "All Hail the Power of Jesus' Name";
const hymn = (songId: string, number: string) => ({ songId, collection: "SSSH1989", title, number, key: "G" });
const insert = (songId: string, title = "A Psalm") => ({ songId, collection: "Psalms", title, number: null, key: "D" });
const week = (songId: string): InsertWeek => ({ ...insert(songId), weekStart: "2026-10-11", index: 1 });

describe("planned song identity", () => {
  it("carries identity through planner and public schedule serialization", () => {
    const reference = hymn("SSSH1989-168", "168");
    const planned = planSong(reference);
    expect(planned).toMatchObject(reference);
    expect(slotSongs([planned])).toEqual([reference]);
  });

  it("keeps both arrangements distinct in the change history", () => {
    const first = planSong(hymn("SSSH1989-167", "167"));
    const second = planSong(hymn("SSSH1989-168", "168"));
    expect(diffSlots([first, second], [second, first])).toEqual([
      { type: "moved", title, from: 2, to: 1 },
      { type: "moved", title, from: 1, to: 2 },
    ]);
    expect(diffSlots([first], [second]).map((change) => change.type)).toEqual(["removed", "added"]);
  });

  it("recognizes an edited title as the same explicit song", () => {
    const original = planSong(hymn("SSSH1989-168", "168"));
    expect(diffSlots([original], [{ ...original, title: "Corrected title" }])).toEqual([]);
  });

  it("retains weekly identities and permits two inserts with the same title", () => {
    const first = week("catalog-first");
    const result = withWeekInsert([first], first.weekStart, 2, insert("catalog-second"));
    expect(result?.map((item) => item.songId)).toEqual(["catalog-first", "catalog-second"]);
    expect(insertSongs([first])[0]).toMatchObject({ songId: first.songId, collection: "Psalms" });
  });

  it("rejects the same insert identity under another title", () => {
    const first = week("catalog-first");
    expect(withWeekInsert([first], first.weekStart, 2, insert(first.songId!, "Edited title"))).toBeNull();
    expect(followsWeek([planSong(insert("catalog-second"))], [first])).toBe(false);
    expect(carriesInsert([planSong(insert("catalog-second"))], [first])).toBe(false);
    expect(carriesInsert([planSong(insert(first.songId!, "Edited title"))], [first])).toBe(true);
  });

  it("uses known identity context when an unchanged weekly insert predates IDs", () => {
    const first = week("catalog-first");
    const legacy = { title: first.title, number: null, key: first.key };
    const entries = [{ id: first.songId!, title: first.title, number: null, collection: "Psalms" }];
    expect(followsWeek([planSong(legacy)], [first], entries)).toBe(true);
    expect(carriesInsert([planSong(legacy)], [first], entries)).toBe(true);
    expect(diffSlots([planSong(legacy)], [planSong(first)], entries)).toEqual([]);
    expect(withWeekInsert([first], first.weekStart, 2, legacy, entries)).toBeNull();
  });
});
