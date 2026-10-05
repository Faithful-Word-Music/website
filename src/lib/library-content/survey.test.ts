import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { JWT } from "google-auth-library";
import { describe, expect, it } from "vitest";

import { sheetsFromDrive, type DriveItem } from "@/lib/sheet-music";

import { sectionsFromScore, type LyricSection } from "./lyrics";
import { extractLyrics, readMscz } from "./musescore";

/**
 * A survey of the REAL library, for whoever changes the lyric rules: it reads
 * every Standard MuseScore file in Drive and prints what the extractor makes
 * of each, grouped by shape, with the odd ones listed. Not a test of anything
 * (it needs the service account and takes a minute), so it only runs when
 * asked for:
 *
 *   LIBRARY_SURVEY=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run src/lib/library-content/survey.test.ts
 *
 * LIBRARY_SURVEY="<words>|<words>" also prints the full sections of every
 * song whose file name contains any of them. Files are kept in the system's temporary folder
 * between runs.
 */

const wanted = process.env.LIBRARY_SURVEY ?? "";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

const shape = (sections: LyricSection[]) => {
  const count = (kind: string) => sections.filter((section) => section.kind === kind).length;
  return [
    count("section") ? `s${count("section")}` : "",
    count("verse") ? `v${count("verse")}` : "",
    count("refrain") ? "r" : "",
    count("part") ? `p${count("part")}` : "",
  ]
    .filter(Boolean)
    .join("+");
};

describe.skipIf(wanted === "")("the library's MuseScore files", () => {
  it("are read into sections", { timeout: 600_000 }, async () => {
    const client = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // As src/lib/google-auth.ts reads it (that module is server-only).
      key: (process.env.GOOGLE_PRIVATE_KEY ?? "").trim().replace(/^"([\s\S]*)"$/, "$1").replace(/\\n/g, "\n").replace(/\r/g, ""),
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    const { token } = await client.getAccessToken();
    const headers = { Authorization: `Bearer ${token}` };

    const items: DriveItem[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ q: "trashed = false", fields: "nextPageToken,files(id,name,mimeType,parents,modifiedTime)", pageSize: "1000" });
      if (pageToken) params.set("pageToken", pageToken);
      const page = (await (await fetch(`${DRIVE}?${params}`, { headers })).json()) as { files?: DriveItem[]; nextPageToken?: string };
      items.push(...(page.files ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);

    const files = sheetsFromDrive(items).filter(
      (file) => file.format === "musescore" && file.folders.includes("Standard") && !file.folders.includes("Chords"),
    );
    const cache = join(tmpdir(), "fwm-library-survey");
    mkdirSync(cache, { recursive: true });

    const shapes = new Map<string, number>();
    const odd: string[] = [];
    const detail: string[] = [];
    let failed = 0;

    const read = async (file: (typeof files)[number]) => {
      const name = `${file.number ? `${file.number} ` : ""}${file.title} [${file.folders.at(-3) ?? file.folders[0]}]`;
      try {
        const path = join(cache, `${file.driveFileId}-${Date.parse(file.modifiedTime) || 0}.mscz`);
        let bytes: Uint8Array;
        if (existsSync(path)) bytes = readFileSync(path);
        else {
          bytes = new Uint8Array(await (await fetch(`${DRIVE}/${file.driveFileId}?alt=media`, { headers })).arrayBuffer());
          writeFileSync(path, bytes);
        }
        const score = extractLyrics(readMscz(bytes));
        const sections = sectionsFromScore(score);
        const key = shape(sections) || "none";
        shapes.set(key, (shapes.get(key) ?? 0) + 1);

        const verses = sections.filter((section) => section.kind === "verse").map((section) => section.text.split(" ").length);
        const streams = new Set(score.syllables.map((syllable) => `${syllable.staff}|${syllable.voice}`)).size;
        const notes = [
          sections.length === 0 ? "no lyrics" : "",
          sections.some((section) => section.kind === "part") ? "other voice kept" : "",
          verses.length > 1 && Math.max(...verses) > Math.min(...verses) * 1.6 ? `verses uneven (${verses.join("/")})` : "",
          new Set(score.syllables.map((syllable) => syllable.line)).size > 1 && verses.length === 0 ? "lines not numbered" : "",
        ].filter(Boolean);
        if (notes.length > 0) odd.push(`${name}: ${key} v${score.version} streams=${streams} - ${notes.join("; ")}`);
        if (wanted !== "1" && wanted.toLowerCase().split("|").some((words) => name.toLowerCase().includes(words))) {
          detail.push(`\n=== ${name} (${key}, v${score.version}, markers: ${score.markers.map((marker) => marker.text).join(" | ")})`);
          for (const section of sections) detail.push(`[${section.kind}${section.number ?? ""}] ${section.text}`);
        }
      } catch (error) {
        failed += 1;
        odd.push(`${name}: FAILED - ${error instanceof Error ? error.message : "unknown"}`);
      }
    };

    for (let at = 0; at < files.length; at += 12) await Promise.all(files.slice(at, at + 12).map(read));

    console.log(
      [
        `${files.length} Standard MuseScore files, ${failed} failed`,
        ...[...shapes].sort((a, b) => b[1] - a[1]).map(([key, count]) => `${String(count).padStart(5)}  ${key}`),
        "",
        ...odd.sort(),
        ...detail,
      ].join("\n"),
    );
    expect(files.length).toBeGreaterThan(0);
  });
});
