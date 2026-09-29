import { describe, expect, it } from "vitest";

import { keySignature } from "@/lib/key-signature";

describe("keySignature", () => {
  it("reads major keys", () => {
    expect(keySignature("C")).toMatchObject({ count: 0, accidentals: [], mode: "major", relative: "Am" });
    expect(keySignature("F")).toMatchObject({ count: -1, accidentals: ["B♭"], relative: "Dm" });
    expect(keySignature("Ab")).toMatchObject({ count: -4, accidentals: ["B♭", "E♭", "A♭", "D♭"], relative: "Fm" });
    expect(keySignature("D")).toMatchObject({ count: 2, accidentals: ["F♯", "C♯"], relative: "Bm" });
    expect(keySignature("F# major")).toMatchObject({ count: 6, relative: "D♯m" });
  });

  it("reads minor keys however they are written", () => {
    expect(keySignature("Cm")).toMatchObject({
      count: -3,
      accidentals: ["B♭", "E♭", "A♭"],
      mode: "minor",
      relative: "E♭",
    });
    expect(keySignature("F♯ minor")).toMatchObject({ count: 3, relative: "A" });
    expect(keySignature("E aeolian")).toMatchObject({ count: 1, mode: "minor", relative: "G" });
    expect(keySignature("B flat")).toMatchObject({ count: -2 });
  });

  it("reads modes, relating each to the major key with the same notes", () => {
    expect(keySignature("C Dorian")).toMatchObject({ count: -2, mode: "dorian", relative: "B♭" });
    expect(keySignature("E Phrygian")).toMatchObject({ count: 0, relative: "C" });
    expect(keySignature("F Lydian")).toMatchObject({ count: 0, relative: "C" });
    expect(keySignature("D Mixolydian")).toMatchObject({ count: 1, relative: "G" });
    expect(keySignature("B Locrian")).toMatchObject({ count: 0, relative: "C" });
  });

  it("spells the scale from the key signature", () => {
    expect(keySignature("Cm")?.scale).toEqual(["C", "D", "E♭", "F", "G", "A♭", "B♭", "C"]);
    expect(keySignature("D")?.scale).toEqual(["D", "E", "F♯", "G", "A", "B", "C♯", "D"]);
    expect(keySignature("Ab")).toMatchObject({ letter: "A", scale: ["A♭", "B♭", "C", "D♭", "E♭", "F", "G", "A♭"] });
    expect(keySignature("C Dorian")?.scale).toEqual(["C", "D", "E♭", "F", "G", "A", "B♭", "C"]);
  });

  it("leaves what it cannot read alone", () => {
    expect(keySignature("C Blues")).toBeNull();
    expect(keySignature("")).toBeNull();
    expect(keySignature("Fb")).toBeNull();
  });
});
