import { isInsert, type PlanSlots, type PlanSong } from "@/lib/service-planner/model";
import { songKey } from "@/lib/song-list";

/**
 * AI locks: which songs of the service being planned Generate with AI must
 * leave exactly as they are. Pure - unit tested.
 *
 * A lock belongs to the editor, not to the plan: it is never saved, and a
 * fresh copy of the workspace starts again from the defaults.
 *
 *   - An insert starts LOCKED - each one, in a week that has two. It was
 *     chosen before the service was planned, and is the same song in all
 *     three of the week's services. What makes a song an insert is the song:
 *     it has no hymnal number (isInsert in the planner's model).
 *   - Every other song starts UNLOCKED: AI may change it, and need not.
 *   - An empty place has nothing to lock.
 *
 * Each insert is unlocked by itself. Unlocking one does not ask for it to be
 * changed: with no instruction it is still held where it is (openPlaces).
 *
 * What the person chose is kept by song (songKey), so a lock follows its song
 * when the song is moved up or down.
 */

/** What the person has set, by song. A song not here has its default. */
export type LockChoices = Readonly<Record<string, boolean>>;

export function isAiLocked(song: PlanSong | null, choices: LockChoices): boolean {
  if (!song) return false;
  return choices[songKey(song.title)] ?? isInsert(song);
}

/** Each place of the service, locked or not - what a request to generate carries. */
export function lockedPlaces(slots: PlanSlots, choices: LockChoices): boolean[] {
  return slots.map((song) => isAiLocked(song, choices));
}

/** `choices` with one song's lock turned the other way. */
export function toggleAiLock(song: PlanSong, choices: LockChoices): LockChoices {
  return { ...choices, [songKey(song.title)]: !isAiLocked(song, choices) };
}

/**
 * The locks after AI changed the places in `changed`: what the person locked
 * stays locked (those songs did not move), and every ordinary song AI put in
 * is unlocked, so another generation may think again about it. An insert AI
 * put in - only ever in an insert's place, and only because the instruction
 * asked - takes an insert's default and is locked, like any other.
 */
export function locksAfterGeneration(choices: LockChoices, slots: PlanSlots, changed: readonly number[]): LockChoices {
  const next: Record<string, boolean> = { ...choices };
  for (const index of changed) {
    const song = slots[index];
    if (!song) continue;
    if (isInsert(song)) delete next[songKey(song.title)];
    else next[songKey(song.title)] = false;
  }
  return next;
}

/**
 * The places Generate with AI answers for: every place that is not locked.
 * `holdInserts` also keeps every UNLOCKED insert where it is - the case with
 * no instruction, when nothing has asked for the service to go without one.
 */
export function openPlaces(slots: PlanSlots, locked: readonly boolean[], holdInserts: boolean): number[] {
  return slots.flatMap((song, index) => {
    if (locked[index] && song) return [];
    if (holdInserts && song && isInsert(song)) return [];
    return [index];
  });
}
