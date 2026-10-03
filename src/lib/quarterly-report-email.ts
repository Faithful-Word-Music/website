import { siteConfig } from "@/config/site";
import { escapeHtml } from "@/lib/html";
import {
  FORGOTTEN_DAYS,
  previousQuarter,
  type QuarterlyReport,
  quarterLabel,
  type ReportSong,
} from "@/lib/quarterly-report";
import { churchDay, formatLongDate, formatShortDate } from "@/lib/service-time";
import { songPath, songSlug } from "@/lib/song-list";

/**
 * The quarterly report as an email: HTML plus a plain-text copy.
 *
 * Short on purpose. What to act on comes first (close repeats, songs due
 * back, songs for the season ahead), then a brief look back. Every list is
 * capped at LIST_ITEMS, empty sections are left out, and the full detail
 * stays on the website, which the email links to.
 *
 * Looks like the website: Source Serif 4 headings, Inter text, the site's
 * paper, ink and gold (see src/app/globals.css). Mail apps that cannot load
 * web fonts (Gmail) fall back to Georgia and the system sans-serif.
 *
 * Email clients are not browsers: layout is tables, styles are inline, and
 * there are no images. Font names are single-quoted, as the styles sit in
 * double-quoted attributes. Dark mode:
 *   - Apple Mail, Outlook for Mac and others use the dark styles in <style>,
 *     which are the site's own dark theme.
 *   - Gmail ignores them. On the web it shows the light version; its phone
 *     apps invert the colours themselves, which solid colours survive.
 */

/** The most any list in the email shows. */
export const LIST_ITEMS = 5;
/**
 * "Most sung" lists only songs sung at least this often. A song sung at all
 * three services of one week is sung three times - the usual pattern - so it
 * takes a fourth time for a song to stand out.
 */
export const STANDS_OUT = 4;
/** Songs for the season ahead get a little more room: Christmas alone fills five. */
export const SEASONAL_ITEMS = 8;

const LIGHT = {
  paper: "#faf9f6",
  surface: "#ffffff",
  ink: "#111111",
  inkSoft: "#2a2a28",
  muted: "#6b6b68",
  line: "#e5e5e2",
  gold: "#b08d57",
  goldDark: "#84683f",
  /** Chart context marks: the gray beside the gold accent (validated as a pair, labels always shown). */
  context: "#c9c7bf",
};

const DARK = {
  paper: "#141412",
  surface: "#1c1c1a",
  ink: "#f2f0ea",
  inkSoft: "#d9d6ce",
  muted: "#a3a19a",
  line: "#2e2d2a",
  gold: "#c9a36b",
  goldDark: "#d4b27d",
  context: "#4a4843",
};

const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONTS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,600&display=swap";

const songUrl = (song: Pick<ReportSong, "title">) =>
  `${siteConfig.url}${songPath(songSlug(song.title))}`;

const times = (count: number) => (count === 1 ? "once" : count === 2 ? "twice" : `${count} times`);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const percent = (share: number) => `${Math.round(share * 100)}%`;
const weeks = (days: number) => (days < 14 ? plural(days, "day") : plural(Math.round(days / 7), "week"));
/** "2026-11-26" -> "Thu, Nov 26" */
const formatWeekdayDate = (date: string) => formatShortDate(`${date}T12:00:00-07:00`);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ---------------------------------------------------------------------------
// Content: the same sections feed the HTML and the plain text.
// ---------------------------------------------------------------------------

interface Row {
  /** Hymn number, shown in the left column as on the website. */
  number?: string | null;
  title: string;
  href?: string;
  note?: string;
  figure?: string;
}

interface Section {
  title: string;
  intro: string;
  /** A list of songs, or... */
  rows?: Row[];
  /** ...a chart. */
  chart?: Chart;
  /** A closing line under the rows. */
  footer?: string;
}

interface Tile {
  label: string;
  value: string;
  change: string | null;
}

const songRow = (song: ReportSong, figure?: string, note?: string): Row => ({
  number: song.number,
  title: song.title,
  href: songUrl(song),
  note,
  figure,
});

/** "July – September 2026" */
function longLabel(report: QuarterlyReport): string {
  const first = report.quarter.index * 3;
  return `${MONTHS[first]} – ${MONTHS[first + 2]} ${report.quarter.year}`;
}

