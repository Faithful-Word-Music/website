import { z } from "zod";

import { dateLabelFor } from "@/lib/service-time";

/**
 * What Conductor is told about the page it was opened over - so "this
 * service" or "this song" means something. Deliberately small and typed: the
 * area of the site, and the stable identifier in the page's address (a
 * service's anchor, a song's slug, a year). Nothing is read from what the
 * page shows, and nothing a person has typed but not saved.
 *
 * The browser works it out from the path (pageContextFor); the server trusts
 * none of it until it has passed normalizePageContext. An identifier only
 * ever becomes the input of a read-only tool, which checks permissions for
 * itself - so a made-up one finds nothing the person could not already see.
 *
 * Later phases add to this (the planner's unsaved places, say) as further
 * optional fields. Pure - shared by the browser and the server, unit tested.
 */

export const CONDUCTOR_AREAS = [
  "dashboard",
  "service-planner",
  "inserts",
  "song-list",
  "song-archive",
  "service-archive",
  "year",
  "library",
  "availability",
  "admin",
  "other",
] as const;

export type ConductorArea = (typeof CONDUCTOR_AREAS)[number];

export interface ConductorPageContext {
  area: ConductorArea;
  /** A service's anchor: "2026-10-11-am". */
  service?: string;
  /** A song's slug: "blessed-assurance". */
  song?: string;
  year?: number;
}

const ANCHOR = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])-(am|pm)$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const isAnchor = (value: string | undefined): value is string => value !== undefined && ANCHOR.test(value);
const isSlug = (value: string | undefined): value is string => value !== undefined && value.length <= 120 && SLUG.test(value);
const isYear = (value: number) => Number.isInteger(value) && value >= 2000 && value <= 2100;

/** The context of the page at `pathname`. Unknown pages are simply "other". */
export function pageContextFor(pathname: string): ConductorPageContext {
  const [first, second, third, fourth] = pathname.split("?")[0].split("/").filter(Boolean);

  if (first === "dashboard") return { area: "dashboard" };
  if (first === "availability") return { area: "availability" };
  if (first === "admin") return { area: "admin" };

  if (first === "service-planner") {
    if (second === "inserts") return { area: "inserts" };
    return isAnchor(second) ? { area: "service-planner", service: second } : { area: "service-planner" };
  }

  if (first === "library") {
    return second === "songs" && isSlug(third) ? { area: "library", song: third } : { area: "library" };
  }

  if (first === "song-list") {
    if (second === "year") {
      const year = Number(third);
      return third !== undefined && isYear(year) ? { area: "year", year } : { area: "year" };
    }
    if (second === "archive") {
      if (third !== "services") return { area: "song-archive" };
      return isAnchor(fourth) ? { area: "service-archive", service: fourth } : { area: "service-archive" };
    }
    return { area: "song-list" };
  }

  return { area: "other" };
}

const contextSchema = z.object({
  area: z.enum(CONDUCTOR_AREAS),
  service: z.string().regex(ANCHOR).optional(),
  song: z.string().max(120).regex(SLUG).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
});

/**
 * What the browser sent, as a context the server will use - or null for
 * anything that is not one. A bad context never fails the question: Conductor
 * just answers without knowing the page.
 */
export function normalizePageContext(value: unknown): ConductorPageContext | null {
  const parsed = contextSchema.safeParse(value);
  if (!parsed.success) return null;
  const { area, service, song, year } = parsed.data;
  return {
    area,
    ...(service ? { service } : {}),
    ...(song ? { song } : {}),
    ...(year ? { year } : {}),
  };
}

const AREA_NAMES: Record<ConductorArea, string | null> = {
  dashboard: "their Dashboard",
  "service-planner": "the Service Planner",
  inserts: "the Service Planner's Inserts page",
  "song-list": "the Song List",
  "song-archive": "the song archive",
  "service-archive": "the archive of past services",
  year: "the year in song",
  library: "the Library",
  availability: "Availability",
  admin: "the Admin area",
  other: null,
};

/**
 * The context as lines for Conductor's instructions; null when the page says
 * nothing useful. Identifiers are given in the form the tools take.
 */
export function describePageContext(context: ConductorPageContext | null): string | null {
  if (!context) return null;
  const lines: string[] = [];
  const area = AREA_NAMES[context.area];
  if (area) lines.push(`The person has Conductor open over ${area}.`);

  if (context.service) {
    const date = context.service.slice(0, 10);
    const slot = context.service.endsWith("am") ? "AM" : "PM";
    lines.push(
      `The service on that page is ${dateLabelFor(date)}, ${slot} (date ${date}, slot ${slot}). "This service", "this plan" and "these songs" mean that service: look it up with the tools before saying anything about it.`,
    );
  }
  if (context.song) {
    lines.push(
      `The song on that page has the address "${context.song}" (search for "${context.song.replace(/-/g, " ")}"). "This song" and "it" mean that song: look it up with the tools before saying anything about it.`,
    );
  }
  if (context.year) lines.push(`The year on that page is ${context.year}.`);
  if (lines.length === 0) return null;
  lines.push("You know only this about the page - not what it shows, and nothing typed there that has not been saved.");
  return lines.join("\n");
}
