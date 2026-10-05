import { siteConfig } from "@/config/site";
import { addDays, churchDate, serviceOccurrences } from "@/lib/availability/occurrences";
import { christmasSongs, inChristmasSeason } from "@/lib/church-calendar";
import { filterArchive, NO_FILTER, toArchive, type ServiceTypeFilter } from "@/lib/service-archive";
import {
  buildCandidates,
  candidateFacts,
  candidateSheetMusicCheck,
  serviceSignals,
  type PlanningSignal,
} from "@/lib/service-planner/intelligence";
import type { WorkspaceData } from "@/lib/service-planner/load";
import { dateLabelFor, dayOfWeek, startsAtFor } from "@/lib/service-time";
import { serviceAnchor } from "@/lib/site-search";
import { buildCompanions, buildSongRecords, usageCount } from "@/lib/song-history";
import { matchesSong, songKey } from "@/lib/song-list";
import { buildSongStats } from "@/lib/song-stats";
import { availableYears, buildYearRecap } from "@/lib/year-recap";
import type { DatedService, ServiceSlot, Song } from "@/types/song-list";

/**
 * The facts Conductor's tools hand the model: the site's own history, plans
 * and statistics, cut down to small, bounded answers. Every figure here comes
 * from the same functions the pages use (song-history, song-stats,
 * service-archive, the planner's intelligence), so Conductor and the site
 * cannot disagree.
 *
 * Everything is a pure function of ConductorData (loaded once per question in
 * data.ts), which makes it unit tested - and read-only by construction: there
 * is nothing here that could write.
 *
 * Results are plain objects with plain names, because the model reads them.
 * Lists are capped and say so (`truncated`), dates are "YYYY-MM-DD" in church
 * time, and a service is named the way people say it ("Sunday morning").
 */

/** A service still to come. `draft` only ever reaches someone who manages service plans. */
export interface UpcomingService extends DatedService {
  status: "published" | "draft";
  /** Places not filled yet. */
  emptyPlaces: number;
}