function tiles(report: QuarterlyReport): Tile[] {
  const before = report.previous;
  const vs = quarterLabel(previousQuarter(report.quarter)).replace(/ \d{4}$/, "");
  const change = (now: number, then: number | undefined, points = false) => {
    if (then === undefined) return null;
    const difference = points ? Math.round((now - then) * 100) : now - then;
    if (difference === 0) return `Same as ${vs}`;
    return `${difference > 0 ? "▲" : "▼"} ${Math.abs(difference)}${points ? (Math.abs(difference) === 1 ? " pt" : " pts") : ""} vs ${vs}`;
  };
  const { totals } = report;
  return [
    { label: "Services", value: String(totals.services), change: change(totals.services, before?.services) },
    { label: "Songs sung", value: String(totals.songsSung), change: change(totals.songsSung, before?.songsSung) },
    {
      label: "Different songs",
      value: String(totals.differentSongs),
      change: change(totals.differentSongs, before?.differentSongs),
    },
    {
      label: "From the hymnal",
      value: percent(totals.hymnShare),
      change: change(totals.hymnShare, before?.hymnShare, true),
    },
  ];
}

/** One plain sentence to open with. */
function summary(report: QuarterlyReport): string {
  const { totals } = report;
  if (totals.services === 0) return "No services were recorded this quarter.";
  return `${plural(totals.services, "service")} and ${plural(totals.songsSung, "song")} sung, ${totals.differentSongs} of them different. ${
    totals.differentSongs >= totals.songsSung * 0.6
      ? "Plenty of variety: few songs came round more than once or twice."
      : "A good number of songs came round several times."
  }`;
}

/** Special services grouped by run of days: "Nov 6–8, 2025 · 5 services". */
function specialsLine(specials: Array<{ startsAt: string }>): string | null {
  if (specials.length === 0) return null;
  const runs: Array<{ first: string; last: string; count: number }> = [];
  for (const special of specials) {
    const run = runs[runs.length - 1];
    if (run && churchDay(Date.parse(special.startsAt)) - churchDay(Date.parse(run.last)) <= 1) {
      run.last = special.startsAt;
      run.count += 1;
    } else {
      runs.push({ first: special.startsAt, last: special.startsAt, count: 1 });
    }
  }
  const text = runs.map((run) => {
    const first = formatLongDate(run.first);
    const lastDay = formatLongDate(run.last).replace(/^\w+ /, "").replace(/,.*/, "");
    const range = run.first === run.last || first === formatLongDate(run.last) ? first : first.replace(/ (\d+),/, ` $1–${lastDay},`);
    return `${range} (${plural(run.count, "service")})`;
  });
  return `Special services then: ${text.join("; ")}.`;
}

/** Things to look at before planning the next lists. */
function actions(report: QuarterlyReport): Section[] {
  const list: Section[] = [];
  const { lookahead } = report;

  // Breaks the rule outright, so it comes first.
  if (lookahead.outOfSeason.length > 0) {
    list.push({
      title: "Christmas song scheduled too early",
      intro: "Christmas songs are only sung from the first service after Thanksgiving.",
      rows: lookahead.outOfSeason
        .slice(0, LIST_ITEMS)
        .map((song) => songRow(song, formatShortDate(song.startsAt))),
    });
  }

  if (lookahead.repeats.length > 0) {
    list.push({
      title: "Check these repeats",
      intro: "Already scheduled, but sung only a few weeks before.",
      rows: lookahead.repeats
        .slice(0, LIST_ITEMS)
        .map((song) =>
          songRow(song, `${weeks(song.days)} apart`, `${formatShortDate(song.startsAt)} · last sung ${formatShortDate(song.previous)}`),
        ),
    });
  }

  if (report.due.length > 0) {
    list.push({
      title: "Due to come back",
      intro: "Well past their usual gap, and not scheduled yet.",
      rows: report.due
        .slice(0, LIST_ITEMS)
        .map((song) => songRow(song, `${weeks(song.sinceDays)} ago`, `Usually every ${weeks(song.usualDays)}`)),
    });
  }

  if (report.forgotten.length > 0) {
    list.push({
      title: "Forgotten favourites",
      intro: `Sung often before, but not in the last ${Math.round(FORGOTTEN_DAYS / 30)} months.`,
      rows: report.forgotten
        .slice(0, LIST_ITEMS)
        .map((song) => songRow(song, times(song.count), `Last sung ${formatLongDate(song.last)}`)),
    });
  }

  const then = lookahead.lastYear;
  if (then && then.seasonal.length > 0) {
    const shown = then.seasonal.slice(0, SEASONAL_ITEMS);
    list.push({
      title: `Ideas for ${lookahead.label}`,
      intro: `Sung this time last year, and not since.`,
      rows: shown.map((song) => songRow(song, formatShortDate(song.last))),
      footer: specialsLine(then.specials) ?? undefined,
    });
  }

  const christmas = lookahead.christmas;
  if (christmas && christmas.songs.length > 0) {
    const more = christmas.songs.length - SEASONAL_ITEMS;
    list.push({
      title: "For the Christmas season",
      intro: `Starting at the first service after Thanksgiving (${formatWeekdayDate(christmas.thanksgiving)}). Last year's Christmas songs, most sung first.`,
      rows: christmas.songs.slice(0, SEASONAL_ITEMS).map((song) => songRow(song, times(song.count))),
      footer: more > 0 ? `And ${more} more from last Christmas.` : undefined,
    });
  }

  return list;
}

