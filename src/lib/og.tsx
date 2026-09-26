import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { siteConfig } from "@/config/site";

/**
 * The social share card - the image that shows when a link to the site is
 * pasted into a message, Slack, Facebook or X.
 *
 * It mirrors the hero deliberately, so a shared link looks like the page it
 * opens: the forte mark, the wordmark sitting on a faded stave, the gold italic
 * line beneath.
 *
 * ---------------------------------------------------------------------------
 * WORKING WITHIN SATORI
 * ---------------------------------------------------------------------------
 * ImageResponse renders through Satori, which is not a browser:
 *
 *   - Flexbox only. No grid, and no `mask-image` - which is why the stave here
 *     is drawn as bars that fade via their own linear-gradient, rather than
 *     reusing the masked `.staff-lines` class from globals.css.
 *   - Every element with more than one child needs an explicit `display: flex`.
 *   - Fonts must be passed in. Satori cannot read WOFF2, which is what
 *     next/font downloads, so the site's own font files cannot be reused -
 *     hence the WOFF subsets in assets/fonts. Satori reads WOFF and TTF.
 *   - Without fonts it silently falls back to the Geist that @vercel/og
 *     bundles, which renders fine and looks nothing like the site. If the card
 *     ever comes out in a sans-serif, that is what happened.
 *
 * The images are generated at build time, so none of this costs anything at
 * runtime.
 */

/**
 * Tokens, mirroring src/app/globals.css. Satori cannot read CSS variables.
 * Shared with the song list's service picture (src/lib/service-picture.tsx).
 */
export const PAPER = "#faf9f6";
export const SURFACE = "#ffffff";
export const INK = "#111111";
export const INK_SOFT = "#2a2a28";
export const MUTED = "#6b6b68";
export const LINE = "#e5e5e2";
export const GOLD = "#b08d57";
export const GOLD_DARK = "#84683f";
const STAFF = "#d2d1ca";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

/*
 * Every file below is read with a literal `join(process.cwd(), "...")`, the
 * pattern in Next's ImageResponse docs. The bundler reads these paths at build
 * time to know which files each function needs. A helper that assembles the
 * path from arguments hides it, and the bundler then ships the whole project.
 */

async function loadFonts() {
  const [serif, serifItalic, sans] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/SourceSerif4-SemiBold.woff")),
    readFile(join(process.cwd(), "assets/fonts/SourceSerif4-Italic.woff")),
    readFile(join(process.cwd(), "assets/fonts/Inter-Medium.woff")),
  ]);

  return [
    { name: "SourceSerif", data: serif, style: "normal" as const, weight: 600 as const },
    { name: "SourceSerif", data: serifItalic, style: "italic" as const, weight: 400 as const },
    { name: "Inter", data: sans, style: "normal" as const, weight: 500 as const },
  ];
}

/**
 * The fonts for the service picture: the song list's own weights, in full
 * TTF (the WOFFs above are subsets cut for the share cards' few words).
 */
export async function loadPictureFonts() {
  const [serif, regular, italic, medium, semibold] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/SourceSerif4-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Inter-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Inter-Italic.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Inter-Medium.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Inter-SemiBold.ttf")),
  ]);

  return [
    { name: "SourceSerif", data: serif, style: "normal" as const, weight: 400 as const },
    { name: "Inter", data: regular, style: "normal" as const, weight: 400 as const },
    { name: "Inter", data: italic, style: "italic" as const, weight: 400 as const },
    { name: "Inter", data: medium, style: "normal" as const, weight: 500 as const },
    { name: "Inter", data: semibold, style: "normal" as const, weight: 600 as const },
  ];
}

/**
 * The mark is read from the favicon rather than redrawn here, so there is one
 * source of truth: change the logo and the share card follows automatically.
 * Width and height are injected because a bare viewBox leaves the SVG with no
 * intrinsic size for the rasteriser to work from.
 */
export async function loadMark() {
  const svg = await readFile(join(process.cwd(), "src/app/icon.svg"), "utf8");
  const sized = svg.replace("<svg ", '<svg width="64" height="64" ');
  return `data:image/svg+xml;base64,${Buffer.from(sized).toString("base64")}`;
}

/** Five stave rules, fading out at both ends, sitting behind the title. */
function Stave() {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 16,
      }}
    >
      {[0, 1, 2, 3, 4].map((line) => (
        <div
          key={line}
          style={{
            height: 2,
            backgroundImage: `linear-gradient(90deg, rgba(210,209,202,0) 0%, ${STAFF} 7%, ${STAFF} 93%, rgba(210,209,202,0) 100%)`,
          }}
        />
      ))}
    </div>
  );
}

export async function renderOgCard({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const [fonts, mark] = await Promise.all([loadFonts(), loadMark()]);

  return new ImageResponse(
    (
      <div
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: PAPER,
          fontFamily: "SourceSerif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mark} width={88} height={88} alt="" />

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 1100,
            marginTop: 48,
          }}
        >
          <Stave />
          <div
            style={{
              position: "relative",
              display: "flex",
              fontSize: title.length > 24 ? 66 : 78,
              fontWeight: 600,
              color: INK,
              letterSpacing: "-0.02em",
              // Keeps the stave from running right up against the letters.
              padding: "0 28px",
              backgroundColor: PAPER,
            }}
          >
            {title}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 34,
            fontSize: 30,
            fontStyle: "italic",
            fontWeight: 400,
            color: GOLD_DARK,
          }}
        >
          {subtitle}
        </div>

        <div style={{ display: "flex", width: 132, height: 2, backgroundColor: GOLD, marginTop: 52 }} />

        <div
          style={{
            display: "flex",
            marginTop: 26,
            fontFamily: "Inter",
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: "0.14em",
            color: MUTED,
          }}
        >
          {siteConfig.url.replace("https://", "")}
        </div>
      </div>
    ),
    { width: CARD_WIDTH, height: CARD_HEIGHT, fonts },
  );
}
