import { siteConfig } from "@/config/site";
import { searchContent } from "@/content/search";
import { adminPagesFor } from "@/lib/admin-sections";
import { canAccessAdmin, type Permission } from "@/lib/auth/permissions";
import { SIGNED_OUT, type NavContext } from "@/lib/navigation";
import { matchesSong, songKey, songPath } from "@/lib/song-list";
import type { ServiceSlot } from "@/types/song-list";

/**
 * The site search: what it can find, and how a query finds it.
 *
 * Songs, coming services, year recaps and month PDFs change with the schedule,
 * so they come from /api/search (see src/app/api/search/route.ts). Pages and
 * actions are fixed, and are built here so they show before that arrives.
 *
 * WHO IS OFFERED WHAT IS DECIDED HERE, and only here: PAGES and COMMANDS
 * below say which permission opens each entry, and every one is filtered by
 * the person's effective permissions - the same NavContext the header's
 * links are (src/lib/navigation.ts). Never by a role's name: roles are data,
 * and an administrator can change what each one may do. The palette itself
 * (CommandPalette.tsx) checks nothing; it shows what this returns.
 *
 * Leaving an entry out is a convenience, not the protection. Each page checks
 * its own permission on the server, and so does everything a command sets in
 * motion (/api/conductor, /api/availability). /api/search stays public and
 * carries nothing a visitor may not see.
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
    /** The date written out, "Wednesday, September 30, 2026", so a full month name finds it. */
    dateLabel: string;
    songs: Array<{ number: string | null; title: string }>;
  }>;
  /** Years with a recap, newest first. */
  years: number[];
  /** Months that can be downloaded as a PDF, in tab order. */
  pdfs: Array<{ month: string; href: string }>;
}

export type SearchGroup = "songs" | "services" | "pages" | "actions" | "conductor";

/**
 * What an entry without an address does when chosen:
 *
 *   toggle-theme         switches light and dark
 *   update-availability  opens the palette's own steps for marking yourself
 *                        available or away for a coming service
 *   ask-conductor        sends what was typed to Conductor and opens its panel
 */
export type SearchAction = "toggle-theme" | "update-availability" | "ask-conductor";

