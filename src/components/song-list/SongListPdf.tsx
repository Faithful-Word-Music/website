import "server-only";

import { join } from "node:path";

import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { formatChurchTime, splitDateLabel } from "@/lib/service-time";
import {
  COLUMN_WIDTH_PT,
  firstYear,
  layoutMonth,
  PDF_METRICS,
  PDF_PAGE,
} from "@/lib/song-list-pdf";
import type { Service, SongListMonth } from "@/types/song-list";

/**
 * The song list as a PDF: the month laid out like the spreadsheet's own
 * printout, on one Letter page. Served by /song-list/pdf/[month].
 *
 *   - Every service in the month, in date order - earlier ones included.
 *   - Nothing live: no Next/Now, no hints, no search or key filter. A printout
 *     is the month, not the moment.
 *   - Services run down the left column and then the right, as in the sheet.
 *
 * Why a PDF rather than the browser's print: every browser prints HTML its own
 * way (iOS Safari rescales and re-margins it onto two pages), while a PDF is
 * the same page everywhere. Sizes are in points, the unit of a printed page.
 * Row height and the column split come from layoutMonth(), which fits the
 * month to the page.
 */

const INK = "#111111";
const MUTED = "#666666";
const PENDING = "#777777";
const RULE_LIGHT = "#d4d4d4";
const ROW_RULE = "#e2e2e2";

/*
 * The site's own typefaces, as static TTFs (react-pdf reads TTF and WOFF, not
 * the WOFF2 next/font serves). Each path is written out in full, so the
 * bundler can see at build time exactly which files ship with the route.
 */

Font.register({
  family: "Inter",
  fonts: [
    { src: join(process.cwd(), "assets/fonts/Inter-Regular.ttf"), fontWeight: 400 },
    { src: join(process.cwd(), "assets/fonts/Inter-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
    { src: join(process.cwd(), "assets/fonts/Inter-Medium.ttf"), fontWeight: 500 },
    { src: join(process.cwd(), "assets/fonts/Inter-SemiBold.ttf"), fontWeight: 600 },
  ],
});
Font.register({
  family: "Source Serif",
  fonts: [{ src: join(process.cwd(), "assets/fonts/SourceSerif4-Regular.ttf"), fontWeight: 400 }],
});
// Titles and dates are never broken with a hyphen - a word that does not fit
// moves to the next line whole.
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: PDF_PAGE.paddingX,
    paddingVertical: PDF_PAGE.paddingY,
    fontFamily: "Inter",
    color: INK,
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: INK,
    alignItems: "center",
  },
  heading: {
    fontFamily: "Source Serif",
    fontSize: 20,
    lineHeight: 1.15,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 7.5,
    letterSpacing: 1.5,
    color: MUTED,
    textTransform: "uppercase",
  },
  columns: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  column: {
    width: COLUMN_WIDTH_PT,
  },
  divider: {
    width: 0.5,
    backgroundColor: RULE_LIGHT,
  },
  serviceHeader: {
    flexDirection: "row",
    // Yoga has no baseline alignment, so every part of the line shares one
    // 14pt line box and the smaller type is nudged down onto the date's
    // baseline (Inter sits 0.36em below the middle of its line box).
    alignItems: "flex-start",
    paddingHorizontal: 3,
    paddingBottom: 2,
    borderBottomWidth: 0.75,
    borderBottomColor: INK,
  },
  slot: {
    width: 22, // the 16pt tag plus the 6pt gap before the date
    fontSize: 7.5,
    fontWeight: 600,
    lineHeight: "14pt",
    top: 0.73, // (9.5 - 7.5) x 0.36; `top` moves the text without growing the line
    letterSpacing: 0.6,
    color: MUTED,
  },
  date: {
    flexGrow: 1,
    fontSize: 9.5,
    fontWeight: 600,
    lineHeight: "14pt",
  },
  time: {
    fontSize: 8,
    lineHeight: "14pt",
    top: 0.55, // (9.5 - 8) x 0.36
    color: MUTED,
  },
  songs: {
    paddingTop: 3.5,
  },
  row: {
    flexDirection: "row",
    fontSize: PDF_METRICS.songSizePt,
  },
  rowRule: {
    borderBottomWidth: PDF_METRICS.rowRulePt,
    borderBottomColor: ROW_RULE,
  },
  number: {
    width: PDF_METRICS.numberColumnPt,
    paddingLeft: 3,
    color: MUTED,
    fontFeatureSettings: ["tnum"],
  },
  title: {
    flex: 1,
    paddingRight: PDF_METRICS.titlePaddingPt,
  },
  pending: {
    flex: 1,
    fontStyle: "italic",
    color: PENDING,
  },
  key: {
    width: PDF_METRICS.keyColumnPt,
    paddingRight: 3,
    textAlign: "right",
    fontWeight: 500,
    fontFeatureSettings: ["tnum"],
  },
  note: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: RULE_LIGHT,
    textAlign: "center",
    fontSize: 8,
    fontStyle: "italic",
    color: MUTED,
  },
});

