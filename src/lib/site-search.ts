import { siteConfig } from "@/config/site";
import { searchContent } from "@/content/search";
import { matchesSong, songKey, songPath } from "@/lib/song-list";
import type { ServiceSlot } from "@/types/song-list";

/**
 * The site search: what it can find, and how a query finds it.
 *
 * Songs, coming services, year recaps and month PDFs change with the sheet,
 * so they come from /api/search (see src/app/api/search/route.ts). Pages and
 * actions are fixed, and are built here so they show before that arrives.
 */

/** What /api/search returns. */
export interface SearchIndex {
  /** Every song with a page, A-Z (as the Library lists them). */
  songs: Array<{ slug: string; title: string; number: string | null; sheetMusic: boolean }>;
  /** Services not yet over, soonest first. */
  services: Array<{
    /** Where the service lives on the song list: /song-list#<anchor>. See serviceAnchor(). */
    anchor: string;
    /** "Wednesday Evening · Sept 30 · 7:00 PM" */
    heading: string;
    /** The date as the sheet wrote it, "Wednesday, September 30, 2026", so a full month name finds it. */
    dateLabel: string;
    songs: Array<{ number: string | null; title: string }>;
  }>;
  /** Years with a recap, newest first. */
  years: number[];
  /** Months that can be downloaded as a PDF, in tab order. */
  pdfs: Array<{ month: string; href: string }>;
}

export type SearchGroup = "songs" | "services" | "pages" | "actions";

export interface SearchEntry {
  id: string;
  group: SearchGroup;
  label: string;
  /** Shown at the right: a hymn number. */
  number?: string | null;
  /** Shown under the label: a service's songs. */
  detail?: string;
  sheetMusic?: boolean;
  /** Where it leads. Absent for an action handled in the page (the theme). */
  href?: string;
  /** Opens outside the site: a new tab, or the mail app. */
  external?: boolean;
  action?: "toggle-theme";
  /** Extra words that find it, never shown. */
  keywords?: string;
}

export interface SearchResults {
  groups: Array<{ group: SearchGroup; entries: SearchEntry[] }>;
  /** Songs that matched beyond those shown. */
  moreSongs: number;
}

/** Songs shown at most; the rest are a link to the Library. */
export const MAX_SONGS = 8;
/** Coming services shown before anything is typed. */
const OPENING_SERVICES = 3;

/**
 * A service's place on the song list: "2026-09-30-pm". Made from its date and
 * time of day rather than its position in the sheet, so a link keeps working
 * after rows are added above it.
 */
export function serviceAnchor(date: string, slot: ServiceSlot | null): string {
  return slot ? `${date}-${slot.toLowerCase()}` : date;
}

/**
 * Fired on window, with a service anchor as its detail, when the search picks
 * a service while the song list is already open. Next.js changes the address
 * without a "hashchange" event, so the song list listens for this as well.
 */
export const SHOW_SERVICE_EVENT = "fwm:show-service";

/** The pages, in the order they are offered. `years` adds a recap page for each. */
export function pageEntries(years: readonly number[] = []): SearchEntry[] {
  const { pages } = searchContent;
  return [
    { id: "page:/", group: "pages", href: "/", ...pages.home },
    { id: "page:/song-list", group: "pages", href: "/song-list", ...pages.songList },
    { id: "page:/library", group: "pages", href: "/library", ...pages.library },
    { id: "page:/song-list/archive", group: "pages", href: "/song-list/archive", ...pages.archive },
    { id: "page:/song-list/year", group: "pages", href: "/song-list/year", ...pages.years },
    { id: "page:/contact", group: "pages", href: "/contact", ...pages.contact },
    ...years.map((year): SearchEntry => ({
      id: `page:/song-list/year/${year}`,
      group: "pages",
      href: `/song-list/year/${year}`,
      label: pages.year.label.replace("{year}", String(year)),
      keywords: pages.year.keywords,
    })),
  ];
}

/** The actions. `dark` is the theme showing now, so the switch names the other one. */
export function actionEntries(dark: boolean, pdfs: SearchIndex["pdfs"] = []): SearchEntry[] {
  const { actions } = searchContent;
  const { resources } = siteConfig;
  return [
    { id: "action:theme", group: "actions", action: "toggle-theme", ...(dark ? actions.themeLight : actions.themeDark) },
    ...pdfs.map((pdf): SearchEntry => ({
      id: `action:pdf:${pdf.month}`,
      group: "actions",
      href: pdf.href,
      external: true,
      label: actions.pdf.label.replace("{month}", pdf.month),
      keywords: actions.pdf.keywords,
    })),
    { id: "action:email", group: "actions", href: `mailto:${siteConfig.contactEmail}`, external: true, ...actions.email },
    { id: "action:youtube", group: "actions", href: resources.youtube, external: true, ...actions.youtube },
    { id: "action:hymn-cds", group: "actions", href: resources.hymnCds, external: true, ...actions.hymnCds },
    { id: "action:musescore", group: "actions", href: resources.musescore, external: true, ...actions.musescore },
    { id: "action:church", group: "actions", href: resources.church, external: true, ...actions.church },
  ];
}

