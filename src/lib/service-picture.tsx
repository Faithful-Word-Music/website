import { ImageResponse } from "next/og";

import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import {
  GOLD,
  GOLD_DARK,
  INK,
  INK_SOFT,
  LINE,
  loadMark,
  loadPictureFonts,
  MUTED,
  PAPER,
} from "@/lib/og";
import { inDateOrder } from "@/lib/share-services";
import { formatChurchTime, splitDateLabel } from "@/lib/service-time";
import { interLines, interWidth } from "@/lib/text-measure";
import type { Service } from "@/types/song-list";

/**
 * Services as a picture, for sending in a message: the spotlight card's look
 * - gold rule, serif date, songs with gold numbers and key badges - on a
 * phone-shaped portrait.
 *
 * One column, always. Pictures in a chat are seen on a phone held upright, a
 * few hundred points wide; two columns would halve every song line.
 *
 *   1 service    generous sizes, about 1080 x 1190
 *   2-3 services a compact set of the same design, so three still fit one
 *                phone screen (1080 x 2340 at most, an iPhone's shape),
 *                with a short gold rule opening each service after the first
 *
 * Satori needs the height up front, so it is worked out from the songs: row
 * heights are known, and titles that wrap are found with the same Inter
 * metrics the PDF uses. Any spare pixels fall above the footer.
 *
 * See src/lib/og.tsx for Satori's rules (flexbox only, fonts passed in).
 */

const WIDTH = 1080;

/** Every size in the layout, for each density, so the drawing and the sum agree. */
const SIZES = {
  single: {
    padX: 80,
    topRule: 12,
    padTop: 76,
    church: 24,
    churchLine: 34,
    churchGap: 60,
    eyebrow: 26,
    eyebrowLine: 36,
    dateGap: 10,
    date: 88,
    dateLine: 98,
    timeGap: 8,
    time: 34,
    timeLine: 48,
    listGap: 40,
    rowPad: 26,
    title: 40,
    line: 52,
    number: 46,
    numberColumn: 104,
    columnGap: 32,
    key: 32,
    keyPadX: 16,
    serviceGap: 0, // one service: nothing follows
    serviceRule: 0,
    serviceRuleGap: 0,
    footerGap: 88,
    footer: 56,
    footerText: 26,
    padBottom: 72,
  },
  compact: {
    padX: 72,
    topRule: 12,
    padTop: 60,
    church: 22,
    churchLine: 30,
    churchGap: 44,
    eyebrow: 23,
    eyebrowLine: 32,
    dateGap: 6,
    date: 64,
    dateLine: 72,
    timeGap: 4,
    time: 28,
    timeLine: 40,
    listGap: 24,
    rowPad: 16,
    title: 34,
    line: 44,
    number: 38,
    numberColumn: 88,
    columnGap: 28,
    key: 27,
    keyPadX: 14,
    serviceGap: 56,
    serviceRule: 3,
    serviceRuleGap: 28,
    footerGap: 64,
    footer: 48,
    footerText: 24,
    padBottom: 60,
  },
} as const;

type Size = (typeof SIZES)[keyof typeof SIZES];

const RULE = 2;

function sizeFor(count: number): Size {
  return count > 1 ? SIZES.compact : SIZES.single;
}

/** The key badge's width: its text, padding and border. */
function badgeWidth(key: string, s: Size): number {
  return interWidth(key, s.key) + s.keyPadX * 2 + 4;
}

/** Room a title has beside its number and key. */
function titleWidth(key: string | null, s: Size): number {
  const content = WIDTH - s.padX * 2;
  return content - s.numberColumn - s.columnGap - (key ? s.columnGap + badgeWidth(key, s) : 0);
}

type Row = { number: string | null; title: string; key: string | null; pending: boolean };

function rowsOf(service: Service): Row[] {
  return [
    ...service.songs.map((song) => ({ ...song, pending: false })),
    ...Array.from({ length: service.pendingSongs }, () => ({
      number: null,
      title: songListContent.states.pendingSong,
      key: null,
      pending: true,
    })),
  ];
}

function rowHeight(row: Row, s: Size): number {
  // Planned a little narrower than drawn: a title right at the edge is
  // counted as wrapping, so the picture is never too short for its songs.
  const lines = interLines(row.title, s.title, titleWidth(row.key, s) - 8);
  return RULE + s.rowPad * 2 + lines * s.line;
}

function serviceHeight(service: Service, s: Size, first: boolean): number {
  const opening = first ? 0 : s.serviceGap + s.serviceRule + s.serviceRuleGap;
  const rows = rowsOf(service).reduce((total, row) => total + rowHeight(row, s), 0);
  return (
    opening +
    s.eyebrowLine +
    s.dateGap +
    s.dateLine +
    s.timeGap +
    s.timeLine +
    s.listGap +
    RULE +
    rows
  );
}

/** The picture's height for these services. */
export function pictureHeight(services: Service[]): number {
  const s = sizeFor(services.length);
  const body = services.reduce(
    (total, service, index) => total + serviceHeight(service, s, index === 0),
    0,
  );
  return Math.ceil(
    s.topRule +
      s.padTop +
      s.churchLine +
      s.churchGap +
      body +
      s.footerGap +
      s.footer +
      s.padBottom +
      // Slack for rounding in the font renderer; it lands above the footer.
      16,
  );
}

