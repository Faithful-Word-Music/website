/**
 * How the Support Center writes things out: a service's name, a song, the
 * one-line summary of what a request is about. Pure; shared by the pages and
 * the browser.
 */

import { supportContent } from "@/content/support";
import { serviceHeadline } from "@/lib/service-planner/format";

import type { SupportContext, SongSnapshot } from "./context";

/** "Sunday Morning · Sun, Nov 8" - from a service's date when its start time is not known. */
export function serviceName(service: { date: string; slot: "AM" | "PM"; label: string | null; startsAt: string | null }): string {
  // Noon in church time is the right weekday whatever the server's clock.
  return serviceHeadline({ slot: service.slot, label: service.label, startsAt: service.startsAt ?? `${service.date}T12:00:00-07:00` });
}

/** "12 · Amazing Grace (G)" */
export function songName(song: Pick<SongSnapshot, "title" | "number"> & { key?: string | null }): string {
  const base = song.number ? `${song.number} · ${song.title}` : song.title;
  return song.key ? `${base} (${song.key})` : base;
}

/** "songs 2 and 5" */
export function positionsText(positions: readonly number[]): string {
  if (positions.length === 0) return "";
  const list = positions.length === 1 ? String(positions[0]) : `${positions.slice(0, -1).join(", ")} and ${positions[positions.length - 1]}`;
  return `${positions.length === 1 ? "song" : "songs"} ${list}`;
}

/** The lines a context is shown as, most important first. */
export function contextLines(context: SupportContext): string[] {
  const copy = supportContent.detail;
  const lines: string[] = [];
  if (context.service) lines.push(serviceName(context.service));
  if (context.place) {
    const where = copy.position.replace("{n}", String(context.place.position));
    lines.push(context.place.song ? `${where}: ${songName(context.place.song)}` : `${where}: ${copy.emptyPlace}`);
  }
  if (context.song) lines.push(songName(context.song));
  if (context.sheetMusic) lines.push(context.sheetMusic.label);
  if (context.leadership && context.leadership.positions.length > 0) {
    lines.push(copy.leading.replace("{songs}", positionsText(context.leadership.positions)));
  }
  if (context.page) lines.push(context.page.path);
  return lines;
}
