/**
 * How the planner names services and progress, shared by its pages, the
 * Dashboard and exports. Pure; dates are read in church time so the server
 * and the browser agree.
 */

import { siteConfig } from "@/config/site";
import { servicePlannerContent } from "@/content/service-planner";
import type { ServiceSlot } from "@/types/song-list";

import type { PlannerStatus } from "./model";

const { timeZone } = siteConfig.songList;
const copy = servicePlannerContent;

const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" });
const dayMonth = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
const monthDayFormat = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
const fullDate = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** "Sunday Morning", "Wednesday Evening" - or a special service's own name. */
export function serviceTitle(service: { slot: ServiceSlot; startsAt: string; label: string | null }): string {
  if (service.label) return service.label;
  return `${weekday.format(new Date(service.startsAt))} ${service.slot === "AM" ? "Morning" : "Evening"}`;
}

/** "Oct 11" */
export function monthDay(startsAt: string): string {
  return monthDayFormat.format(new Date(startsAt));
}

/** "Sun, Oct 11" */
export function serviceDate(startsAt: string): string {
  return dayMonth.format(new Date(startsAt));
}

/** "Sunday, October 11, 2026" */
export function serviceFullDate(startsAt: string): string {
  return fullDate.format(new Date(startsAt));
}

/** "Sunday Morning · Sun, Oct 11" */
export function serviceHeadline(service: { slot: ServiceSlot; startsAt: string; label: string | null }): string {
  return `${serviceTitle(service)} · ${serviceDate(service.startsAt)}`;
}

/** "3 of 5 songs" */
export function progressLabel(filled: number, target: number): string {
  return copy.progress.replace("{filled}", String(filled)).replace("{target}", String(target));
}

/** "Draft · 3 of 5 songs", "Published", "Not started". */
export function statusLine(service: { status: PlannerStatus; filled: number; target: number }): string {
  const status = copy.status[service.status];
  if (service.status === "draft" || (service.status === "not-started" && service.filled > 0)) {
    return `${status} · ${progressLabel(service.filled, service.target)}`;
  }
  return status;
}

/** "HH:MM" on the church's clock for a start instant: "2026-10-11T18:00:00-07:00" -> "18:00". */
export function churchTimeOf(startsAt: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(
    new Date(startsAt),
  );
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

/** The start instant for a date and a church-clock time: ("2026-10-16", "19:00") -> "2026-10-16T19:00:00-07:00". */
export function startsAtAt(date: string, time: string): string {
  return `${date}T${time}:00${siteConfig.songList.utcOffset}`;
}
