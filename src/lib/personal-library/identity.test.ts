import { describe, expect, it } from "vitest";

import { songIdentity } from "@/lib/song-identity";

import { buildPersonalDirectory, describeStoredSong, resolvePersonalSong, type PersonalDirectory } from "./identity";

const CATALOG = "catalog-7b0f8f4e-1111-4222-8333-444455556666";
const LINKED = "catalog-aaaaaaaa-1111-4222-8333-444455556666";

const directory = buildPersonalDirectory(
  ["SSSH1989-167", "SSSH1989-168", "PS-019-7-10"],
  [
    { songId: CATALOG, catalogId: CATALOG },
    { songId: "SSSH1989-167", catalogId: LINKED },
  ],
);
const down: PersonalDirectory = { status: "unavailable" };

describe("resolvePersonalSong", () => {
  it("accepts a current index ID, whole", () => {
    expect(resolvePersonalSong("PS-019-7-10", directory)).toEqual({ status: "ok", songId: "PS-019-7-10", storedIds: ["PS-019-7-10"] });
  });

  it("accepts a persisted catalog identity", () => {
    expect(resolvePersonalSong(CATALOG, directory)).toMatchObject({ status: "ok", songId: CATALOG });
  });

  it("resolves a persisted alias to its canonical song and keeps both spellings", () => {
    expect(resolvePersonalSong(LINKED, directory)).toEqual({
      status: "ok",
      songId: "SSSH1989-167",
      storedIds: ["SSSH1989-167", LINKED],
    });
  });

  it("keeps two arrangements of one title apart", () => {
    const a = resolvePersonalSong("SSSH1989-167", directory);
    const b = resolvePersonalSong("SSSH1989-168", directory);
    expect(a).toMatchObject({ songId: "SSSH1989-167" });
    expect(b).toMatchObject({ songId: "SSSH1989-168" });
  });

  it("rejects titles and fabricated IDs", () => {
    expect(resolvePersonalSong("all hail the power", directory).status).toBe("unknown");
    expect(resolvePersonalSong("catalog-00000000-0000-4000-8000-000000000000", directory).status).toBe("unknown");
    expect(resolvePersonalSong("", directory).status).toBe("unknown");
    expect(resolvePersonalSong(42, directory).status).toBe("unknown");
    expect(resolvePersonalSong("x".repeat(201), directory).status).toBe("unknown");
  });

  it("rejects both forms of legacy identity as not durable, even in an outage", () => {
    const numbered = songIdentity({ title: "Song", number: "12", collection: "Other" });
    const titled = songIdentity({ title: "Song", collection: "Other" });
    expect(numbered).toMatch(/^legacy-n-/);
    expect(titled).toMatch(/^legacy-t-/);
    for (const id of [numbered, titled]) {
      expect(resolvePersonalSong(id, directory).status).toBe("not-durable");
      expect(resolvePersonalSong(id, down).status).toBe("not-durable");
    }
  });

  it("never treats a legacy alias as a persisted one", () => {
    const legacy = songIdentity({ title: "Song", number: "12", collection: "Other" });
    const withLegacy: PersonalDirectory = { status: "ok", entries: [{ id: "A-1", aliases: [legacy] }] };
    expect(resolvePersonalSong("A-1", withLegacy)).toEqual({ status: "ok", songId: "A-1", storedIds: ["A-1"] });
    expect(describeStoredSong(legacy, withLegacy).state).toBe("unavailable");
  });

  it("refuses an alias claimed by two songs rather than choosing one", () => {
    const clash: PersonalDirectory = {
      status: "ok",
      entries: [{ id: "A-1", aliases: ["shared-id"] }, { id: "B-1", aliases: ["shared-id"] }],
    };
    expect(resolvePersonalSong("shared-id", clash).status).toBe("ambiguous");
    expect(describeStoredSong("shared-id", clash).state).toBe("ambiguous");
  });

  it("reports an outage instead of saying the song does not exist", () => {
    expect(resolvePersonalSong("SSSH1989-167", down).status).toBe("directory-unavailable");
  });
});

describe("describeStoredSong", () => {
  it("separates a missing song from an outage", () => {
    expect(describeStoredSong("GONE-1", directory)).toEqual({ state: "unavailable" });
    expect(describeStoredSong("SSSH1989-167", down)).toEqual({ state: "unknown" });
  });

  it("shows an old alias as its canonical song without changing the stored key", () => {
    expect(describeStoredSong(LINKED, directory)).toEqual({ state: "available", songId: "SSSH1989-167" });
  });
});
