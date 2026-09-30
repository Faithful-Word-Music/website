import { describe, expect, it } from "vitest";

import { normalizePath } from "@/lib/page-path";

describe("normalizePath", () => {
  it("reads the regenerated home page as the home page", () => {
    expect(normalizePath("/index")).toBe("/");
    expect(normalizePath("/index/")).toBe("/");
  });

  it("strips a trailing /index from a nested route", () => {
    expect(normalizePath("/song-list/index")).toBe("/song-list");
  });

  it("leaves real paths alone", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/song-list")).toBe("/song-list");
    expect(normalizePath("/library/songs/indexed-hymn")).toBe("/library/songs/indexed-hymn");
  });
});