export interface SearchEntry {
  id: string;
  group: SearchGroup;
  label: string;
  /** Shown at the right: a hymn number. */
  number?: string | null;
  /** Shown under the label: a service's songs. */
  detail?: string;
  sheetMusic?: boolean;
  /** Where it leads. Absent for an action handled in the page (`action`). */
  href?: string;
  /** Opens outside the site: a new tab, or the mail app. */
  external?: boolean;
  /** A song's page: on this site, but opened in a new tab (songLinkProps). */
  songPage?: boolean;
  action?: SearchAction;
  /** Extra words that find it, never shown. */
  keywords?: string;
  /** Found by typing, but not listed before anything is typed: the opening list stays short. */
  quiet?: true;
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
 * time of day rather than its position in a list, so a link keeps working
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

/** Who an entry is for. With none of these it is for everyone, visitors included. */
interface Audience {
  /** "visitor": only while signed out. "member": anyone signed in. */
  only?: "visitor" | "member";
  /** Shown only to someone holding this permission (so, signed in). */
  permission?: Permission;
  /** For a rule one permission cannot express. */
  when?: (context: NavContext) => boolean;
}

/** Whether an entry is offered to this person. THE check every page and command goes through. */
export function offeredTo(audience: Audience, context: NavContext): boolean {
  if (audience.only === "visitor" && context.signedIn) return false;
  if ((audience.only === "member" || audience.permission || audience.when) && !context.signedIn) return false;
  if (audience.permission && !context.permissions.has(audience.permission)) return false;
  return audience.when ? audience.when(context) : true;
}

interface PageDefinition extends Audience {
  href: string;
  /** Its label and keywords, in searchContent.pages. */
  copy: Exclude<keyof typeof searchContent.pages, "year">;
  /** Found by typing, but not listed before anything is typed: the opening list stays short. */
  quiet?: true;
}

/**
 * The site's pages, in the order they are offered, each with who may open
 * it - the same permission its own page checks. Signed in, the Dashboard
 * takes Home's place: signed-in people never see the public home page.
 *
 * A new page is one line here and one entry in searchContent.pages. The admin
 * area's pages are not listed: they come from src/lib/admin-sections.ts, which
 * the admin sidebar is built from too.
 */
const PAGES: PageDefinition[] = [
  { href: "/", copy: "home", only: "visitor" },
  { href: "/dashboard", copy: "dashboard", only: "member" },
  { href: "/service-planner", copy: "servicePlanner", permission: "manage_service_plans" },
  { href: "/service-planner/inserts", copy: "inserts", permission: "manage_service_plans", quiet: true },
  { href: "/conductor", copy: "conductor", permission: "use_ai" },
  { href: "/song-list", copy: "songList" },
  { href: "/library", copy: "library" },
  { href: "/availability", copy: "availability", permission: "view_availability" },
  { href: "/song-list/archive", copy: "archive" },
  { href: "/song-list/archive/services", copy: "serviceArchive", quiet: true },
  { href: "/song-list/year", copy: "years" },
  { href: "/profile", copy: "profile", only: "member" },
  { href: "/account", copy: "account", only: "member" },
  { href: "/contact", copy: "contact" },
];

/**
 * The pages one person is offered, in order. `years` adds a recap page for
 * each; the admin area's pages follow, for whoever may open them.
 */
export function pageEntries(years: readonly number[] = [], context: NavContext = SIGNED_OUT): SearchEntry[] {
  const { pages, admin } = searchContent;
  const page = (href: string, copy: { label: string; keywords: string }, quiet = false): SearchEntry => ({
    id: `page:${href}`,
    group: "pages",
    href,
    ...copy,
    ...(quiet ? { quiet: true as const } : {}),
  });
  const adminPages = context.signedIn && canAccessAdmin(context.permissions) ? adminPagesFor(context.permissions) : [];

  return [
    ...PAGES.filter((definition) => offeredTo(definition, context)).map((definition) =>
      page(definition.href, pages[definition.copy], definition.quiet),
    ),
    // "Admin" itself opens with the rest; its sections wait to be typed for.
    ...adminPages.map((section) => page(section.href, admin[section.id], section.id !== "overview")),
    ...years.map((year) =>
      page(`/song-list/year/${year}`, { label: pages.year.label.replace("{year}", String(year)), keywords: pages.year.keywords }, true),
    ),
  ];
}

/**
 * The commands that need a permission: things the palette does itself rather
 * than a page it opens. Each is carried out by a route that checks the same
 * permission on the server.
 */
const COMMANDS: Array<Audience & { action: Exclude<SearchAction, "toggle-theme" | "ask-conductor">; copy: "availability" }> = [
  // Your own availability only: the participant's permission. Managing other people's stays on the page.
  { action: "update-availability", copy: "availability", permission: "view_availability" },
];

/** Who may ask Conductor: every question is paid for, so it is its own permission. */
const ASK_CONDUCTOR: Audience = { permission: "use_ai" };

/**
 * "Ask Conductor: <what was typed>" - for someone holding use_ai, and only
 * once something is typed. Null otherwise.
 */
export function askConductorEntry(query: string, context: NavContext = SIGNED_OUT): SearchEntry | null {
  const typed = query.trim();
  if (typed === "" || !offeredTo(ASK_CONDUCTOR, context)) return null;
  return {
    id: "action:ask-conductor",
    group: "conductor",
    action: "ask-conductor",
    label: searchContent.actions.askConductor.label.replace("{query}", typed),
  };
}

/** The actions one person is offered. `dark` is the theme showing now, so the switch names the other one. */
export function actionEntries(dark: boolean, pdfs: SearchIndex["pdfs"] = [], context: NavContext = SIGNED_OUT): SearchEntry[] {
  const { actions } = searchContent;
  const { resources } = siteConfig;
  return [
    ...COMMANDS.filter((command) => offeredTo(command, context)).map(
      (command): SearchEntry => ({ id: `action:${command.action}`, group: "actions", action: command.action, ...actions[command.copy] }),
    ),
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
    songPage: true,
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
 * The results for a query, grouped, for one person. With nothing typed: the
 * next few services, then pages and actions - somewhere to start. Songs only
 * appear once something is typed; there are too many to list.
 *
 * `index` is null until /api/search has answered. `context` is who is
 * looking (useAccount().nav): a visitor, when left out.
 *
 * "Ask Conductor" comes last, after everything that matched. So Enter still
 * opens the best match for a song or a page, and a question - which matches
 * nothing - finds Conductor first in line.
 */
export function searchSite(index: SearchIndex | null, query: string, dark: boolean, context: NavContext = SIGNED_OUT): SearchResults {
  const pages = pageEntries(index?.years, context);
  const actions = actionEntries(dark, index?.pdfs, context);
  const typed = query.trim() !== "";

  if (!typed) {
    const groups: SearchResults["groups"] = [
      { group: "services", entries: (index?.services ?? []).slice(0, OPENING_SERVICES).map(serviceEntry) },
      // Year recaps, the admin area's sections and the like are there to be found, not to crowd the opening list.
      { group: "pages", entries: pages.filter((page) => !page.quiet) },
      { group: "actions", entries: actions },
    ];
    return { groups: groups.filter((group) => group.entries.length > 0), moreSongs: 0 };
  }

  const songs = index ? rankSongs(index.songs, query) : [];
  const ask = askConductorEntry(query, context);
  const groups: SearchResults["groups"] = [
    { group: "songs", entries: songs.slice(0, MAX_SONGS).map(songEntry) },
    { group: "services", entries: index ? matchServices(index.services, query).map(serviceEntry) : [] },
    { group: "pages", entries: rankEntries(pages, query) },
    { group: "actions", entries: rankEntries(actions, query) },
    { group: "conductor", entries: ask ? [ask] : [] },
  ];

  return {
    groups: groups.filter((group) => group.entries.length > 0),
    moreSongs: Math.max(0, songs.length - MAX_SONGS),
  };
}