/** A brief look back at the quarter. */
function recap(report: QuarterlyReport): Section[] {
  const list: Section[] = [];

  const variety = varietyChart(report);
  if (variety) {
    list.push({
      title: "Variety by quarter",
      intro: "Different songs sung each quarter. More means fewer repeats.",
      chart: variety,
    });
  }

  // Only songs sung more than a week's worth; when none were, there is nothing to see.
  const standouts = report.topSongs.filter((song) => song.count >= STANDS_OUT);
  if (standouts.length > 0) {
    list.push({
      title: "Most sung",
      intro: "Sung more than a week's worth (three services) this quarter.",
      rows: standouts.slice(0, LIST_ITEMS).map((song) => songRow(song, times(song.count))),
    });
  }

  if (report.overused.length > 0) {
    list.push({
      title: "Maybe too often",
      intro: "Came round four or more separate weeks this quarter.",
      rows: report.overused.slice(0, LIST_ITEMS).map((song) =>
        songRow(song, `${song.visits} weeks`, song.usual === null ? undefined : `Usually ${song.usual.toFixed(1)} a quarter`),
      ),
    });
  }

  if (report.newSongs && report.newSongs.length > 0) {
    list.push({
      title: "New songs",
      intro: "First sung this quarter. New songs are learned best when repeated soon.",
      rows: report.newSongs
        .slice(0, LIST_ITEMS)
        .map((song) =>
          songRow(
            song,
            times(song.count),
            song.visits < 2 ? (song.scheduled ? "Scheduled again" : "Not repeated yet") : undefined,
          ),
        ),
    });
  }

  if (report.pairs.length > 0) {
    list.push({
      title: "Often paired",
      intro: "Sung together again this quarter, as they usually are.",
      rows: report.pairs.slice(0, 3).map((pair) => ({
        title: `${pair.a.title} & ${pair.b.title}`,
        href: songUrl(pair.a),
        figure: `${times(pair.together)}`,
      })),
    });
  }

  const keys = keysChart(report);
  if (keys) {
    list.push({
      title: "Keys",
      intro: `The keys used most this quarter${report.keyless ? `; ${plural(report.keyless, "song")} had none written` : ""}.`,
      chart: keys,
    });
  }

  return list;
}

// ---------------------------------------------------------------------------
// Charts
//
// Built from tables, as an email cannot run scripts or rely on SVG (Gmail
// strips it). Each chart answers one question in one accent colour, with
// grey for context, and prints every value on its mark, so nothing depends
// on colour or hovering. The plain-text copy carries the same figures.
// ---------------------------------------------------------------------------

interface Chart {
  html: string;
  text: string[];
}

/** Columns never grow thicker than this, so each stands in its own air. */
const COLUMN_WIDTH = 24;
const PLOT_HEIGHT = 96;

