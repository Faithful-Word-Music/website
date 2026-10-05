/**
 * Whether a song needs capo sheet music - the one rule every check asks.
 *
 * A guitarist plays easily in keys with few sharps and reaches the others with
 * a capo, reading sheet music written out for it (the capo type; by default
 * "Capo (Chords)"). So a song needs capo sheet music when its key has enough
 * flats or sharps:
 *
 *   - the site's policy (Admin -> Configuration) sets how many: by default any
 *     flat at all, or three sharps or more. Either rule can be switched off;
 *   - one song can be set to always or never need it, on its page, and that
 *     wins over the policy.
 *
 * The key judged is the song's own (canonicalKey in src/lib/song-key.ts),
 * never the key of one service.
 *
 * Pure - no server-only import - so it can be unit tested. The settings are
 * read in src/lib/auth/store.ts and handed in.
 */

import { keySignature } from "@/lib/key-signature";
import type { IndexSong } from "@/lib/sheet-music";
import { fileOfType } from "@/lib/sheet-music-type";
import { songKey } from "@/lib/song-list";

/** The most flats or sharps a key signature holds. */
export const MAX_ACCIDENTALS = 7;

export interface CapoPolicy {
  /** Capo sheet music is needed from this many flats; null switches the rule off. */
  minFlats: number | null;
  /** ...and from this many sharps; null switches the rule off. */
  minSharps: number | null;
  /** The sheet music type that is the capo sheet music; null when there is none to ask for. */
  typeId: number | null;
}

export const DEFAULT_CAPO_POLICY: CapoPolicy = { minFlats: 1, minSharps: 3, typeId: null };

/** One song's own setting: follow the policy, or always/never need capo sheet music. */
export const SONG_CAPO_RULES = ["global", "always", "never"] as const;
export type SongCapoRule = (typeof SONG_CAPO_RULES)[number];

export function isSongCapoRule(value: unknown): value is SongCapoRule {
  return SONG_CAPO_RULES.includes(value as SongCapoRule);
}

/** The policy and every song's own setting, as the checks take them. */
export interface CapoRules {
  policy: CapoPolicy;
  /** By songKey(); a song not here follows the policy. */
  overrides: Readonly<Record<string, Exclude<SongCapoRule, "global">>>;
}

/** No capo type, so nothing is ever asked for: for when the settings cannot be read. */
export const NO_CAPO_RULES: CapoRules = { policy: { ...DEFAULT_CAPO_POLICY, typeId: null }, overrides: {} };

function threshold(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= MAX_ACCIDENTALS ? count : fallback;
}

/** A stored policy made safe: anything missing or out of range falls back to the default. */
export function parseCapoPolicy(value: unknown): CapoPolicy {
  const stored = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const typeId = Number(stored.typeId);
  return {
    minFlats: "minFlats" in stored ? threshold(stored.minFlats, DEFAULT_CAPO_POLICY.minFlats) : DEFAULT_CAPO_POLICY.minFlats,
    minSharps: "minSharps" in stored ? threshold(stored.minSharps, DEFAULT_CAPO_POLICY.minSharps) : DEFAULT_CAPO_POLICY.minSharps,
    typeId: Number.isInteger(typeId) && typeId > 0 ? typeId : null,
  };
}

/** Whether the policy alone asks for capo sheet music in this key. A key it cannot read asks for none. */
export function capoRequiredByKey(key: string | null | undefined, policy: Pick<CapoPolicy, "minFlats" | "minSharps">): boolean {
  const signature = key ? keySignature(key) : null;
  if (!signature) return false;
  if (signature.count < 0) return policy.minFlats !== null && -signature.count >= policy.minFlats;
  return policy.minSharps !== null && signature.count >= policy.minSharps;
}

/** Whether a song in this key needs capo sheet music: its own setting first, then the policy. */
export function capoRequired(
  key: string | null | undefined,
  policy: Pick<CapoPolicy, "minFlats" | "minSharps">,
  rule: SongCapoRule = "global",
): boolean {
  if (rule === "always") return true;
  if (rule === "never") return false;
  return capoRequiredByKey(key, policy);
}

/** A song's own setting, by its title. */
export function songCapoRule(title: string, rules: CapoRules): SongCapoRule {
  return rules.overrides[songKey(title)] ?? "global";
}

/** Whether this song (in its own key) needs capo sheet music. */
export function songNeedsCapo(song: { title: string; key: string | null }, rules: CapoRules): boolean {
  return capoRequired(song.key, rules.policy, songCapoRule(song.title, rules));
}

/**
 * Whether a song needs capo sheet music and has none: no PDF of the capo
 * type. `song` is the song as the site names it (its own setting is kept
 * under that title) with its own key; `indexSong` its Index entry. False when
 * there is no capo type to ask for.
 */
export function capoMissing(indexSong: IndexSong, song: { title: string; key: string | null }, rules: CapoRules): boolean {
  const { typeId } = rules.policy;
  if (typeId === null || !songNeedsCapo(song, rules)) return false;
  return fileOfType(indexSong, typeId, () => true) === null;
}
