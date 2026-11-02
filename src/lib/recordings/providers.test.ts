import { describe, expect, it } from "vitest";

import { linkSource, safeLinkUrl } from "./links";
import { isPlaylistCapable, parseRecordingUrl, youtubeId } from "./providers";

describe("YouTube addresses", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s&list=PL1", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("reads %s", (url, id) => {
    expect(youtubeId(url)).toBe(id);
  });

  it.each([
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/channel/UC123",
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
    "https://drive.google.com/file/d/abc/view",
    "",
  ])("refuses %s", (url) => {
    expect(youtubeId(url)).toBeNull();
    expect(parseRecordingUrl(url)).toBeNull();
  });

  it("gives a clean address and the provider", () => {
    const found = parseRecordingUrl("https://youtu.be/dQw4w9WgXcQ?si=tracking");
    expect(found?.provider.id).toBe("youtube");
    expect(found?.canonicalUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(isPlaylistCapable("youtube")).toBe(true);
  });
});

describe("external media links", () => {
  it("accepts https and upgrades http", () => {
    expect(safeLinkUrl("https://drive.google.com/drive/folders/abc")).toBe("https://drive.google.com/drive/folders/abc");
    expect(safeLinkUrl("http://example.org/a.mp3")).toBe("https://example.org/a.mp3");
    expect(safeLinkUrl("example.org/a")).toBe("https://example.org/a");
  });

  it.each(["javascript:alert(1)", "data:text/html,hi", "ftp://example.org/x", "https://user:pass@example.org", "https://localhost", ""])(
    "refuses %s",
    (url) => {
      expect(safeLinkUrl(url)).toBeNull();
    },
  );

  it("names Google Drive", () => {
    expect(linkSource("https://drive.google.com/file/d/abc/view")).toBe("google-drive");
    expect(linkSource("https://docs.google.com/document/d/abc")).toBe("google-drive");
    expect(linkSource("https://example.org")).toBe("other");
  });
});