/** Different songs each quarter: this quarter in gold, earlier ones in grey. */
function varietyChart(report: QuarterlyReport): Chart | null {
  if (report.trend.length < 2) return null;
  const max = Math.max(...report.trend.map((entry) => entry.totals.differentSongs), 1);

  const columns = report.trend.map((entry) => {
    const value = entry.totals.differentSongs;
    const height = Math.max(2, Math.round((value / max) * PLOT_HEIGHT));
    const months = entry.label.replace(/ \d{4}$/, "");
    const year = entry.label.slice(-4);
    const colour = entry.current ? LIGHT.gold : LIGHT.context;
    const valueStyle = entry.current
      ? `font-weight:600;color:${LIGHT.ink}`
      : `font-weight:400;color:${LIGHT.inkSoft}`;
    return {
      bar: `<td align="center" valign="bottom" style="padding:0 4px">
        <div class="${entry.current ? "fw-ink" : "fw-soft"}" style="font-family:${SANS};font-size:14px;line-height:20px;${valueStyle};padding-bottom:4px">${value}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>
          <td class="${entry.current ? "fw-accent" : "fw-context"}" width="${COLUMN_WIDTH}" height="${height}" bgcolor="${colour}" style="width:${COLUMN_WIDTH}px;height:${height}px;line-height:${height}px;font-size:0;background:${colour};border-radius:4px 4px 0 0">&nbsp;</td>
        </tr></table>
      </td>`,
      label: `<td class="fw-line" align="center" valign="top" style="padding:8px 4px 0;border-top:1px solid ${LIGHT.line}">
        <div class="${entry.current ? "fw-ink" : "fw-muted"}" style="font-family:${SANS};font-size:12px;line-height:16px;${entry.current ? `font-weight:600;color:${LIGHT.ink}` : `color:${LIGHT.muted}`}">${escapeHtml(months)}</div>
        <div class="fw-muted" style="font-family:${SANS};font-size:12px;line-height:16px;color:${LIGHT.muted}">${year}</div>
      </td>`,
    };
  });

  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed">
      <tr>${columns.map((column) => column.bar).join("")}</tr>
      <tr>${columns.map((column) => column.label).join("")}</tr>
    </table>`,
    text: report.trend.map(
      (entry) => `- ${entry.label}: ${plural(entry.totals.differentSongs, "different song")}${entry.current ? " (this quarter)" : ""}`,
    ),
  };
}

/** The keys used most, as bars with the share at each tip. */
function keysChart(report: QuarterlyReport): Chart | null {
  const keys = report.keys.slice(0, LIST_ITEMS);
  if (keys.length === 0) return null;
  const max = Math.max(...keys.map((key) => key.share));

  const rows = keys.map((key) => {
    // The longest bar takes 85% of the row, leaving room for its label.
    const width = Math.max(1, Math.round((key.share / max) * 85));
    return `<tr>
      <td class="fw-ink" width="48" valign="middle" style="padding:5px 12px 5px 0;font-family:${SANS};font-size:15px;line-height:20px;font-weight:500;color:${LIGHT.ink}">${escapeHtml(key.key)}</td>
      <td valign="middle" style="padding:5px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td class="fw-accent" width="${width}%" height="14" bgcolor="${LIGHT.gold}" style="width:${width}%;height:14px;line-height:14px;font-size:0;background:${LIGHT.gold};border-radius:0 4px 4px 0">&nbsp;</td>
          <td class="fw-soft" style="padding-left:8px;font-family:${SANS};font-size:14px;line-height:20px;color:${LIGHT.inkSoft};white-space:nowrap">${percent(key.share)}</td>
        </tr></table>
      </td>
    </tr>`;
  });

  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows.join("")}</table>`,
    text: keys.map((key) => `- ${key.key}: ${percent(key.share)} (${times(key.count)})`),
  };
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const DARK_RULES = `.fw-paper{background:${DARK.paper}!important}
.fw-surface{background:${DARK.surface}!important}
.fw-ink,.fw-ink a{color:${DARK.ink}!important}
.fw-soft{color:${DARK.inkSoft}!important}
.fw-muted{color:${DARK.muted}!important}
.fw-gold{color:${DARK.goldDark}!important}
.fw-bar,.fw-accent{background:${DARK.gold}!important}
.fw-context{background:${DARK.context}!important}
.fw-line{border-color:${DARK.line}!important}
.fw-button{background:${DARK.ink}!important;color:${DARK.paper}!important}`;

const STYLE = `
:root{color-scheme:light dark;supported-color-schemes:light dark}
a{text-decoration:none}
@media (prefers-color-scheme:dark){${DARK_RULES}}
${DARK_RULES.split("\n")
  .map((rule) => `[data-ogsc] ${rule.replace(/,/g, ",[data-ogsc] ")}`)
  .join("\n")}
@media (max-width:520px){
  .fw-pad{padding-left:20px!important;padding-right:20px!important}
  .fw-tile{display:inline-block!important;width:50%!important;box-sizing:border-box}
  .fw-title{font-size:28px!important}
}`;

const eyebrow = (text: string, colour = LIGHT.goldDark, className = "fw-gold") =>
  `<div class="${className}" style="font-family:${SANS};font-size:11px;line-height:16px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${colour}">${escapeHtml(text)}</div>`;

/**
 * A stat tile. The label sits in a fixed-height cell aligned to its foot, so a
 * label that wraps to two lines never pushes its figure below its neighbours'.
 */
