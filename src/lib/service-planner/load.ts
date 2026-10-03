import "server-only";

import { siteConfig } from "@/config/site";
import { servicePlannerContent } from "@/content/service-planner";
import { listAccounts } from "@/lib/auth/clerk";
import type { Viewer } from "@/lib/auth/session";
import { sheetMusicTypesForUsers } from "@/lib/auth/store";
import { loadRoster } from "@/lib/availability/load";
import { addDays, churchDate, findOccurrence, isMonthString, monthRange, serviceOccurrences } from "@/lib/availability/occurrences";
import { listExceptions } from "@/lib/availability/store";
import { getSheetMusicIndex } from "@/lib/sheet-music-index";
import { toArchive } from "@/lib/service-archive";
import { serviceAnchor } from "@/lib/site-search";
import { loadPast } from "@/lib/song-archive";
import type { DatedService } from "@/types/song-list";

import type { ExportService } from "./export";
import {
  buildCandidates,
  serviceAvailability,
  type CandidateSong,
  type PlannerMusician,
  type ServiceAvailability,
} from "./intelligence";
import {
  defaultHorizon,
  isLocked,
  parseAnchor,
  plannerService,
  slotSongs,
  takesWeekInsert,
  weekStartOf,
  type InsertWeek,
  type PlannerService,
} from "./model";
import { buildQueue, plannerServices, type PlannerQueue } from "./queue";
import { listCatalogSongs, listInsertWeeks, listPlanEvents, listPlans, type PlanEvent } from "./store";

/**
 * The reads behind the Service Planner's pages. Every caller has already
 * checked manage_service_plans (the pages and actions in
 * src/app/service-planner/) - drafts are read here and nowhere else.
 */

/** How far past a service the planner still lists its "planned nearby" songs. */
const NEARBY_DAYS = 120;
/** How far back the workspace's checks look for repeated pairings. */
const PAIR_LOOKBACK_DAYS = 120;

export interface QueueData {
  now: number;
  today: string;
  /** The last day listed. */
  through: string;
  /** The month "Plan further ahead" extends to. */
  nextThrough: string;
  queue: PlannerQueue;
}

/** The queue: every service from today to the horizon (or to the end of `throughMonth`). */
export async function loadQueue(viewer: Viewer, throughMonth: string | null): Promise<QueueData> {
  const now = Date.now();
  const today = churchDate(now);
  const horizon = defaultHorizon(today);
  const requested = throughMonth && isMonthString(throughMonth) ? monthRange(throughMonth).to : null;
  const through = requested && requested > horizon ? requested : horizon;

  const [plans, weeks] = await Promise.all([
    listPlans(viewer.env, { from: today, to: through }),
    listInsertWeeks(viewer.env, weekStartOf(today), through),
  ]);
  const services = plannerServices({ from: today, to: through }, plans, weeks);

  const lastMonth = through.slice(0, 7);
  const [year, number] = lastMonth.split("-").map(Number);
  const nextThrough = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;

  return {
    now,
    today,
    through,
    nextThrough,
    queue: buildQueue(services, now),
  };
}

export interface WorkspaceData {
  now: number;
  service: PlannerService;
  week: InsertWeek | null;
  locked: boolean;
  candidates: CandidateSong[];
  /** Recent past services, for the repeated-pairing check in the browser. */
  recentPast: DatedService[];
  /** Other services still to come (drafts included), for "planned nearby". */
  planned: Array<{ startsAt: string; songs: Array<{ title: string }> }>;
  /** Null when the Sheet Music Index cannot be read. */
  sheetMusicChecked: boolean;
  availability: ServiceAvailability | null;
  events: Array<PlanEvent & { actorName: string | null }>;
  createdBy: string | null;
  publishedBy: string | null;
  updatedBy: string | null;
}