function songEntry(song: SearchIndex["songs"][number]): SearchEntry {
  return {
    id: `song:${song.slug}`,
    group: "songs",
    label: song.title,
    number: song.number,
    sheetMusic: song.sheetMusic,
    href: songPath(song.slug),
  };
}

function serviceEntry(service: SearchIndex["services"][number]): SearchEntry {
  return {
    id: `service:${service.anchor}`,
    group: "services",
    label: service.heading,
    detail: service.songs.map((song) => song.title).join(", "),
    href: `/song-list#${service.anchor}`,
  };
}

/**
 * How well `text` answers the query, or null if it does not: 0 when it starts
 * with the query, 1 when a word in it does, 2 when every typed word appears
 * somewhere in it or its keywords.
 */
function rankText(label: string, keywords: string, query: string): number | null {
  const needle = songKey(query);
  if (needle === "") return 0;
  const text = songKey(label);
  if (text.startsWith(needle)) return 0;
  if (` ${text}`.includes(` ${needle}`)) return 1;
  const haystack = `${text} ${songKey(keywords)}`;
  return needle.split(" ").every((word) => haystack.includes(word)) ? 2 : null;
}

/**
 * Songs as the Library's own search finds them (title, or hymn number from its
 * start), best first: an exact number, then titles starting with the query,
 * then the rest A-Z.
 */
function rankSongs(songs: SearchIndex["songs"], query: string) {
  const typed = songKey(query);
  const numberNeedle = query.trim().toLowerCase().replace(/^(#|no\.?)\s*/, "");
  const found: Array<{ song: SearchIndex["songs"][number]; rank: number; order: number }> = [];
  songs.forEach((song, order) => {
    if (!matchesSong({ ...song, keys: [] }, { query, key: "" })) return;
    const rank =
      song.number?.toLowerCase() === numberNeedle ? 0 : songKey(song.title).startsWith(typed) ? 1 : 2;
    found.push({ song, rank, order });
  });
  return found.sort((a, b) => a.rank - b.rank || a.order - b.order).map(({ song }) => song);
}

/** Services whose date, heading or songs answer the query, soonest first. */
function matchServices(services: SearchIndex["services"], query: string) {
  return services.filter(
    (service) =>
      rankText(service.heading, service.dateLabel, query) !== null ||
      service.songs.some((song) => matchesSong({ ...song, keys: [] }, { query, key: "" })),
  );
}

function rankEntries(entries: SearchEntry[], query: string): SearchEntry[] {
  return entries
    .map((entry, order) => ({ entry, order, rank: rankText(entry.label, entry.keywords ?? "", query) }))
    .filter((item): item is typeof item & { rank: number } => item.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map(({ entry }) => entry);
}

/**
 * The results for a query, grouped. With nothing typed: the next few
 * services, then pages and actions - somewhere to start. Songs only appear
 * once something is typed; there are too many to list.
 *
 * `index` is null until /api/search has answered.
 */
export function searchSite(index: SearchIndex | null, query: string, dark: boolean): SearchResults {
  const pages = pageEntries(index?.years);
  const actions = actionEntries(dark, index?.pdfs);
  const typed = query.trim() !== "";

  if (!typed) {
    const groups: SearchResults["groups"] = [
      { group: "services", entries: (index?.services ?? []).slice(0, OPENING_SERVICES).map(serviceEntry) },
      // Year recaps are there to be found, not to crowd the opening list.
      { group: "pages", entries: pages.filter((page) => !/\/year\/\d/.test(page.href ?? "")) },
      { group: "actions", entries: actions },
    ];
    return { groups: groups.filter((group) => group.entries.length > 0), moreSongs: 0 };
  }

  const songs = index ? rankSongs(index.songs, query) : [];
  const groups: SearchResults["groups"] = [
    { group: "songs", entries: songs.slice(0, MAX_SONGS).map(songEntry) },
    { group: "services", entries: index ? matchServices(index.services, query).map(serviceEntry) : [] },
    { group: "pages", entries: rankEntries(pages, query) },
    { group: "actions", entries: rankEntries(actions, query) },
  ];

  return {
    groups: groups.filter((group) => group.entries.length > 0),
    moreSongs: Math.max(0, songs.length - MAX_SONGS),
  };
}