function tileHtml(tile: Tile): string {
  return `<td class="fw-tile" width="25%" valign="top" style="padding:12px 8px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td height="32" valign="bottom" style="height:32px">${eyebrow(tile.label, LIGHT.muted, "fw-muted")}</td></tr>
      <tr><td class="fw-ink" style="padding-top:4px;font-family:${SANS};font-size:28px;line-height:34px;font-weight:600;letter-spacing:-0.5px;color:${LIGHT.ink}">${escapeHtml(tile.value)}</td></tr>
      <tr><td class="fw-muted" height="18" style="height:18px;padding-top:2px;font-family:${SANS};font-size:13px;line-height:18px;color:${LIGHT.muted}">${escapeHtml(tile.change ?? "")}</td></tr>
    </table>
  </td>`;
}

function rowHtml(row: Row): string {
  const title = row.href
    ? `<a href="${escapeHtml(row.href)}" class="fw-ink" style="color:${LIGHT.ink};text-decoration:none">${escapeHtml(row.title)}</a>`
    : escapeHtml(row.title);
  const rule = `border-top:1px solid ${LIGHT.line}`;
  return `<tr>
    ${`<td class="fw-line fw-gold" width="36" valign="top" align="right" style="padding:12px 12px 12px 0;${rule};font-family:${SERIF};font-size:16px;line-height:22px;color:${LIGHT.goldDark}">${escapeHtml(row.number ?? "·")}</td>`}
    <td class="fw-line" valign="top" style="padding:12px 0;${rule}">
      <div class="fw-ink" style="font-family:${SANS};font-size:16px;line-height:22px;color:${LIGHT.ink}">${title}</div>
      ${row.note ? `<div class="fw-muted" style="font-family:${SANS};font-size:14px;line-height:20px;color:${LIGHT.muted};margin-top:2px">${escapeHtml(row.note)}</div>` : ""}
    </td>
    <td class="fw-line fw-soft" valign="top" align="right" style="padding:12px 0 12px 16px;${rule};font-family:${SANS};font-size:14px;line-height:22px;color:${LIGHT.inkSoft};white-space:nowrap">${escapeHtml(row.figure ?? "")}</td>
  </tr>`;
}

/**
 * One section: heading, one line of explanation, then its list or chart.
 * Lists are ruled above every row and below the last, and every list keeps a
 * hymn-number column so all of them line up. A song without a number shows
 * "·" there, as it does on the song list.
 */
function sectionHtml(section: Section): string {
  const rows = section.rows ?? [];
  const body = section.chart
    ? section.chart.html
    : `<table role="presentation" class="fw-line" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-bottom:1px solid ${LIGHT.line}">${rows.map(rowHtml).join("")}</table>`;
  return `<tr><td class="fw-pad" style="padding:32px 40px 0">
    <h3 class="fw-ink" style="margin:0;font-family:${SERIF};font-size:20px;line-height:26px;font-weight:600;color:${LIGHT.ink}">${escapeHtml(section.title)}</h3>
    <p class="fw-muted" style="margin:4px 0 14px;font-family:${SANS};font-size:15px;line-height:22px;color:${LIGHT.muted}">${escapeHtml(section.intro)}</p>
    ${body}
    ${section.footer ? `<p class="fw-muted" style="margin:0;padding-top:12px;font-family:${SANS};font-size:14px;line-height:20px;color:${LIGHT.muted}">${escapeHtml(section.footer)}</p>` : ""}
  </td></tr>`;
}

function partHtml(label: string, body: Section[]): string {
  if (body.length === 0) return "";
  return `<tr><td class="fw-pad" style="padding:44px 40px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="fw-line" style="padding-bottom:8px;border-bottom:1px solid ${LIGHT.line}">${eyebrow(label)}</td>
    </tr></table>
  </td></tr>${body.map(sectionHtml).join("")}`;
}

function notes(report: QuarterlyReport, persistent: boolean): string[] {
  const lines: string[] = [];
  if (!report.previous && report.recordsBegan) {
    lines.push(`Comparisons with earlier quarters appear once the records, which begin ${formatLongDate(`${report.recordsBegan}T12:00:00-07:00`)}, cover one.`);
  }
  if (!persistent) {
    lines.push("The archive database could not be read, so this report used the Service Planner's published services only.");
  }
  return lines;
}

export interface ReportEmail {
  subject: string;
  html: string;
  text: string;
}