/** Everything the planning workspace needs for one service; null when no service is held then. */
export async function loadWorkspace(viewer: Viewer, anchor: string): Promise<WorkspaceData | null> {
  const parsed = parseAnchor(anchor);
  if (!parsed) return null;
  const { date, slot } = parsed;
  const now = Date.now();
  const today = churchDate(now);

  const [plans, weeks] = await Promise.all([
    listPlans(viewer.env, { from: addDays(date < today ? date : today, -1), to: addDays(date > today ? date : today, NEARBY_DAYS) }),
    listInsertWeeks(viewer.env, weekStartOf(date), weekStartOf(date)),
  ]);
  const plan = plans.find((item) => item.date === date && item.slot === slot) ?? null;
  const occurrence = findOccurrence(
    serviceOccurrences(date, date, plan ? [{ date, slot, label: plan.label, startsAt: plan.startsAt }] : []),
    date,
    slot,
  );
  if (!occurrence) return null;

  const week = weeks[0] ?? null;
  const service = plannerService(occurrence, plan, week);

  const [history, catalog, index, availability] = await Promise.all([
    loadPast(),
    listCatalogSongs(viewer.env),
    getSheetMusicIndex(),
    loadServiceAvailability(viewer, occurrence),
  ]);
  const past = history?.past ?? [];
  const planned = plans
    .filter((item) => item !== plan && item.status !== "cancelled" && Date.parse(item.startsAt) > now)
    .map((item) => ({ startsAt: item.startsAt, songs: slotSongs(item.slots).map(({ title }) => ({ title })) }));

  const candidates = buildCandidates({
    past,
    musicians: availability?.musicians ?? [],
    planned,
    catalog,
    index: index.ok ? index.index : null,
    hymnalCollection: siteConfig.sheetMusic.hymnalCollection,
  });

  const events = plan ? await listPlanEvents(viewer.env, plan.id) : [];
  const names = await namesFor([
    ...events.map((event) => event.actor),
    plan?.created.by ?? null,
    plan?.updated.by ?? null,
    plan?.published?.by ?? null,
  ]);
  const start = Date.parse(service.startsAt);

  return {
    now,
    service,
    week,
    locked: isLocked(service.startsAt, now),
    candidates,
    recentPast: past.filter(
      (item) => Date.parse(item.startsAt) < start && Date.parse(item.startsAt) > start - PAIR_LOOKBACK_DAYS * 86_400_000,
    ),
    planned,
    sheetMusicChecked: index.ok,
    availability: availability?.summary ?? null,
    events: events.map((event) => ({ ...event, actorName: event.actor ? (names.get(event.actor) ?? null) : null })),
    createdBy: plan?.created.by ? (names.get(plan.created.by) ?? null) : null,
    publishedBy: plan?.published?.by ? (names.get(plan.published.by) ?? null) : null,
    updatedBy: plan?.updated.by ? (names.get(plan.updated.by) ?? null) : null,
  };
}

/** Who is expected (and away) at a service, with their sheet music types; null if it cannot be read. */
async function loadServiceAvailability(
  viewer: Viewer,
  occurrence: { date: string; slot: "AM" | "PM"; normalKey: Parameters<typeof serviceAvailability>[0]["normalKey"] },
): Promise<{ summary: ServiceAvailability; musicians: PlannerMusician[] } | null> {
  try {
    const [roster, exceptions] = await Promise.all([
      loadRoster(viewer.env),
      listExceptions(viewer.env, occurrence.date, occurrence.date),
    ]);
    const summary = serviceAvailability(
      occurrence,
      roster,
      exceptions.filter((row) => row.slot === occurrence.slot),
    );
    const types = await sheetMusicTypesForUsers(
      viewer.env,
      summary.expected.map((person) => person.id),
    );
    return {
      summary,
      musicians: summary.expected.map((person) => ({ ...person, typeIds: types.get(person.id) ?? [] })),
    };
  } catch (error) {
    console.error("[service-planner] Could not load availability:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

/** Display names for Clerk user ids; the one-time import is named as such, and unknown ids are left out. */
export async function namesFor(ids: ReadonlyArray<string | null>): Promise<Map<string, string>> {
  const imported = ids.includes("import") ? ([["import", servicePlannerContent.history.imported]] as const) : [];
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id) && id!.startsWith("user_")))];
  if (wanted.length === 0) return new Map(imported);
  const accounts = await listAccounts({ userIds: wanted, limit: 100, offset: 0 });
  if (!accounts.ok) return new Map(imported);
  return new Map([
    ...imported,
    ...accounts.value.accounts.map((account) => [account.id, account.fullName || account.firstName || "Someone"] as const),
  ]);
}

