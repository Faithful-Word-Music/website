import "server-only";

import { join } from "node:path";

import { Document, Font, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { formatChurchTime } from "@/lib/service-time";
import { serviceSlots } from "@/lib/song-list";
import {
  COLUMN_WIDTH_PT,
  firstYear,
  LEADER_SIZE_PT,
  leaderColumn,
  shortLeaderName,
  layoutMonth,
  PDF_METRICS,
  type PrintedLeaders,
  PDF_PAGE,
  printedServiceDate,
} from "@/lib/song-list-pdf";
import { dashboardContent } from "@/content/dashboard";
import type { CardLeader, CardLeaderView } from "@/lib/leadership/board";
import { GUEST_NAME } from "@/lib/leadership/model";
import type { Service, SongListMonth } from "@/types/song-list";

/**
 * The song list as a PDF: each month laid out as the printed song list has
 * always been, on one Letter page. Served by /song-list/pdf/[month], and by
 * the Service Planner's export for any range of months.
 *
 *   - Every service in the month, in date order - earlier ones included.
 *   - Nothing live: no Next/Now, no hints, no search or key filter. A printout
 *     is the month, not the moment.
 *   - Services run down the left column and then the right, as the printed list always has.
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
    paddingTop: PDF_PAGE.paddingY,
    // Room for the footer, on every page a long month runs to.
    paddingBottom: PDF_PAGE.paddingY + PDF_METRICS.footerPt,
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
    fontSize: LEADER_SIZE_PT,
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
    fontSize: LEADER_SIZE_PT,
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
  /** Beside the date: who leads the whole service. */
  serviceLeader: {
    fontSize: 8,
    fontWeight: 400,
    color: MUTED,
  },
  /** Before the key: who leads each song, right-aligned so the names line up (leaderColumn sets its width). */
  leader: {
    fontSize: LEADER_SIZE_PT,
    color: MUTED,
    textAlign: "right",
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
  footer: {
    position: "absolute",
    bottom: PDF_PAGE.paddingY,
    left: PDF_PAGE.paddingX,
    right: PDF_PAGE.paddingX,
    textAlign: "center",
    fontSize: 7,
    letterSpacing: 0.3,
    color: MUTED,
  },
  footerLink: {
    color: MUTED,
    textDecoration: "none",
  },
});

// "faithfulwordmusic.com", as printed in the footer.
const SITE_LABEL = siteConfig.url.replace(/^https?:\/\//, "");

/**
 * The song list as a PDF: one page per month (a very full month runs on),
 * laid out like the song list itself. The public month PDF passes one month;
 * the Service Planner's export passes as many as the range covers.
 */
export function SongListPdf({
  months,
  title,
  leaders,
}: {
  months: SongListMonth[];
  title?: string;
  /**
   * Who leads each service's songs, by service id (cardLeaderView) - only in
   * the signed-in PDF (/api/account/song-list-pdf). Never in the public one.
   */
  leaders?: Readonly<Record<string, CardLeaderView>>;
}) {
  const heading = title ?? months[0]?.heading ?? months[0]?.title ?? songListContent.title;
  return (
    <Document
      title={heading}
      author={siteConfig.church.name}
      subject={songListContent.title}
      creator={siteConfig.name}
      producer={siteConfig.name}
      language="en-US"
    >
      {months.map((month) => (
        <MonthPage key={month.title} month={month} leaders={leaders ?? {}} />
      ))}
    </Document>
  );
}

function MonthPage({ month, leaders }: { month: SongListMonth; leaders: Readonly<Record<string, CardLeaderView>> }) {
  // Who leads each song, printed after its title when several people lead the service - measured
  // with the title, so the page still fits (layoutMonth).
  const printed: PrintedLeaders = new Map(
    Object.entries(leaders)
      .filter(([, view]) => !view.service)
      .map(([id, view]) => [id, Object.keys(view.rows).map(Number).sort((a, b) => a - b).map((position) => printedName(view.rows[position]))]),
  );
  const { rowPt, gapPt, left, right } = layoutMonth(month, printed);
  const year = firstYear(month);
  const heading = month.heading ?? month.title;
  const subtitle = `${siteConfig.church.name}${year ? ` · ${year}` : ""}`;

  return (
    <Page size="LETTER" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.columns}>
        <Column services={left} rowPt={rowPt} gapPt={gapPt} leaders={leaders} />
        {right.length > 0 ? <View style={styles.divider} /> : null}
        <Column services={right} rowPt={rowPt} gapPt={gapPt} leaders={leaders} />
      </View>


      {/* Where the printout came from, and who to ask - on every page. */}
      <Text fixed style={styles.footer}>
        <Link src={siteConfig.url} style={styles.footerLink}>
          {SITE_LABEL}
        </Link>
        {"  ·  "}
        <Link src={`mailto:${siteConfig.contactEmail}`} style={styles.footerLink}>
          {siteConfig.contactEmail}
        </Link>
      </Text>
    </Page>
  );
}