/** `persistent` is false when only published plans could be read (see getSongHistory). */
export function renderQuarterlyReport(report: QuarterlyReport, persistent = true): ReportEmail {
  const subject = `Your quarterly song report: ${report.label}`;
  const title = longLabel(report);
  const opening = summary(report);
  const allTiles = tiles(report);
  const todo = actions(report);
  const lookBack = recap(report);
  const footnotes = notes(report, persistent);
  const archive = `${siteConfig.url}/song-list/archive`;
  const recapUrl = `${siteConfig.url}/song-list/year/${report.quarter.year}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<link rel="stylesheet" href="${FONTS}">
<style>${STYLE}</style>
</head>
<body class="fw-paper" style="margin:0;padding:0;background:${LIGHT.paper};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(opening)}</div>
<table role="presentation" class="fw-paper" width="100%" cellpadding="0" cellspacing="0" style="background:${LIGHT.paper}">
<tr><td align="center" style="padding:32px 12px">
<table role="presentation" class="fw-surface fw-line" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${LIGHT.surface};border:1px solid ${LIGHT.line};border-radius:12px;overflow:hidden">
  <tr><td class="fw-bar" height="4" style="height:4px;line-height:4px;font-size:0;background:${LIGHT.gold}">&nbsp;</td></tr>
  <tr><td class="fw-pad" style="padding:36px 40px 0">
    ${eyebrow(`${siteConfig.name} · Quarterly song report`)}
    <h1 class="fw-ink fw-title" style="margin:10px 0 0;font-family:${SERIF};font-size:34px;line-height:40px;font-weight:600;color:${LIGHT.ink}">${escapeHtml(title)}</h1>
    <p class="fw-soft" style="margin:12px 0 0;font-family:${SANS};font-size:16px;line-height:24px;color:${LIGHT.inkSoft}">${escapeHtml(opening)}</p>
  </td></tr>
  <tr><td class="fw-pad" style="padding:16px 32px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${allTiles.map(tileHtml).join("")}</tr></table>
  </td></tr>
  ${partHtml("Before you plan", todo)}
  ${partHtml("Looking back", lookBack)}
  <tr><td class="fw-pad" style="padding:40px 40px 0">
    <a href="${archive}" class="fw-button" style="display:inline-block;background:${LIGHT.ink};color:${LIGHT.paper};font-family:${SANS};font-size:15px;line-height:20px;font-weight:500;padding:12px 24px;border-radius:8px;text-decoration:none">Open the song archive &rarr;</a>
    <p class="fw-muted" style="margin:14px 0 0;font-family:${SANS};font-size:14px;line-height:20px;color:${LIGHT.muted}">Or see <a href="${recapUrl}" class="fw-gold" style="color:${LIGHT.goldDark};text-decoration:underline">${report.quarter.year} in review</a>.</p>
  </td></tr>
  <tr><td class="fw-pad" style="padding:28px 40px 36px">
    ${footnotes.map((line) => `<p class="fw-muted" style="margin:0 0 6px;font-family:${SANS};font-size:13px;line-height:19px;color:${LIGHT.muted}">${escapeHtml(line)}</p>`).join("")}
    <p class="fw-muted" style="margin:0;font-family:${SANS};font-size:13px;line-height:19px;color:${LIGHT.muted}">Sent to ${escapeHtml(siteConfig.mail.to)} on the first day of each quarter.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const textSection = (section: Section) => [
    "",
    section.title.toUpperCase(),
    section.intro,
    ...(section.chart
      ? section.chart.text
      : (section.rows ?? []).map(
          (row) =>
            `- ${row.number ? `${row.number} ` : ""}${row.title}${row.figure ? ` - ${row.figure}` : ""}${row.note ? ` (${row.note})` : ""}`,
        )),
    ...(section.footer ? [section.footer] : []),
  ];

  const text = [
    `${siteConfig.name.toUpperCase()} - QUARTERLY SONG REPORT`,
    title,
    "",
    opening,
    "",
    ...allTiles.map((tile) => `${tile.label}: ${tile.value}${tile.change ? ` (${tile.change})` : ""}`),
    ...(todo.length ? ["", "== BEFORE YOU PLAN ==", ...todo.flatMap(textSection)] : []),
    ...(lookBack.length ? ["", "== LOOKING BACK ==", ...lookBack.flatMap(textSection)] : []),
    "",
    `Song archive: ${archive}`,
    `${report.quarter.year} in review: ${recapUrl}`,
    ...footnotes.map((line) => `\n${line}`),
  ].join("\n");

  return { subject, html, text };
}