export async function renderServicePicture(services: Service[]): Promise<ImageResponse> {
  const ordered = inDateOrder(services);
  const s = sizeFor(ordered.length);
  const [fonts, mark] = await Promise.all([loadPictureFonts(), loadMark()]);
  const height = pictureHeight(ordered);

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height,
          display: "flex",
          flexDirection: "column",
          backgroundColor: PAPER,
          fontFamily: "Inter",
          color: INK,
        }}
      >
        {/* The spotlight's gold rule across the top. */}
        <div style={{ display: "flex", height: s.topRule, backgroundColor: GOLD }} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            padding: `${s.padTop}px ${s.padX}px ${s.padBottom}px`,
          }}
        >
          <div
            style={{
              display: "flex",
              height: s.churchLine,
              alignItems: "center",
              fontSize: s.church,
              fontWeight: 600,
              letterSpacing: s.church * 0.17,
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            {siteConfig.church.name}
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: s.churchGap }}>
            {ordered.map((service, index) => (
              <ServiceBlock key={service.id} service={service} s={s} first={index === 0} />
            ))}
          </div>

          {/* Spare height gathers here, so the footer always sits at the bottom. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              height: s.footer,
              marginTop: "auto",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mark} width={s.footer} height={s.footer} alt="" />
            <div
              style={{
                display: "flex",
                fontSize: s.footerText,
                fontWeight: 500,
                letterSpacing: 1,
                color: MUTED,
              }}
            >
              {siteConfig.url.replace("https://", "")}/song-list
            </div>
          </div>
        </div>
      </div>
    ),
    { width: WIDTH, height, fonts },
  );
}

function ServiceBlock({ service, s, first }: { service: Service; s: Size; first: boolean }) {
  const { weekday, day } = splitDateLabel(service.dateLabel);
  const rows = rowsOf(service);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* After the first service, a short gold rule opens the next - an echo
          of the rule across the top, so each service reads as its own. */}
      {first ? null : (
        <div
          style={{
            display: "flex",
            width: 64,
            height: s.serviceRule,
            marginTop: s.serviceGap,
            marginBottom: s.serviceRuleGap,
            backgroundColor: GOLD,
          }}
        />
      )}

      <div
        style={{
          display: "flex",
          height: s.eyebrowLine,
          alignItems: "center",
          fontSize: s.eyebrow,
          fontWeight: 600,
          letterSpacing: s.eyebrow * 0.17,
          textTransform: "uppercase",
        }}
      >
        <span style={{ color: GOLD_DARK }}>{weekday ?? ""}</span>
        {weekday && service.serviceLabel ? <span style={{ color: MUTED }}>&nbsp;·&nbsp;</span> : null}
        <span style={{ color: MUTED }}>{service.serviceLabel ?? ""}</span>
      </div>

      <div
        style={{
          display: "flex",
          marginTop: s.dateGap,
          height: s.dateLine,
          alignItems: "center",
          fontFamily: "SourceSerif",
          fontSize: s.date,
          letterSpacing: s.date * -0.015,
        }}
      >
        {day ?? service.dateLabel ?? songListContent.undatedServiceLabel}
      </div>

      <div
        style={{
          display: "flex",
          marginTop: s.timeGap,
          height: s.timeLine,
          alignItems: "center",
          fontSize: s.time,
        }}
      >
        {service.startsAt ? (
          <>
            <span style={{ color: INK_SOFT }}>{formatChurchTime(service.startsAt)}</span>
            <span style={{ color: MUTED }}>&nbsp;{siteConfig.songList.timeZoneLabel}</span>
          </>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: s.listGap,
          borderTop: `${RULE}px solid ${LINE}`,
        }}
      >
        {rows.map((row, index) => (
          <SongRow key={index} row={row} s={s} />
        ))}
      </div>
    </div>
  );
}

function SongRow({ row, s }: { row: Row; s: Size }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: s.columnGap,
        padding: `${s.rowPad}px 0`,
        borderBottom: `${RULE}px solid ${LINE}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          width: s.numberColumn,
          flexShrink: 0,
          height: s.line,
          alignItems: "center",
          fontFamily: "SourceSerif",
          fontSize: s.number,
          color: GOLD_DARK,
        }}
      >
        {row.pending ? "" : (row.number ?? "·")}
      </div>

      <div
        style={{
          display: "flex",
          flexGrow: 1,
          flexShrink: 1,
          width: titleWidth(row.key, s),
          fontSize: s.title,
          lineHeight: `${s.line}px`,
          fontStyle: row.pending ? "italic" : "normal",
          color: row.pending ? MUTED : INK,
        }}
      >
        {row.title}
      </div>

      {row.key ? (
        <div
          style={{
            display: "flex",
            flexShrink: 0,
            height: s.line,
            alignItems: "center",
            padding: `0 ${s.keyPadX}px`,
            border: `2px solid ${LINE}`,
            borderRadius: 12,
            fontSize: s.key,
            fontWeight: 500,
            color: INK_SOFT,
          }}
        >
          {row.key}
        </div>
      ) : null}
    </div>
  );
}