export interface ConductorData {
  now: number;
  /** Today in church time, "2026-10-05". */
  today: string;
  /** Every service that has happened, oldest first. */
  past: DatedService[];
  /** Planned services that have not happened yet, soonest first. */
  upcoming: UpcomingService[];
  /** Songs added in the planner's catalog (they may never have been sung). */
  catalog: Array<{ title: string; number: string | null; collection: string | null; defaultKey: string | null }>;
  /** Whether `upcoming` includes drafts (the person manages service plans). */
  draftsIncluded: boolean;
  /** False when neither the archive nor the planner could be read. */
  historyAvailable: boolean;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Sunday morning", "Wednesday evening", or a special service's own name. */
export function serviceName(service: Pick<DatedService, "date" | "slot" | "label">): string {
  const usual = `${WEEKDAYS[dayOfWeek(service.date)]} ${service.slot === "AM" ? "morning" : "evening"}`;
  return service.label ? `${service.label} (${usual})` : usual;
}

const songLine = (song: Song, index: number) => ({
  place: index + 1,
  title: song.title,
  number: song.number,
  key: song.key,
  ...(song.insert ? { insert: true } : {}),
});

type ServiceStatus = "sung" | "published" | "draft";

function describeService(service: DatedService, status: ServiceStatus, emptyPlaces = 0) {
  return {
    date: service.date,
    slot: service.slot,
    service: serviceName(service),
    status,
    songs: service.songs.map(songLine),
    ...(emptyPlaces > 0 ? { placesNotFilledYet: emptyPlaces } : {}),
  };
}

/**
 * The church-time date of an instant, "2026-09-23". Never the first ten
 * characters of the timestamp: the archive hands instants back in UTC, where
 * a Wednesday evening in Arizona is already Thursday.
 */
export function churchDateOf(instant: string | null | undefined): string | null {
  if (!instant) return null;
  const time = Date.parse(instant);
  return Number.isNaN(time) ? null : churchDate(time);
}

const recordsBegin = (data: ConductorData) => data.past[0]?.date ?? null;

// ---------------------------------------------------------------------------
// Finding a song
// ---------------------------------------------------------------------------

export interface SongRef {
  id: string;
  title: string;
  number: string | null;
  timesSung: number;
  lastSung: string | null;
}

/** Every song the site knows: sung, planned or in the catalog. */
export function songDirectory(data: ConductorData): SongRef[] {
  const byId = new Map<string, SongRef>();
  for (const record of buildSongRecords(data.past)) {
    byId.set(record.id, {
      id: record.id,
      title: record.title,
      number: record.number,
      timesSung: record.plays.length,
      lastSung: churchDateOf(record.plays.at(-1)?.startsAt),
    });
  }
  const add = (title: string, number: string | null) => {
    const id = songKey(title);
    if (id === "") return;
    const known = byId.get(id);
    if (known) known.number ??= number;
    else byId.set(id, { id, title, number, timesSung: 0, lastSung: null });
  };
  for (const service of data.upcoming) for (const song of service.songs) add(song.title, song.number);
  for (const song of data.catalog) add(song.title, song.number);
  return [...byId.values()];
}

const byMostSung = (a: SongRef, b: SongRef) => b.timesSung - a.timesSung || a.title.localeCompare(b.title);

/** How many songs a search hands back. */
export const SONG_MATCHES = 8;

/**
 * The song a person means by `query` - a title, part of one, or a hymnal
 * number. `match` is set only when exactly one song fits; otherwise the
 * candidates are returned for the model to ask about, never guessed between.
 */
export function resolveSong(data: ConductorData, query: string): { match: SongRef | null; candidates: SongRef[] } {
  const text = query.trim();
  if (text === "") return { match: null, candidates: [] };
  const songs = songDirectory(data);

  const exact = songs.find((song) => song.id === songKey(text));
  if (exact) return { match: exact, candidates: [exact] };

  const number = /^(?:#|no\.?\s*|hymn\s*)?(\d+[a-z]?)$/i.exec(text)?.[1]?.toLowerCase();
  if (number) {
    const numbered = songs.filter((song) => song.number?.toLowerCase() === number);
    if (numbered.length === 1) return { match: numbered[0], candidates: numbered };
    if (numbered.length > 1) return { match: null, candidates: numbered.sort(byMostSung).slice(0, SONG_MATCHES) };
  }

  const found = songs
    .filter((song) => matchesSong({ title: song.title, number: song.number, keys: [] }, { query: text, key: "" }))
    .sort(byMostSung);
  return { match: found.length === 1 ? found[0] : null, candidates: found.slice(0, SONG_MATCHES) };
}

const publicRef = ({ title, number, timesSung, lastSung }: SongRef) => ({ title, number, timesSung, lastSung });

/** What a tool answers when it cannot tell which song is meant. */
function unresolved(data: ConductorData, query: string) {
  const { candidates } = resolveSong(data, query);
  return candidates.length === 0
    ? { found: false as const, note: `No song matching "${query}" is in the records, the plans or the catalog.` }
    : {
        found: false as const,
        note: "More than one song matches. Ask which one is meant, or use one of these exact titles.",
        possibleSongs: candidates.map(publicRef),
      };
}

export function findSongs(data: ConductorData, query: string) {
  const { match, candidates } = resolveSong(data, query);
  return {
    query,
    exactMatch: match ? publicRef(match) : null,
    songs: candidates.map(publicRef),
  };
}

// ---------------------------------------------------------------------------
// One song
// ---------------------------------------------------------------------------

/** How many of a song's latest plays are listed. */
export const RECENT_PLAYS_LISTED = 10;

const includesSong = (service: DatedService, id: string) => service.songs.some((song) => songKey(song.title) === id);

export function songFacts(data: ConductorData, query: string) {
  const { match } = resolveSong(data, query);
  if (!match) return unresolved(data, query);

  const upcoming = data.upcoming.filter((service) => includesSong(service, match.id));
  const stats = buildSongStats(data.past, match.id, upcoming.map((service) => service.startsAt), data.now);
  const sungIn = data.past.filter((service) => includesSong(service, match.id)).reverse();
  const last = sungIn[0] ?? null;
  const catalogKey = data.catalog.find((song) => songKey(song.title) === match.id)?.defaultKey ?? null;

  return {
    found: true as const,
    song: { title: match.title, number: match.number },
    timesSung: stats.count,
    servicesSungIn: stats.services,
    firstSung: churchDateOf(stats.first),
    lastSung: churchDateOf(stats.last),
    daysSinceLastSung: stats.last ? Math.floor((data.now - Date.parse(stats.last)) / DAY_MS) : null,
    keysUsed: stats.keys.map(({ key, count }) => ({ key, times: count })),
    ...(catalogKey ? { usualKeyInPlannerCatalog: catalogKey } : {}),
    rankByHowOftenUsed: stats.rank ? { position: stats.rank.position, ofSongs: stats.rank.of, tied: stats.rank.joint } : null,
    howOftenItComesRound: stats.rhythm
      ? {
          usualGapDays: Math.round(stats.rhythm.medianDays),
          longestGapDays: stats.rhythm.longestDays,
          note:
            stats.rhythm.status === "due"
              ? "Past its usual gap: it is due."
              : stats.rhythm.status === "recent"
                ? "Sung more recently than its usual gap."
                : stats.rhythm.status === "scheduled"
                  ? "Already scheduled again."
                  : "Within its usual gap.",
        }
      : null,
    usualService: stats.weekly.habit,
    usualPlaceInService: stats.placement.habit,
    oftenSungWith: buildCompanions(data.past, match.id, siteConfig.songList.pairings).map((companion) => ({
      title: companion.title,
      number: companion.number,
      servicesTogether: companion.together,
      lastTogether: churchDateOf(companion.lastTogether),
    })),
    lastTimeItWasSung: last ? describeService(last, "sung") : null,
    recentTimesSung: sungIn.slice(0, RECENT_PLAYS_LISTED).map((service) => ({
      date: service.date,
      service: serviceName(service),
      key: service.songs.find((song) => songKey(song.title) === match.id)?.key ?? null,
    })),
    plannedFor: upcoming.map((service) => ({
      date: service.date,
      service: serviceName(service),
      status: service.status,
      key: service.songs.find((song) => songKey(song.title) === match.id)?.key ?? null,
    })),
    recordsBegin: recordsBegin(data),
  };
}

/** How many dates a period count lists. */
export const USES_LISTED = 40;

export function songUses(data: ConductorData, query: string, from: string, to: string) {
  const { match } = resolveSong(data, query);
  if (!match) return unresolved(data, query);

  const sungIn = data.past.filter((service) => service.date >= from && service.date <= to && includesSong(service, match.id));
  const keys = new Map<string, number>();
  for (const service of sungIn) {
    for (const song of service.songs) {
      if (songKey(song.title) === match.id && song.key) keys.set(song.key, (keys.get(song.key) ?? 0) + 1);
    }
  }
  return {
    found: true as const,
    song: { title: match.title, number: match.number },
    from,
    to,
    timesSung: sungIn.reduce((total, service) => total + service.songs.filter((song) => songKey(song.title) === match.id).length, 0),
    // An insert is sung at every service of its week on purpose, so its weeks say more than its services.
    ...(match.number === null ? { weeksSungIn: usageCount(match, sungIn) } : {}),
    keysUsed: [...keys].sort((a, b) => b[1] - a[1]).map(([key, times]) => ({ key, times })),
    dates: sungIn.slice(-USES_LISTED).map((service) => ({ date: service.date, service: serviceName(service) })),
    ...(sungIn.length > USES_LISTED ? { truncated: true } : {}),
    recordsBegin: recordsBegin(data),
  };
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

/** What Conductor calls a regular service nobody has posted: a planner knows it is theirs to start. */
const unplanned = (data: ConductorData) => (data.draftsIncluded ? "not started" : "not posted yet");

/** Planned services as the occurrence lists need them, so a special service appears and a renamed one keeps its name. */
const scheduled = (data: ConductorData) =>
  data.upcoming.map(({ date, slot, label, startsAt }) => ({ date, slot, label: label ?? null, startsAt }));

export function servicesOn(data: ConductorData, date: string, slot?: ServiceSlot) {
  const wanted = (service: Pick<DatedService, "date" | "slot">) => service.date === date && (!slot || service.slot === slot);
  const services = [
    ...data.past.filter(wanted).map((service) => describeService(service, "sung")),
    ...data.upcoming.filter(wanted).map((service) => describeService(service, service.status, service.emptyPlaces)),
  ];
  const known = new Set(services.map((service) => service.slot));

  // A service held that day with nothing recorded or posted is said to be so, not left out.
  const missing = serviceOccurrences(date, date, date >= data.today ? scheduled(data) : [])
    .filter((occurrence) => (!slot || occurrence.slot === slot) && !known.has(occurrence.slot))
    .map((occurrence) => ({
      date,
      slot: occurrence.slot,
      service: serviceName(occurrence),
      status: Date.parse(occurrence.startsAt) > data.now ? unplanned(data) : "no songs recorded",
    }));

  return {
    date,
    day: dateLabelFor(date),
    services,
    ...(missing.length > 0 ? { servicesWithNoSongs: missing } : {}),
    ...(services.length === 0 && missing.length === 0 ? { note: "No service is recorded or planned on that date." } : {}),
    recordsBegin: recordsBegin(data),
  };
}

/** How many services a list hands back. */
export const SERVICES_LISTED = 12;

export function listServices(
  data: ConductorData,
  filter: { from: string; to: string; type?: ServiceTypeFilter; song?: string },
) {
  const status = new Map<string, { status: ServiceStatus; emptyPlaces: number }>();
  for (const service of data.past) status.set(serviceAnchor(service.date, service.slot), { status: "sung", emptyPlaces: 0 });
  for (const service of data.upcoming) {
    status.set(serviceAnchor(service.date, service.slot), { status: service.status, emptyPlaces: service.emptyPlaces });
  }

  let songId: string | null = null;
  if (filter.song?.trim()) {
    const { match } = resolveSong(data, filter.song);
    if (!match) return unresolved(data, filter.song);
    songId = match.id;
  }

  // Exactly that song - the archive's own search matches any title containing the words.
  const matching = filterArchive(toArchive([...data.past, ...data.upcoming]), {
    ...NO_FILTER,
    from: filter.from,
    to: filter.to,
    type: filter.type ?? "all",
  })
    .filter((service) => !songId || service.songs.some((song) => songKey(song.title) === songId))
    .reverse();

  // Too many: the latest of a stretch of history, the soonest of what is still to come.
  const historyOnly = filter.to < data.today;
  const shown = historyOnly ? matching.slice(-SERVICES_LISTED) : matching.slice(0, SERVICES_LISTED);

  return {
    found: true as const,
    from: filter.from,
    to: filter.to,
    servicesMatching: matching.length,
    services: shown.map((service) => {
      const known = status.get(service.anchor)!;
      return describeService(service, known.status, known.emptyPlaces);
    }),
    ...(matching.length > shown.length
      ? { truncated: true, note: `Only the ${historyOnly ? "latest" : "first"} ${shown.length} are listed. Narrow the dates for the rest.` }
      : {}),
    recordsBegin: recordsBegin(data),
  };
}

/** How far ahead "what is planned" looks unless asked. */
export const UPCOMING_DAYS = 21;
export const UPCOMING_DAYS_MAX = 120;

export function upcomingServices(data: ConductorData, options: { days?: number; song?: string } = {}) {
  const days = Math.min(Math.max(1, Math.round(options.days ?? UPCOMING_DAYS)), UPCOMING_DAYS_MAX);
  const through = addDays(data.today, days);

  let songId: string | null = null;
  let songTitle: string | null = null;
  if (options.song?.trim()) {
    const { match } = resolveSong(data, options.song);
    if (!match) return unresolved(data, options.song);
    songId = match.id;
    songTitle = match.title;
  }

  const planned = new Map(data.upcoming.map((service) => [serviceAnchor(service.date, service.slot), service]));
  const services = serviceOccurrences(data.today, through, scheduled(data))
    .filter((occurrence) => Date.parse(occurrence.startsAt) > data.now)
    .flatMap((occurrence): Array<Record<string, unknown>> => {
      const plan = planned.get(serviceAnchor(occurrence.date, occurrence.slot));
      if (songId) return plan && includesSong(plan, songId) ? [describeService(plan, plan.status, plan.emptyPlaces)] : [];
      return plan
        ? [describeService(plan, plan.status, plan.emptyPlaces)]
        : [{ date: occurrence.date, slot: occurrence.slot, service: serviceName(occurrence), status: unplanned(data), songs: [] }];
    });

  return {
    found: true as const,
    today: data.today,
    through,
    ...(songTitle ? { song: songTitle } : {}),
    services: services.slice(0, SERVICES_LISTED * 2),
    ...(services.length > SERVICES_LISTED * 2 ? { truncated: true } : {}),
    ...(data.draftsIncluded
      ? { note: "Drafts are included: a draft is the planner's own work and has not been posted to the song list." }
      : { note: "Only services posted to the song list are known here." }),
  };
}

// ---------------------------------------------------------------------------
// Across the repertoire
// ---------------------------------------------------------------------------

export const SONGS_LISTED = 15;
export const SONGS_LISTED_MAX = 25;

const listSize = (limit: number | undefined) => Math.min(Math.max(1, Math.round(limit ?? SONGS_LISTED)), SONGS_LISTED_MAX);

export function songUsage(data: ConductorData, options: { from: string; to: string; order?: "most" | "least"; limit?: number }) {
  const inRange = data.past.filter((service) => service.date >= options.from && service.date <= options.to);
  const order = options.order ?? "most";
  const songs = buildSongRecords(inRange)
    .map((record) => ({
      title: record.title,
      number: record.number,
      // Uses, not performances: the week's insert counts once for its week (usageCount).
      timesUsed: usageCount(record, record.plays),
      timesSung: record.plays.length,
      lastSung: churchDateOf(record.plays.at(-1)!.startsAt)!,
    }))
    .sort((a, b) =>
      order === "most"
        ? b.timesUsed - a.timesUsed || b.lastSung.localeCompare(a.lastSung)
        : a.timesUsed - b.timesUsed || a.lastSung.localeCompare(b.lastSung),
    );
  const limit = listSize(options.limit);

  return {
    from: options.from,
    to: options.to,
    order: order === "most" ? "most used first" : "least used first (of the songs sung in the period)",
    servicesInPeriod: inRange.length,
    differentSongsInPeriod: songs.length,
    songs: songs.slice(0, limit),
    ...(songs.length > limit ? { truncated: true } : {}),
    note: "timesUsed counts a week's insert once for its week; timesSung counts every service.",
    recordsBegin: recordsBegin(data),
  };
}

export function songsNotSungSince(data: ConductorData, options: { days: number; minTimesSung?: number; limit?: number }) {
  const days = Math.max(1, Math.round(options.days));
  const cutoff = data.now - days * DAY_MS;
  const minTimesSung = Math.max(1, Math.round(options.minTimesSung ?? 2));
  const planned = new Set(data.upcoming.flatMap((service) => service.songs.map((song) => songKey(song.title))));
  const seasonal = christmasSongs(data.past);

  const songs = buildSongRecords(data.past)
    .filter((record) => record.plays.length >= minTimesSung && Date.parse(record.plays.at(-1)!.startsAt) < cutoff)
    .filter((record) => !planned.has(record.id))
    .map((record) => ({
      title: record.title,
      number: record.number,
      timesSung: record.plays.length,
      lastSung: churchDateOf(record.plays.at(-1)!.startsAt)!,
      daysSince: Math.floor((data.now - Date.parse(record.plays.at(-1)!.startsAt)) / DAY_MS),
      ...(seasonal.has(record.id) ? { christmasSong: true } : {}),
    }))
    // The most sung of the neglected songs first; among equals, the longest unsung.
    .sort((a, b) => b.timesSung - a.timesSung || b.daysSince - a.daysSince);
  const limit = listSize(options.limit);

  return {
    notSungForDays: days,
    sungAtLeastTimes: minTimesSung,
    songsMatching: songs.length,
    songs: songs.slice(0, limit),
    ...(songs.length > limit ? { truncated: true } : {}),
    note: "Songs already planned for an upcoming service are left out. Most sung first.",
    recordsBegin: recordsBegin(data),
  };
}

export function yearSummary(data: ConductorData, year: number) {
  const years = availableYears(data.past);
  const recap = buildYearRecap(data.past, year, data.now);
  if (!recap) return { found: false as const, note: `Nothing is recorded for ${year}.`, yearsWithRecords: years };

  return {
    found: true as const,
    year,
    ...(recap.partial ? { partialYear: recap.partial === "in-progress" ? "still under way" : "the records began partway through it" } : {}),
    firstService: churchDateOf(recap.from),
    latestService: churchDateOf(recap.to),
    services: recap.services,
    songsSung: recap.songsSung,
    differentSongs: recap.differentSongs,
    differentHymnsFromTheHymnal: recap.differentHymns,
    mostUsedSongs: recap.topSongs.map(({ title, number, count, weekly }) => ({ title, number, timesUsed: count, ...(weekly ? { countedByWeek: true } : {}) })),
    keys: recap.keys.map(({ key, count }) => ({ key, times: count })),
    songsUsedOnlyOnce: recap.once.length,
    longestWaitBeforeReturning: recap.longestWait
      ? { title: recap.longestWait.title, days: recap.longestWait.days, sungAgainOn: churchDateOf(recap.longestWait.after) }
      : null,
    yearsWithRecords: years,
  };
}

// ---------------------------------------------------------------------------
// Planning checks
// ---------------------------------------------------------------------------

/**
 * A song against one service: when it was last sung before it, and where else
 * it is planned - the facts the planner's song picker shows (candidateFacts),
 * worked out the same way.
 */
export function checkSongForService(data: ConductorData, query: string, date: string, slot: ServiceSlot) {
  const { match } = resolveSong(data, query);
  if (!match) return unresolved(data, query);

  const startsAt =
    data.upcoming.find((service) => service.date === date && service.slot === slot)?.startsAt ??
    data.past.find((service) => service.date === date && service.slot === slot)?.startsAt ??
    startsAtFor(date, slot);
  const candidate = buildCandidates({
    past: data.past,
    planned: data.upcoming,
    catalog: data.catalog,
    index: null,
    hymnalCollection: siteConfig.sheetMusic.hymnalCollection,
  }).find((item) => item.id === match.id);
  if (!candidate) return unresolved(data, query);

  const { recentDays } = siteConfig.servicePlanner;
  const facts = candidateFacts(candidate, startsAt);
  const start = Date.parse(startsAt);
  const alsoPlanned = facts.upcoming.map((at) => {
    const service = data.upcoming.find((item) => item.startsAt === at);
    return {
      date: churchDateOf(at),
      service: service ? serviceName(service) : null,
      status: service?.status ?? null,
      withinRecentWindow: Math.abs(Date.parse(at) - start) <= recentDays * DAY_MS,
    };
  });

  return {
    found: true as const,
    song: { title: match.title, number: match.number },
    service: { date, slot, service: serviceName({ date, slot }) },
    lastSungBeforeIt: churchDateOf(facts.lastSung),
    daysBetween: facts.daysSince,
    recentWindowDays: recentDays,
    sungWithinRecentWindow: facts.daysSince !== null && facts.daysSince <= recentDays,
    timesInTheYearBefore: facts.lastYear,
    timesSoFarThatYear: facts.thisYear,
    recentKeys: facts.recentKeys,
    alsoPlannedFor: alsoPlanned,
    plannedNearby: alsoPlanned.some((item) => item.withinRecentWindow),
    ...(candidate.christmas ? { christmasSong: true, serviceInChristmasSeason: inChristmasSeason(date) } : {}),
    note: `The planner flags a song sung, or planned again, within ${recentDays} days. The week's insert repeating within its own week is intended.`,
  };
}

const SIGNAL_MEANING: Record<PlanningSignal["kind"], string> = {
  duplicate: "The same song is in this service twice.",
  "recently-sung": "Sung shortly before this service.",
  "planned-nearby": "Also planned for another service close to this one.",
  "repeated-pair": "Two of this service's songs were sung together not long ago.",
  "out-of-season": "A Christmas song outside the Christmas season.",
  "no-sheet-music-entry": "Not in the Sheet Music Index.",
  "sheet-music-gap": "Some expected musicians have none of their sheet music for it.",
  "capo-needed": "Needs capo sheet music it does not have.",
  "no-sheet-music": "None of the service's songs has sheet music for the expected musicians.",
  "key-differs": "Planned in a key other than the song's own.",
  "empty-places": "Places not filled yet.",
};

/**
 * What the Service Planner already notices about a stored service - the same
 * signals its workspace shows (serviceSignals), from the SAVED plan. Changes
 * a planner has made but not saved are not here.
 */
export function planCheck(workspace: WorkspaceData) {
  const { service } = workspace;
  const candidates = new Map(workspace.candidates.map((candidate) => [candidate.id, candidate]));
  const signals = serviceSignals({
    service: { startsAt: service.startsAt, date: service.date, slots: service.slots },
    past: workspace.recentPast,
    planned: workspace.planned,
    sheetMusic: workspace.sheetMusicChecked ? candidateSheetMusicCheck(candidates) : null,
  });

  return {
    found: true as const,
    service: { date: service.date, slot: service.slot, service: serviceName(service), status: service.status },
    places: service.slots.map((song, index) =>
      song
        ? { place: index + 1, title: song.title, number: song.number, key: song.key, ...(song.insert ? { insert: true } : {}) }
        : { place: index + 1, empty: true },
    ),
    whatThePlannerNotices: signals.map((signal) => ({ ...signal, meaning: SIGNAL_MEANING[signal.kind] })),
    ...(signals.length === 0 ? { note: "The planner notices nothing about this service." } : {}),
    ...(workspace.availability
      ? {
          musiciansExpected: workspace.availability.expected.map((person) => person.name),
          musiciansAway: workspace.availability.away.map((person) => person.name),
        }
      : {}),
    basis: "The saved plan. Unsaved changes on the planner's screen are not included.",
  };
}
