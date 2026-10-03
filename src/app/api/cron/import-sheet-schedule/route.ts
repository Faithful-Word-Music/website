import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { regularKeyFor } from "@/lib/availability/occurrences";
import { saveServices } from "@/lib/archive-store";
import { isCronAuthorized } from "@/lib/cron-auth";
import { readSheetSchedule } from "@/lib/google-sheets";
import { scheduleEnv } from "@/lib/schedule";
import { siteConfig } from "@/config/site";
import { takesWeekInsert, weekStartOf, type InsertWeek, type PlanSlots } from "@/lib/service-planner/model";
import { getPlan, publishPlans, savePlan, setInsertWeek } from "@/lib/service-planner/store";
import { monthInTitle } from "@/lib/service-time";
import { ARCHIVE_TAG } from "@/lib/song-archive";
import { pastServices } from "@/lib/song-history";
import { datedServices, serviceSlots, songKey } from "@/lib/song-list";
import type { Service } from "@/types/song-list";

/**
 * GET /api/cron/import-sheet-schedule - ONE-TIME, then delete.
 *
 * Moves the song list off the retired Google Sheet:
 *
 *   1. a last archive sync: every past service in the sheet is saved to the
 *      permanent archive (the usual rule - recent ones refreshed, older ones
 *      frozen), so nothing sung before the switch is lost;
 *   2. the sheet's services become Service Planner services in this
 *      deployment's environment: everything on the visible tabs (this month's
 *      earlier services too) as PUBLISHED - one publication, as they were
 *      already public - and hidden tabs' future services as drafts. A
 *      future service still being filled in ("TBD" places) comes over as a
 *      draft too, so it lands in the planner's queue. A song in the third
 *      place of all of a week's services is taken to be that week's insert. A service already in the planner is left alone, so running it
 *      twice changes nothing.
 *
 *   ?dry=1   report what would happen, write nothing
 *
 * Needs `Authorization: Bearer $CRON_SECRET`, like the cron jobs. Not in
 * vercel.json: it is run by hand, once, on Production.
 */
export const dynamic = "force-dynamic";

const ACTOR = "import";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return NextResponse.json({ ok: false }, { status: 401 });

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const env = scheduleEnv();
  const now = Date.now();

  const sheet = await readSheetSchedule();
  if (!sheet.ok) return NextResponse.json({ ok: false, reason: sheet.reason }, { status: 503 });

  // 1. The last archive sync - Production's history only.
  const past = pastServices(datedServices(sheet.allMonths), now);
  const archive = dry || env !== "production" ? { skipped: true, services: past.length } : await saveServices(past, now);

  // 2. Services: visible tabs first, then hidden tabs' future ones.
  const visible = new Set(sheet.months.flatMap((month) => month.services.map((service) => service.id)));
  const seen = new Set<string>();
  const upcoming: Array<{ service: Service & { date: string; slot: "AM" | "PM"; startsAt: string }; tab: string; publish: boolean }> = [];
  for (const month of [...sheet.months, ...sheet.allMonths]) {
    for (const service of month.services) {
      if (service.placeholder || !service.date || !service.slot || !service.startsAt) continue;
      // The visible months come over whole, so this month's earlier services stay
      // on the song list; from hidden tabs only what is still to come.
      if (!visible.has(service.id) && Date.parse(service.startsAt) <= now) continue;
      if (service.songs.length === 0 && service.pendingSongs === 0) continue;
      const key = `${service.date}|${service.slot}`;
      if (seen.has(key)) continue;
      seen.add(key);
      upcoming.push({
        service: service as Service & { date: string; slot: "AM" | "PM"; startsAt: string },
        tab: month.title,
        publish: visible.has(service.id),
      });
    }
  }

  // The sheet never marked inserts. Where every one of a week's insert
  // services has the same song in the insert's place, that song is taken to be
  // the week's insert: it seeds the Inserts page, and those services follow it.
  const insertPlace = siteConfig.servicePlanner.insertPosition - 1;
  const byWeek = new Map<string, Array<(typeof upcoming)[number]["service"]>>();
  for (const { service } of upcoming) {
    if (!takesWeekInsert(service.date, service.slot)) continue;
    const week = weekStartOf(service.date);
    byWeek.set(week, [...(byWeek.get(week) ?? []), service]);
  }
  const weekInserts = new Map<string, InsertWeek>();
  for (const [weekStart, services] of byWeek) {
    const songs = services.map((service) => serviceSlots(service)[insertPlace] ?? null);
    const first = songs[0];
    // A hymn from the hymnal is never an insert, even in the insert's place.
    if (services.length < 2 || !first || first.number !== null || songs.some((song) => !song || songKey(song.title) !== songKey(first.title))) continue;
    weekInserts.set(weekStart, { weekStart, title: first.title, number: first.number, key: first.key });
  }

  const report: Array<{ service: string; songs: number; status: string; result: string }> = [];
  const toPublish: Array<{ date: string; slot: "AM" | "PM" }> = [];

  for (const { service, tab, publish: visibleTab } of upcoming) {
    const name = `${service.date} ${service.slot}`;
    const week = takesWeekInsert(service.date, service.slot) ? (weekInserts.get(weekStartOf(service.date)) ?? null) : null;
    const slots: PlanSlots = serviceSlots(service).map((song, index) =>
      song ? { ...song, insert: week !== null && index === insertPlace } : null,
    );
    // Finished (or already held) services stay public; a service still being
    // filled in comes over as a draft, so it is in the planner's queue.
    const publish = visibleTab && (service.pendingSongs === 0 || Date.parse(service.startsAt) <= now);
    const status = publish ? "published" : "draft";
    const regular = regularKeyFor(service.date, service.slot) !== null;
    // A special service is named after its tab when the tab is not a month ("Missions Conference 2025").
    const label = regular ? null : monthInTitle(tab) === null ? tab.replace(/\s*\d{4}\s*$/, "").trim() || null : null;

    if (dry) {
      report.push({ service: name, songs: service.songs.length, status, result: "would import" });
      continue;
    }
    if (await getPlan(env, service.date, service.slot)) {
      report.push({ service: name, songs: service.songs.length, status, result: "already in the planner" });
      continue;
    }
    const saved = await savePlan(
      env,
      {
        date: service.date,
        slot: service.slot,
        kind: regular ? "regular" : "special",
        label,
        startsAt: service.startsAt,
        // Only services whose week's insert was recognised follow the week.
        insertMode: week ? "week" : "custom",
        slots,
      },
      null,
      ACTOR,
      [],
    );
    report.push({ service: name, songs: service.songs.length, status, result: saved.ok ? "imported" : "already in the planner" });
    if (saved.ok && publish) toPublish.push({ date: service.date, slot: service.slot });
  }

  const publication = toPublish.length > 0 ? await publishPlans(env, toPublish, ACTOR) : null;
  if (!dry) {
    for (const week of weekInserts.values()) await setInsertWeek(env, week.weekStart, week, ACTOR);
  }

  if (!dry) {
    revalidateTag(ARCHIVE_TAG, "max");
    revalidatePath("/", "layout");
  }

  return NextResponse.json({ ok: true, dry, env, archive, publication, inserts: [...weekInserts.values()], services: report });
}
