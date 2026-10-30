import { siteConfig } from "@/config/site";
import { isInsert } from "@/lib/service-planner/model";
import { songIdentity, type IdentityEntry, type SongReference } from "@/lib/song-identity";

/**
 * AI's rule against repeating a song too soon. Pure - unit tested.
 *
 * A song used within the gap (siteConfig.servicePlanner.aiRepeatGapDays, or
 * the Christmas season's shorter one) either side of the service being
 * planned is BLOCKED: it is not offered to the model, and an answer that uses
 * it anyway is refused (validate.ts). "Used" is sung, or in another service's
 * plan - published or still a draft - so planning weeks ahead sees what the
 * weeks between already hold.
 *
 * Three songs are never blocked:
 *
 *   - one already in an open place of this service (the Director put it
 *     there; keeping it is theirs to decide);
 *   - an insert, which is sung in every service of its week by design;
 *   - one the Director's direction names, by its title or its hymn number.
 */

const DAY_MS = 86_400_000;

/** Another service near this one, as AI is told of it. */
export interface NearbyService {
  date: string;
  startsAt: string;
  /** "Sunday morning", or a special service's name with it. */
  service: string;
  /** sung: it has happened. planned: published. draft: still being planned. */
  status: "sung" | "planned" | "draft";
  songs: Array<SongReference & { insert?: true }>;
}

/** One use of a song near the service being planned. */
export interface NearbyUse {
  date: string;
  service: string;
  status: NearbyService["status"];
  /** Whole days from the service being planned: negative before it, positive after. */
  days: number;
}

/** How far either side a song may not be repeated by AI, for a service in or out of the Christmas season. */
export function repeatGapDays(christmasSeason: boolean): number {
  const { aiRepeatGapDays, aiChristmasRepeatGapDays } = siteConfig.servicePlanner;
  return christmasSeason ? aiChristmasRepeatGapDays : aiRepeatGapDays;
}

/** Every use of each song in the nearby services, by candidate id, nearest first. */
export function nearbyUses(
  nearby: readonly NearbyService[],
  startsAt: string,
  identities: readonly IdentityEntry[],
  hymnal: string,
): Map<string, NearbyUse[]> {
  const start = Date.parse(startsAt);
  const uses = new Map<string, NearbyUse[]>();
  for (const service of nearby) {
    const days = Math.round((Date.parse(service.startsAt) - start) / DAY_MS);
    for (const song of service.songs) {
      const id = songIdentity(song, identities, hymnal);
      const list = uses.get(id) ?? [];
      if (!list.some((use) => use.date === service.date && use.service === service.service)) {
        list.push({ date: service.date, service: service.service, status: service.status, days });
      }
      uses.set(id, list);
    }
  }
  for (const list of uses.values()) list.sort((a, b) => Math.abs(a.days) - Math.abs(b.days) || a.days - b.days);
  return uses;
}

const normalize = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim()} `;

/** Shorter titles ("Jesus") would be found in too many directions by accident. */
const MIN_TITLE_CHARS = 6;

/**
 * Whether the Director's direction names this song: its whole title, or its
 * hymn number written as one ("#120", "hymn 120", "number 120").
 */
export function namedIn(instruction: string, song: { title: string; number: string | null }): boolean {
  if (instruction.trim() === "") return false;
  const words = normalize(instruction);
  const title = normalize(song.title).trim();
  if (title.length >= MIN_TITLE_CHARS && words.includes(` ${title} `)) return true;
  if (!song.number) return false;
  const number = song.number.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (number === "") return false;
  return new RegExp(`(?:#\\s*|\\bhymn\\s+|\\bnumber\\s+|\\bno\\s+)${number}\\b`).test(words);
}

/**
 * The songs AI may not put in: used within `gap` days either side, and none
 * of the exceptions above. By candidate id, with the use that blocks it.
 */
export function blockedSongs(input: {
  candidates: ReadonlyArray<{ id: string; title: string; number: string | null }>;
  uses: ReadonlyMap<string, readonly NearbyUse[]>;
  gap: number;
  /** Songs in open places that may stay. */
  keepable: ReadonlySet<string>;
  instruction: string;
}): Map<string, NearbyUse> {
  const blocked = new Map<string, NearbyUse>();
  for (const song of input.candidates) {
    const near = input.uses.get(song.id)?.find((use) => Math.abs(use.days) <= input.gap);
    if (!near) continue;
    if (input.keepable.has(song.id) || isInsert(song) || namedIn(input.instruction, song)) continue;
    blocked.set(song.id, near);
  }
  return blocked;
}

/** A use in words, for a correction the model can act on. */
export function describeUse(use: NearbyUse): string {
  const when = use.days === 0 ? "the same day" : `${Math.abs(use.days)} day${Math.abs(use.days) === 1 ? "" : "s"} ${use.days < 0 ? "before" : "after"} this service`;
  const what = use.status === "sung" ? "sung" : use.status === "planned" ? "planned (published)" : "in a draft plan";
  return `${what} ${use.date} (${use.service}), ${when}`;
}
