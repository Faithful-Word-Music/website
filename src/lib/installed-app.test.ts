import { describe, expect, it } from "vitest";

import { fileNameFromDisposition, isPdfPath, PULL_MAX, pullDistance } from "./installed-app";

describe("isPdfPath", () => {
  it("knows the site's PDFs", () => {
    expect(isPdfPath("/library/songs/the-solid-rock/sheet-music/standard-1.pdf")).toBe(true);
    expect(isPdfPath("/dashboard/sheet-music/2026-10-04-am")).toBe(true);
    expect(isPdfPath("/song-list/pdf/october-2026")).toBe(true);
  });

  it("leaves everything else alone", () => {
    expect(isPdfPath("/library/songs/the-solid-rock/sheet-music/standard-1.mscz")).toBe(false);
    expect(isPdfPath("/library/songs/the-solid-rock")).toBe(false);
    expect(isPdfPath("/dashboard")).toBe(false);
    expect(isPdfPath("/song-list")).toBe(false);
  });
});

describe("fileNameFromDisposition", () => {
  it("prefers the UTF-8 name", () => {
    expect(
      fileNameFromDisposition(`inline; filename="Its Well - Standard.pdf"; filename*=UTF-8''It%E2%80%99s%20Well%20-%20Standard.pdf`),
    ).toBe("It’s Well - Standard.pdf");
  });

  it("falls back to the plain name", () => {
    expect(fileNameFromDisposition(`inline; filename="October 2026.pdf"`)).toBe("October 2026.pdf");
    expect(fileNameFromDisposition(`attachment; filename=song.pdf`)).toBe("song.pdf");
  });

  it("returns null without a name", () => {
    expect(fileNameFromDisposition(null)).toBeNull();
    expect(fileNameFromDisposition("inline")).toBeNull();
  });
});

describe("pullDistance", () => {
  it("moves at half speed, never below zero or past the limit", () => {
    expect(pullDistance(-40)).toBe(0);
    expect(pullDistance(100)).toBe(50);
    expect(pullDistance(1000)).toBe(PULL_MAX);
  });
});
