import { describe, expect, it } from "vitest";

import { insertWeekSchema, saveServiceSchema } from "./forms";
import { songIdentity } from "@/lib/song-identity";

describe("planner action identity", () => {
  const song = { songId: "SSSH1989-168", title: "All Hail the Power of Jesus' Name", number: "168", collection: "Soul-Stirring Songs and Hymns 1989", key: "Ab" };

  it("preserves arrangement identity when validating service saves", () => {
    const parsed = saveServiceSchema.parse({ anchor: "2026-10-18-am", revision: null, slots: [song] });
    expect(parsed.slots[0]).toEqual(song);
  });

  it("preserves unnumbered arrangement identity when validating weekly inserts", () => {
    const insert = { ...song, songId: "catalog-00000000-0000-4000-8000-000000000001", number: null };
    expect(insertWeekSchema.parse({ weekStart: "2026-10-18", song: insert }).song).toEqual(insert);
  });

  it("accepts generated legacy identities for the longest permitted Unicode title and collection", () => {
    const ref = { title: "楽".repeat(200), collection: "歌".repeat(120), number: null, key: "D" };
    const insert = { ...ref, songId: songIdentity(ref) };
    expect(saveServiceSchema.safeParse({ anchor: "2026-10-18-am", revision: null, slots: [insert] }).success).toBe(true);
    expect(insertWeekSchema.safeParse({ weekStart: "2026-10-18", song: insert }).success).toBe(true);
  });
});