export interface InsertsData {
  now: number;
  weeks: Array<{
    weekStart: string;
    insert: InsertWeek | null;
    /** The week's services that take its insert. */
    services: PlannerService[];
  }>;
  candidates: CandidateSong[];
  nextCount: number;
}

/** The Inserts page: `count` weeks from this one. */
export async function loadInserts(viewer: Viewer, count: number): Promise<InsertsData> {
  const now = Date.now();
  const firstWeek = weekStartOf(churchDate(now));
  const lastDay = addDays(firstWeek, count * 7 - 1);

  const [plans, weeks, history, catalog, index] = await Promise.all([
    listPlans(viewer.env, { from: firstWeek, to: lastDay }),
    listInsertWeeks(viewer.env, firstWeek, lastDay),
    loadPast(),
    listCatalogSongs(viewer.env),
    getSheetMusicIndex(),
  ]);
  const services = plannerServices({ from: firstWeek, to: lastDay }, plans, weeks);

  return {
    now,
    weeks: Array.from({ length: count }, (_, offset) => {
      const weekStart = addDays(firstWeek, offset * 7);
      return {
        weekStart,
        insert: weeks.find((week) => week.weekStart === weekStart) ?? null,
        services: services.filter(
          (service) => weekStartOf(service.date) === weekStart && takesWeekInsert(service.date, service.slot),
        ),
      };
    }),
    candidates: buildCandidates({
      past: history?.past ?? [],
      planned: [],
      catalog,
      index: index.ok ? index.index : null,
      hymnalCollection: siteConfig.sheetMusic.hymnalCollection,
    }),
    nextCount: count + siteConfig.servicePlanner.insertWeeks,
  };
}


/** How far ahead the Dashboard looks for services needing planning. */
const DASHBOARD_DAYS = 14;

/**
 * The services needing planning in the next two weeks, soonest first - the
 * Dashboard's planner items. null when the planner cannot be read (the
 * Dashboard then simply leaves them out).
 */
export async function loadPlannerWork(viewer: Viewer): Promise<PlannerService[] | null> {
  try {
    const now = Date.now();
    const today = churchDate(now);
    const to = addDays(today, DASHBOARD_DAYS);
    const [plans, weeks] = await Promise.all([
      listPlans(viewer.env, { from: today, to }),
      listInsertWeeks(viewer.env, weekStartOf(today), to),
    ]);
    return buildQueue(plannerServices({ from: today, to }, plans, weeks), now).needsPlanning;
  } catch (error) {
    console.error("[service-planner] Could not load the Dashboard's work:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

/**
 * The services an export covers: the planner's (published, plus drafts when
 * asked), and - for dates before the planner - the archive's, so a range of
 * history exports too. `anchors`, when given, narrows it to those services.
 */
export async function loadExport(
  viewer: Viewer,
  scope: { from: string; to: string; anchors: string[] | null; drafts: boolean },
): Promise<ExportService[]> {
  const [plans, history] = await Promise.all([
    listPlans(viewer.env, { from: scope.from, to: scope.to, statuses: scope.drafts ? ["published", "draft"] : ["published"] }),
    loadPast(),
  ]);
  const wanted = scope.anchors ? new Set(scope.anchors) : null;
  const keep = (date: string, slot: "AM" | "PM") => !wanted || wanted.has(serviceAnchor(date, slot));

  const services: ExportService[] = plans
    .filter((plan) => keep(plan.date, plan.slot))
    .map((plan) => ({
      date: plan.date,
      slot: plan.slot,
      startsAt: plan.startsAt,
      label: plan.label,
      special: plan.kind === "special",
      status: plan.status === "draft" ? "draft" : "published",
      slots: plan.slots,
    }));
  const planned = new Set(plans.map((plan) => serviceAnchor(plan.date, plan.slot)));

  for (const service of toArchive(history?.past ?? [])) {
    if (service.date < scope.from || service.date > scope.to) continue;
    if (planned.has(service.anchor) || !keep(service.date, service.slot)) continue;
    services.push({
      date: service.date,
      slot: service.slot,
      startsAt: service.startsAt,
      label: service.label,
      special: service.special,
      status: "archived",
      slots: service.songs.map((song) => ({ title: song.title, number: song.number, key: song.key, insert: song.insert === true })),
    });
  }

  return services;
}
