import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetLinks, linksKey, loadLinks } from "./next-service-links";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const links = { anchor: "2026-11-08-am", sheetMusicHref: "/dashboard/sheet-music/2026-11-08-am" };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  forgetLinks();
  fetchMock = vi.fn(async () => ok(links));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("linksKey", () => {
  it("names the person and their permissions; null when signed out", () => {
    expect(linksKey("user_1", true, new Set(["b", "a"]))).toBe("user_1|a,b");
    expect(linksKey("user_1", false, new Set())).toBeNull();
    expect(linksKey(null, true, new Set())).toBeNull();
  });
});

describe("loadLinks", () => {
  it("fetches privately, without the browser's cache", async () => {
    expect(await loadLinks("user_1|")).toEqual(links);
    expect(fetchMock).toHaveBeenCalledWith("/api/account/next-service", { cache: "no-store", credentials: "same-origin" });
  });

  it("reuses the answer for the same person while fresh, and asks again once stale", async () => {
    await loadLinks("user_1|", 1_000);
    await loadLinks("user_1|", 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await loadLinks("user_1|", 1_000 + 2 * 60_000 + 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never hands one person's links to another", async () => {
    await loadLinks("user_1|");
    fetchMock.mockImplementationOnce(async () => ok({ anchor: "2026-11-08-am", sheetMusicHref: null }));
    expect(await loadLinks("user_2|")).toEqual({ anchor: "2026-11-08-am", sheetMusicHref: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks again when the same person's permissions change", async () => {
    await loadLinks("user_1|view_sheet_music");
    await loadLinks("user_1|");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("signing out forgets them, and asks nothing", async () => {
    await loadLinks("user_1|");
    expect(await loadLinks(null)).toBeNull();
    await loadLinks("user_1|");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("forgetLinks(key) keeps only that person's", async () => {
    await loadLinks("user_1|");
    forgetLinks("user_1|");
    await loadLinks("user_1|");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    forgetLinks("user_2|");
    await loadLinks("user_1|");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("an ended session (401) gives nothing, and nothing is kept", async () => {
    fetchMock.mockImplementationOnce(async () => new Response("{}", { status: 401 }));
    expect(await loadLinks("user_1|")).toBeNull();
    await loadLinks("user_1|");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a network failure gives nothing, and nothing is kept", async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError("offline");
    });
    expect(await loadLinks("user_1|")).toBeNull();
    await loadLinks("user_1|");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("offers only a link to the person's own sheet music PDF from the answer", async () => {
    fetchMock.mockImplementationOnce(async () => ok({ anchor: "2026-11-08-am", sheetMusicHref: "https://example.com/x" }));
    expect(await loadLinks("user_1|")).toEqual({ anchor: "2026-11-08-am", sheetMusicHref: null });
    forgetLinks();
    fetchMock.mockImplementationOnce(async () => ok({ anchor: 7, sheetMusicHref: "/dashboard/sheet-music/../admin" }));
    expect(await loadLinks("user_1|")).toEqual({ anchor: null, sheetMusicHref: null });
  });
});
