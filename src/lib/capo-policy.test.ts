import { describe, expect, it } from "vitest";

import {
  capoMissing,
  capoRequired,
  capoRequiredByKey,
  DEFAULT_CAPO_POLICY,
  isSongCapoRule,
  parseCapoPolicy,
  songNeedsCapo,
  type CapoRules,
} from "@/lib/capo-policy";
import type { IndexSong, SongVersion } from "@/lib/sheet-music";
import { canonicalKey, firstKey } from "@/lib/song-key";

const CAPO = 3;

function song(typeIds: number[], format: "pdf" | "musescore" = "pdf"): IndexSong {
  const versions: SongVersion[] = typeIds.map((typeId) => ({
    typeId,
    label: String(typeId),
    version: "1",
    keys: null,
    capoFret: null,
    files: [{ format, slug: `${typeId}.${format}`, driveFileId: "x" }],
  }));
  return {
    id: "S-1",
    title: "The Solid Rock",
    composer: null,
    lyricist: null,
    keys: null,
    type: null,
    collection: null,
    hymnNumber: null,
    category: null,
    occasion: null,
    source: null,
    rights: "cleared",
    versions,
  };
}

describe("a song's own key", () => {
  it("is the first key the Index lists", () => {
    expect(firstKey("G, Ab")).toBe("G");
    expect(firstKey("Eb / F")).toBe("Eb");
    expect(firstKey("  ")).toBeNull();
    expect(firstKey(null)).toBeNull();
  });

  it("prefers the Index to the catalog's usual key, which serves songs the Index lacks", () => {
    expect(canonicalKey({ indexKeys: "G, Ab", catalogKey: "F" })).toBe("G");
    expect(canonicalKey({ indexKeys: null, catalogKey: "F" })).toBe("F");
    expect(canonicalKey({ indexKeys: "", catalogKey: " " })).toBeNull();
    expect(canonicalKey({})).toBeNull();
  });
});

describe("the capo policy", () => {
  it("asks by default from one flat, or from three sharps", () => {
    expect(DEFAULT_CAPO_POLICY).toMatchObject({ minFlats: 1, minSharps: 3 });
    const needs = (key: string) => capoRequiredByKey(key, DEFAULT_CAPO_POLICY);
    // Flats: F has one.
    expect(["F", "Bb", "Eb", "Ab", "Db"].map(needs)).toEqual([true, true, true, true, true]);
    // No sharps or flats, one sharp, two sharps: none needed.
    expect(["C", "G", "D"].map(needs)).toEqual([false, false, false]);
    // Three sharps and more.
    expect(["A", "E", "B", "F#"].map(needs)).toEqual([true, true, true, true]);
  });

  it("reads a minor key by its own signature", () => {
    // D minor has one flat; E minor one sharp; F# minor three sharps.
    expect(capoRequiredByKey("Dm", DEFAULT_CAPO_POLICY)).toBe(true);
    expect(capoRequiredByKey("Em", DEFAULT_CAPO_POLICY)).toBe(false);
    expect(capoRequiredByKey("F#m", DEFAULT_CAPO_POLICY)).toBe(true);
  });

  it("follows changed thresholds, and a rule switched off", () => {
    expect(capoRequiredByKey("F", { minFlats: 2, minSharps: 3 })).toBe(false);
    expect(capoRequiredByKey("Bb", { minFlats: 2, minSharps: 3 })).toBe(true);
    expect(capoRequiredByKey("D", { minFlats: 1, minSharps: 2 })).toBe(true);
    expect(capoRequiredByKey("Eb", { minFlats: null, minSharps: 3 })).toBe(false);
    expect(capoRequiredByKey("E", { minFlats: 1, minSharps: null })).toBe(false);
  });

  it("asks for nothing when the key is unknown or cannot be read", () => {
    expect(capoRequiredByKey(null, DEFAULT_CAPO_POLICY)).toBe(false);
    expect(capoRequiredByKey("", DEFAULT_CAPO_POLICY)).toBe(false);
    expect(capoRequiredByKey("various", DEFAULT_CAPO_POLICY)).toBe(false);
  });

  it("lets one song's setting win over it", () => {
    expect(capoRequired("G", DEFAULT_CAPO_POLICY, "always")).toBe(true);
    expect(capoRequired("Eb", DEFAULT_CAPO_POLICY, "never")).toBe(false);
    expect(capoRequired("Eb", DEFAULT_CAPO_POLICY, "global")).toBe(true);
    expect(capoRequired(null, DEFAULT_CAPO_POLICY, "always")).toBe(true);
  });

  it("finds a song's setting by its title, however it is punctuated", () => {
    const rules: CapoRules = { policy: { ...DEFAULT_CAPO_POLICY, typeId: CAPO }, overrides: { "the solid rock": "never" } };
    expect(songNeedsCapo({ title: "The Solid Rock!", key: "Eb" }, rules)).toBe(false);
    expect(songNeedsCapo({ title: "Another Song", key: "Eb" }, rules)).toBe(true);
  });
});

describe("capo sheet music missing", () => {
  const rules: CapoRules = { policy: { ...DEFAULT_CAPO_POLICY, typeId: CAPO }, overrides: {} };
  const inKey = (key: string | null) => ({ title: "The Solid Rock", key });

  it("is a needed capo type with no PDF", () => {
    expect(capoMissing(song([1]), inKey("Eb"), rules)).toBe(true);
    expect(capoMissing(song([1, CAPO]), inKey("Eb"), rules)).toBe(false);
    // A MuseScore file alone is not something to play from.
    expect(capoMissing(song([CAPO], "musescore"), inKey("Eb"), rules)).toBe(true);
  });

  it("is never said of a song that needs none, or when no capo type is set", () => {
    expect(capoMissing(song([1]), inKey("G"), rules)).toBe(false);
    expect(capoMissing(song([1]), inKey(null), rules)).toBe(false);
    expect(capoMissing(song([1]), inKey("Eb"), { ...rules, policy: { ...rules.policy, typeId: null } })).toBe(false);
  });
});

describe("a stored policy", () => {
  it("falls back to the default for anything missing or out of range", () => {
    expect(parseCapoPolicy(null)).toEqual(DEFAULT_CAPO_POLICY);
    expect(parseCapoPolicy({ minFlats: 0, minSharps: 9, typeId: "x" })).toEqual(DEFAULT_CAPO_POLICY);
    expect(parseCapoPolicy({ minFlats: 2, minSharps: 4, typeId: 7 })).toEqual({ minFlats: 2, minSharps: 4, typeId: 7 });
  });

  it("keeps a rule that was switched off", () => {
    expect(parseCapoPolicy({ minFlats: null, minSharps: 3 })).toMatchObject({ minFlats: null, minSharps: 3 });
  });

  it("knows the three settings a song can have", () => {
    expect(["global", "always", "never"].every(isSongCapoRule)).toBe(true);
    expect(isSongCapoRule("sometimes")).toBe(false);
  });
});