function Column({
  services,
  rowPt,
  gapPt,
  leaders,
}: {
  services: Service[];
  rowPt: number;
  gapPt: number;
  leaders: Readonly<Record<string, CardLeaderView>>;
}) {
  return (
    <View style={styles.column}>
      {services.map((service, index) => (
        <ServiceBlock
          key={service.id}
          service={service}
          rowPt={rowPt}
          leaders={leaders[service.id] ?? null}
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
  leaders,
}: {
  service: Service;
  rowPt: number;
  gapAfter: number;
  leaders: CardLeaderView | null;
}) {
  const date = printedServiceDate(service);
  const lineHeight = `${rowPt}pt`;
  const rows = service.songs.length + service.pendingSongs;
  // Several people lead it: each song names its leader, right-aligned in a column before the key,
  // as wide as the longest name (leaderColumn) - so the names line up, and titles keep their room.
  const names = leaders && !leaders.service ? serviceSlots(service).map((_, index) => printedName(leaders.rows[index + 1])) : [];
  const column = leaderColumn(names);
  const leaderCell = (index: number) =>
    column ? <Text style={[styles.leader, { width: column.leaderPt }]}>{names[index] ?? ""}</Text> : null;
  const keyStyle = column ? [styles.key, { width: column.keyPt }] : styles.key;


  return (
    // Never split across columns or pages: a service moves whole, or not at all.
    <View wrap={false} style={{ marginBottom: gapAfter }}>
      <View style={styles.serviceHeader}>
        {service.slot ? <Text style={styles.slot}>{service.slot}</Text> : null}
        <Text style={styles.date}>
          {date || songListContent.undatedServiceLabel}
          {/* One person leads every song: said once, beside the date. */}
          {leaders?.service ? (
            <Text style={styles.serviceLeader}>{`  ·  ${dashboardContent.leading.ledBy.replace("{name}", printedName(leaders.service)!)}`}</Text>
          ) : null}
        </Text>
        {service.startsAt ? (
          <Text style={styles.time}>{formatChurchTime(service.startsAt)}</Text>
        ) : null}
      </View>

      <View style={styles.songs}>
        {/* In sheet order, unfilled slots in their own places. */}
        {serviceSlots(service).map((song, index) => (
          <View
            key={index}
            style={[styles.row, { lineHeight }, index < rows - 1 ? styles.rowRule : {}]}
          >
            {song ? (
              <>
                <Text style={styles.number}>{song.number ?? ""}</Text>
                <Text style={styles.title}>{song.title}</Text>
                {leaderCell(index)}
                <Text style={keyStyle}>{song.key ?? ""}</Text>
              </>
            ) : (
              <>
                <Text style={styles.number} />
                <Text style={styles.pending}>{songListContent.states.pendingSong}</Text>
                {leaderCell(index)}
                <Text style={keyStyle} />
              </>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/** A leader as printed: "Alex B." (a guest, "Guest" - never "you"), or null when no one leads the song. */
function printedName(leader: CardLeader | null | undefined): string | null {
  if (!leader) return null;
  return leader.name === GUEST_NAME ? "Guest" : shortLeaderName(leader.name);
}