export function SongListPdf({ month }: { month: SongListMonth }) {
  const { rowPt, gapPt, left, right } = layoutMonth(month);
  const year = firstYear(month);
  const heading = month.heading ?? month.title;
  const subtitle = `${siteConfig.church.name}${year ? ` · ${year}` : ""}`;

  return (
    <Document
      title={heading}
      author={siteConfig.church.name}
      subject={songListContent.title}
      creator={siteConfig.name}
      producer={siteConfig.name}
      language="en-US"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <View style={styles.columns}>
          <Column services={left} rowPt={rowPt} gapPt={gapPt} />
          {right.length > 0 ? <View style={styles.divider} /> : null}
          <Column services={right} rowPt={rowPt} gapPt={gapPt} />
        </View>

        {month.note ? <Text style={styles.note}>{month.note}</Text> : null}
      </Page>
    </Document>
  );
}

function Column({ services, rowPt, gapPt }: { services: Service[]; rowPt: number; gapPt: number }) {
  return (
    <View style={styles.column}>
      {services.map((service, index) => (
        <ServiceBlock
          key={service.id}
          service={service}
          rowPt={rowPt}
          gapAfter={index < services.length - 1 ? gapPt : 0}
        />
      ))}
    </View>
  );
}

function ServiceBlock({
  service,
  rowPt,
  gapAfter,
}: {
  service: Service;
  rowPt: number;
  gapAfter: number;
}) {
  const { weekday, day } = splitDateLabel(service.dateLabel);
  const date = weekday && day ? `${weekday}, ${day}` : service.dateLabel;
  const lineHeight = `${rowPt}pt`;
  const rows = service.songs.length + service.pendingSongs;

  return (
    // Never split across columns or pages: a service moves whole, or not at all.
    <View wrap={false} style={{ marginBottom: gapAfter }}>
      <View style={styles.serviceHeader}>
        {service.slot ? <Text style={styles.slot}>{service.slot}</Text> : null}
        <Text style={styles.date}>{date || songListContent.undatedServiceLabel}</Text>
        {service.startsAt ? (
          <Text style={styles.time}>{formatChurchTime(service.startsAt)}</Text>
        ) : null}
      </View>

      <View style={styles.songs}>
        {service.songs.map((song, index) => (
          <View
            key={index}
            style={[styles.row, { lineHeight }, index < rows - 1 ? styles.rowRule : {}]}
          >
            <Text style={styles.number}>{song.number ?? ""}</Text>
            <Text style={styles.title}>{song.title}</Text>
            <Text style={styles.key}>{song.key ?? ""}</Text>
          </View>
        ))}
        {Array.from({ length: service.pendingSongs }, (_, index) => (
          <View
            key={`pending-${index}`}
            style={[
              styles.row,
              { lineHeight },
              service.songs.length + index < rows - 1 ? styles.rowRule : {},
            ]}
          >
            <Text style={styles.number} />
            <Text style={styles.pending}>{songListContent.states.pendingSong}</Text>
            <Text style={styles.key} />
          </View>
        ))}
      </View>
    </View>
  );
}
