/**
 * A song's key: the one it is sung in now, as opposed to the keys it has been
 * sung in.
 *
 * Two different things are both called "the key", and they must not be mixed:
 *   - A SERVICE's key for a song is what was (or will be) played that day. It
 *     is stored with the service and never rewritten - history stays history.
 *   - A SONG's key is the accepted one today: the first key on its row of the
 *     Sheet Music Index (what its page shows), or - for a song the Index does
 *     not hold - the "usual key" it was given in the planner's catalog.
 * Anything that offers or judges a key for a song (the key the planner fills
 * in, whether capo sheet music is needed) asks canonicalKey(); anything that
 * shows what a service played reads the service.
 *
 * Pure - no server-only import - so it can be unit tested.
 */

/** "G, Ab" (the Index's Key(s) column) -> "G". */
export function firstKey(keys: string | null | undefined): string | null {
  const first = keys?.split(/[,/;]/)[0]?.trim();
  return first ? first : null;
}

/** The key a song is sung in now: the Index's first key, else the catalog's usual key. */
export function canonicalKey(song: { indexKeys?: string | null; catalogKey?: string | null }): string | null {
  return firstKey(song.indexKeys) ?? (song.catalogKey?.trim() || null);
}
