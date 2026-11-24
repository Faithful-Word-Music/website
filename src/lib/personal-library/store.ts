import type { ClerkEnv } from "@/lib/auth/clerk-env";
import type { MembershipSql } from "@/lib/auth/membership-store";

import { foldSongId } from "./identity";

/**
 * Reading and writing one person's Personal Library (schema.mjs).
 *
 * Every function takes the owner, and every query filters on it. The owner
 * always comes from the verified session (authorize.ts), never from a request.
 * There is no way here to read another person's records, for anyone.
 *
 * Each write is one transaction: it takes a per-account lock, then runs one
 * conditional statement that refuses to write once the account has an erasure
 * marker. The lock is what makes a write and an erasure strictly one before
 * the other, so a write can never land after the purge.
 */

export type PersonalLibrarySql = MembershipSql;
export interface LibraryOwner {
  env: ClerkEnv;
  userId: string;
}

type Row = Record<string, unknown>;

export const MAX_NOTE_LENGTH = 20_000;
export const RECENT_LIMIT = 100;
export const RECENT_RETENTION_DAYS = 90;
export const RECENT_DEDUPE_MINUTES = 5;
export const RECENT_KINDS = ["song", "sheet_file"] as const;
export type RecentKind = (typeof RECENT_KINDS)[number];

const DEFAULT_PAGE = 50;
const MAX_PAGE = 200;
/** The most rows one write will prune, so a single request stays small. */
const PRUNE_BATCH = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHEET_FILE_KEY = /^sf1_[0-9a-f]{64}$/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
/** Full microsecond precision: a JavaScript Date would lose it and break paging. */
const PRECISE = (column: string) => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const lockKey = ({ env, userId }: LibraryOwner) => `personal-library:${env}:${userId}`;
const lockStatement = (owner: LibraryOwner) => ({
  text: `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))::text`,
  params: [lockKey(owner)],
});
const ERASING = `EXISTS (SELECT 1 FROM personal_library_erasures e WHERE e.clerk_env = $1 AND e.clerk_user_id = $2)`;

async function locked(sql: PersonalLibrarySql, owner: LibraryOwner, text: string, params: unknown[]): Promise<Row[]> {
  const results = await sql.transaction([lockStatement(owner), { text, params }]);
  return results[1];
}

function storedIdList(storedIds: readonly string[]): string[] {
  if (storedIds.length === 0) throw new Error("A song must have at least one identity.");
  return [...storedIds];
}

/** SQL's side of foldSongId (identity.ts): the same ASCII-only fold, whatever the database locale. */
const FOLDED_SONG_ID = `translate(song_id, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')`;

const foldedIdList = (storedIds: readonly string[]) => [...new Set(storedIdList(storedIds).map(foldSongId))];

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

export interface FavoriteRow {
  songId: string;
  createdAt: string;
}

export interface FavoritePage {
  items: FavoriteRow[];
  nextCursor: string | null;
}

export type AddFavoriteResult = "added" | "already" | "account-erasing";

/** Adds once. A favorite stored under any spelling of this song, in any case, counts as already there. */
export async function addFavorite(
  sql: PersonalLibrarySql,
  owner: LibraryOwner,
  song: { songId: string; storedIds: readonly string[] },
): Promise<AddFavoriteResult> {
  const [row] = await locked(
    sql,
    owner,
    `WITH blocked AS (SELECT ${ERASING} AS value),
          present AS (SELECT 1 FROM user_song_favorites
                       WHERE clerk_env = $1 AND clerk_user_id = $2 AND ${FOLDED_SONG_ID} = ANY($4::text[])),
          inserted AS (
            INSERT INTO user_song_favorites (clerk_env, clerk_user_id, song_id, created_at)
            SELECT $1::text, $2::text, $3::text, clock_timestamp()
             WHERE NOT (SELECT value FROM blocked) AND NOT EXISTS (SELECT 1 FROM present)
            ON CONFLICT DO NOTHING
            RETURNING 1)
     SELECT (SELECT value FROM blocked) AS blocked, EXISTS (SELECT 1 FROM inserted) AS added`,
    [owner.env, owner.userId, song.songId, foldedIdList(song.storedIds)],
  );
  if (row.blocked) return "account-erasing";
  return row.added ? "added" : "already";
}

export type RemoveFavoriteResult = "removed" | "absent" | "account-erasing";

async function removeWhere(
  sql: PersonalLibrarySql,
  owner: LibraryOwner,
  condition: string,
  value: string | string[],
): Promise<RemoveFavoriteResult> {
  const [row] = await locked(
    sql,
    owner,
    `WITH blocked AS (SELECT ${ERASING} AS value),
          removed AS (
            DELETE FROM user_song_favorites
             WHERE clerk_env = $1 AND clerk_user_id = $2 AND ${condition}
               AND NOT (SELECT value FROM blocked)
            RETURNING 1)
     SELECT (SELECT value FROM blocked) AS blocked, EXISTS (SELECT 1 FROM removed) AS removed`,
    [owner.env, owner.userId, value],
  );
  if (row.blocked) return "account-erasing";
  return row.removed ? "removed" : "absent";
}

/** Removes this song under every spelling, in any case. Removing nothing is not an error. */
export function removeFavorite(
  sql: PersonalLibrarySql,
  owner: LibraryOwner,
  storedIds: readonly string[],
): Promise<RemoveFavoriteResult> {
  return removeWhere(sql, owner, `${FOLDED_SONG_ID} = ANY($3::text[])`, foldedIdList(storedIds));
}

/**
 * Removes the one row stored under exactly this key, for an entry the
 * directory cannot resolve. Case-sensitive with no alias expansion: without a
 * resolved song, a wider match could reach a different song's record.
 */
export function removeExactFavorite(
  sql: PersonalLibrarySql,
  owner: LibraryOwner,
  storedKey: string,
): Promise<RemoveFavoriteResult> {
  return removeWhere(sql, owner, `song_id = $3::text`, storedKey);
}

export async function isFavorite(
  sql: PersonalLibrarySql,
  owner: LibraryOwner,
  storedIds: readonly string[],
): Promise<boolean> {
  const [row] = await sql.query(
    `SELECT NOT ${ERASING} AND EXISTS (SELECT 1 FROM user_song_favorites
                     WHERE clerk_env = $1 AND clerk_user_id = $2 AND ${FOLDED_SONG_ID} = ANY($3::text[])) AS present`,
    [owner.env, owner.userId, foldedIdList(storedIds)],
  );
  return row.present === true;
}

export type FavoriteMembership = { blocked: true } | { blocked: false; present: Set<string> };

/**
 * Which of these folded spellings (foldSongId) the owner has stored, in one
 * query. The database filters, so a small lookup never loads the collection.
 */
export async function favoriteMembership(
  sql: PersonalLibrarySql,
  owner: LibraryOwner,
  foldedIds: readonly string[],
): Promise<FavoriteMembership> {
  const [row] = await sql.query(
    `WITH blocked AS (SELECT ${ERASING} AS value)
     SELECT (SELECT value FROM blocked) AS blocked,
            COALESCE((SELECT json_agg(DISTINCT ${FOLDED_SONG_ID}) FROM user_song_favorites
                       WHERE clerk_env = $1 AND clerk_user_id = $2 AND ${FOLDED_SONG_ID} = ANY($3::text[])
                         AND NOT (SELECT value FROM blocked)), '[]'::json) AS present`,
    [owner.env, owner.userId, [...foldedIds]],
  );
  if (row.blocked) return { blocked: true };
  return { blocked: false, present: new Set(parseJson<string[]>(row.present)) };
}

/**
 * Every stored favorite with its exact timestamp, for search and sorting across
 * the whole collection. The marker is read in the same statement, so an
 * erasing account gets nothing.
 */
export async function listFavoriteRows(
  sql: PersonalLibrarySql,
  owner: LibraryOwner,
): Promise<{ blocked: true } | { blocked: false; rows: FavoriteRow[] }> {
  const [row] = await sql.query(
    `WITH blocked AS (SELECT ${ERASING} AS value)
     SELECT (SELECT value FROM blocked) AS blocked,
            COALESCE((SELECT json_agg(json_build_object('songId', f.song_id, 'createdAt', ${PRECISE("f.created_at")}))
                        FROM user_song_favorites f
                       WHERE f.clerk_env = $1 AND f.clerk_user_id = $2
                         AND NOT (SELECT value FROM blocked)), '[]'::json) AS rows`,
    [owner.env, owner.userId],
  );
  if (row.blocked) return { blocked: true };
  return { blocked: false, rows: parseJson<FavoriteRow[]>(row.rows) };
}

function parseCursor(cursor: string): { at: string; songId: string } | null {
  const split = cursor.indexOf("|");
  if (split <= 0 || split === cursor.length - 1) return null;
  const at = cursor.slice(0, split);
  return Number.isNaN(Date.parse(at)) ? null : { at, songId: cursor.slice(split + 1) };
}

/** Newest first, with a stable order when timestamps match. */
export async function listFavorites(
  sql: PersonalLibrarySql,
  owner: LibraryOwner,
  options: { limit?: number; cursor?: string | null } = {},
): Promise<FavoritePage> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_PAGE), 1), MAX_PAGE);
  const cursor = options.cursor ? parseCursor(options.cursor) : null;
  if (options.cursor && !cursor) throw new Error("Invalid favorites cursor.");
  const rows = await sql.query(
    `SELECT song_id, ${PRECISE("created_at")} AS created_at FROM user_song_favorites
      WHERE clerk_env = $1 AND clerk_user_id = $2 AND NOT ${ERASING}
        AND ($3::timestamptz IS NULL OR created_at < $3::timestamptz
             OR (created_at = $3::timestamptz AND song_id > $4::text))
      ORDER BY user_song_favorites.created_at DESC, song_id ASC
      LIMIT $5`,
    [owner.env, owner.userId, cursor?.at ?? null, cursor?.songId ?? null, limit + 1],
  );
  const items = rows.slice(0, limit).map((row) => ({ songId: row.song_id as string, createdAt: row.created_at as string }));
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? `${last.createdAt}|${last.songId}` : null };
}

// ---------------------------------------------------------------------------
// Recently viewed
// ---------------------------------------------------------------------------

export interface RecentRow {
  kind: RecentKind;
  key: string;
  firstViewedAt: string;
  lastViewedAt: string;
}

export type RecordRecentResult = "recorded" | "deduplicated" | "account-erasing";

/** The stored key's shape. Says nothing about whether the person may open it. */
export function isValidRecentResource(kind: unknown, key: unknown): kind is RecentKind {
  if (typeof key !== "string") return false;
  if (kind === "song") return key.length >= 1 && key.length <= 200 && key.trim() === key;
  return kind === "sheet_file" && SHEET_FILE_KEY.test(key);
}

/**
 * Records one view of a resource the caller has ALREADY validated and
 * authorized. A repeat under five minutes changes nothing; exactly five
 * minutes counts as a new view. `at` is for tests; otherwise the database clock.
 */
export async function recordRecent(
  sql: PersonalLibrarySql,
  owner: LibraryOwner,
  resource: { kind: RecentKind; key: string; at?: Date },
): Promise<RecordRecentResult> {
  if (!isValidRecentResource(resource.kind, resource.key)) throw new Error("Invalid recent resource.");
  const at = resource.at?.toISOString() ?? null;
  const [, [row]] = await sql.transaction([
    lockStatement(owner),
    {
      text: `WITH clock AS (SELECT COALESCE($5::timestamptz, clock_timestamp()) AS at),
                  blocked AS (SELECT ${ERASING} AS value),
                  written AS (
                    INSERT INTO user_library_recent AS r
                      (clerk_env, clerk_user_id, resource_kind, resource_key, first_viewed_at, last_viewed_at)
                    SELECT $1::text, $2::text, $3::text, $4::text, clock.at, clock.at FROM clock
                     WHERE NOT (SELECT value FROM blocked)
                    ON CONFLICT (clerk_env, clerk_user_id, resource_kind, resource_key) DO UPDATE
                      SET first_viewed_at = CASE
                            WHEN r.last_viewed_at <= EXCLUDED.last_viewed_at - make_interval(days => ${RECENT_RETENTION_DAYS})
                            THEN EXCLUDED.first_viewed_at ELSE r.first_viewed_at END,
                          last_viewed_at = EXCLUDED.last_viewed_at
                      WHERE r.last_viewed_at <= EXCLUDED.last_viewed_at - make_interval(mins => ${RECENT_DEDUPE_MINUTES})
                    RETURNING 1)
             SELECT (SELECT value FROM blocked) AS blocked, EXISTS (SELECT 1 FROM written) AS recorded`,
      params: [owner.env, owner.userId, resource.kind, resource.key, at],
    },
    {
      text: `DELETE FROM user_library_recent r
              USING (
                SELECT resource_kind, resource_key FROM (
                  SELECT resource_kind, resource_key, last_viewed_at,
                         row_number() OVER (ORDER BY last_viewed_at DESC, resource_kind, resource_key) AS position
                    FROM user_library_recent WHERE clerk_env = $1 AND clerk_user_id = $2
                ) ranked
                WHERE position > ${RECENT_LIMIT}
                   OR last_viewed_at <= COALESCE($3::timestamptz, clock_timestamp()) - make_interval(days => ${RECENT_RETENTION_DAYS})
                LIMIT ${PRUNE_BATCH}
              ) doomed
              WHERE r.clerk_env = $1 AND r.clerk_user_id = $2 AND NOT ${ERASING}
                AND r.resource_kind = doomed.resource_kind AND r.resource_key = doomed.resource_key`,
      params: [owner.env, owner.userId, at],
    },
  ]);
  if (row.blocked) return "account-erasing";
  return row.recorded ? "recorded" : "deduplicated";
}

/** Most recent first, at most 100, nothing older than 90 days. */
export async function listRecent(
  sql: PersonalLibrarySql,
  owner: LibraryOwner,
  options: { limit?: number; at?: Date } = {},
): Promise<RecentRow[]> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? RECENT_LIMIT), 1), RECENT_LIMIT);
  const rows = await sql.query(
    `SELECT resource_kind, resource_key, ${PRECISE("first_viewed_at")} AS first_at, ${PRECISE("last_viewed_at")} AS last_at
       FROM user_library_recent
      WHERE clerk_env = $1 AND clerk_user_id = $2
        AND last_viewed_at > COALESCE($3::timestamptz, clock_timestamp()) - make_interval(days => ${RECENT_RETENTION_DAYS})
      ORDER BY last_viewed_at DESC, resource_kind, resource_key
      LIMIT $4`,
    [owner.env, owner.userId, options.at?.toISOString() ?? null, limit],
  );
  return rows.map((row) => ({
    kind: row.resource_kind as RecentKind,
    key: row.resource_key as string,
    firstViewedAt: row.first_at as string,
    lastViewedAt: row.last_at as string,
  }));
}

/** How many were cleared. Refused once the account has an erasure marker. */
export async function clearRecent(sql: PersonalLibrarySql, owner: LibraryOwner): Promise<number | "account-erasing"> {
  const [row] = await locked(
    sql,
    owner,
    `WITH blocked AS (SELECT ${ERASING} AS value),
          cleared AS (
            DELETE FROM user_library_recent
             WHERE clerk_env = $1 AND clerk_user_id = $2 AND NOT (SELECT value FROM blocked)
            RETURNING 1)
     SELECT (SELECT value FROM blocked) AS blocked, (SELECT count(*)::int FROM cleared) AS cleared`,
    [owner.env, owner.userId],
  );
  return row.blocked ? "account-erasing" : (row.cleared as number);
}

// ---------------------------------------------------------------------------
// Song notes
// ---------------------------------------------------------------------------

export interface SongNote {
  songId: string;
  noteId: string;
  content: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * `conflict` on a read means two notes now belong to one song, because its
 * identities were linked after both were written. Both texts are kept until
 * the owner decides. Nothing here merges or overwrites them.
 */
export type LoadNoteResult =
  /** `deletedNoteId` is the latest deleted note, which a new create must name. */
  | { status: "none"; deletedNoteId?: string }
  | { status: "ok"; note: SongNote }
  | { status: "conflict"; notes: SongNote[] };

export type CreateNoteResult =
  | { status: "created" | "replayed"; note: SongNote }
  | { status: "conflict"; notes: SongNote[] }
  /** The song's note was deleted after this request was made. Nothing was written. */
  | { status: "deleted-since"; deletedNoteId: string | null }
  | { status: "account-erasing" };

export type UpdateNoteResult =
  | { status: "updated" | "replayed"; note: SongNote }
  | { status: "conflict"; notes: SongNote[] }
  | { status: "not-found" | "account-erasing" };

export type DeleteNoteResult =
  | { status: "deleted" | "already-absent" | "account-erasing" }
  | { status: "conflict"; notes: SongNote[] };

/** Plain text up to 20,000 characters, counted as PostgreSQL counts them. Blank is valid. */
export function isValidNoteContent(content: unknown): content is string {
  if (typeof content !== "string" || content.includes("\u0000") || LONE_SURROGATE.test(content)) return false;
  if (content.length <= MAX_NOTE_LENGTH) return true;
  return content.length <= MAX_NOTE_LENGTH * 2 && [...content].length <= MAX_NOTE_LENGTH;
}

function assertWrite(content: string, mutationId: string): void {
  if (!isValidNoteContent(content)) throw new Error("Invalid note content.");
  if (!UUID.test(mutationId)) throw new Error("Invalid mutation ID.");
}

const NOTE_JSON = `json_build_object(
  'song_id', n.song_id, 'note_id', n.note_id, 'content', n.content, 'revision', n.revision,
  'last_mutation_id', n.last_mutation_id, 'deleted', n.deleted_at IS NOT NULL,
  'created_at', ${PRECISE("n.created_at")}, 'updated_at', ${PRECISE("n.updated_at")})`;

/** Live notes first, oldest first; then tombstones, newest first. */
const NOTE_ORDER = `n.deleted_at IS NOT NULL, n.deleted_at DESC, n.created_at, n.song_id`;
const LIVE_NOTES = `(SELECT json_agg(${NOTE_JSON} ORDER BY ${NOTE_ORDER}) FROM existing n WHERE n.deleted_at IS NULL)`;

interface NoteJson {
  song_id: string;
  note_id: string;
  content: string;
  revision: number;
  last_mutation_id: string;
  deleted: boolean;
  created_at: string;
  updated_at: string;
}

const parseJson = <T,>(value: unknown): T => (typeof value === "string" ? (JSON.parse(value) as T) : (value as T));

function toNote(row: NoteJson): SongNote {
  return {
    songId: row.song_id,
    noteId: row.note_id,
    content: row.content,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const noteList = (value: unknown): NoteJson[] => parseJson<NoteJson[] | null>(value) ?? [];
const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function loadNote(
  sql: PersonalLibrarySql,
  owner: LibraryOwner,
  storedIds: readonly string[],
): Promise<LoadNoteResult> {
  const rows = await sql.query(
    `SELECT ${NOTE_JSON} AS note FROM user_song_notes n
      WHERE n.clerk_env = $1 AND n.clerk_user_id = $2 AND n.song_id = ANY($3::text[])
      ORDER BY ${NOTE_ORDER}`,
    [owner.env, owner.userId, storedIdList(storedIds)],
  );
  const all = rows.map((row) => parseJson<NoteJson>(row.note));
  const notes = all.filter((note) => !note.deleted).map(toNote);
  if (notes.length === 0) {
    const tombstone = all[0];
    return tombstone ? { status: "none", deletedNoteId: tombstone.note_id } : { status: "none" };
  }
  return notes.length === 1 ? { status: "ok", note: notes[0] } : { status: "conflict", notes };
}

/**
 * Creates the song's note, unless one exists under any of its identities.
 *
 * A create must state what it believes came before: nothing, or the exact
 * deleted note `loadNote` reported (`afterDeletedNoteId`). That is what tells a
 * genuinely new note from a stale retry, for as long as the tombstone exists.
 *
 * Retry after an uncertain save: send the same request. If that create is
 * still the note's latest write, the answer is `replayed`. If the note changed,
 * `conflict`. If it was deleted, `deleted-since`. None of these writes
 * anything, so a retry can never bring a deleted note back.
 */
export async function createNote(
  sql: PersonalLibrarySql,
  owner: LibraryOwner,
  input: {
    songId: string;
    storedIds: readonly string[];
    content: string;
    mutationId: string;
    noteId: string;
    afterDeletedNoteId?: string | null;
  },
): Promise<CreateNoteResult> {
  assertWrite(input.content, input.mutationId);
  if (!UUID.test(input.noteId)) throw new Error("Invalid note ID.");
  const after = input.afterDeletedNoteId ?? null;
  if (after !== null && !UUID.test(after)) throw new Error("Invalid deleted note ID.");
  const [row] = await locked(
    sql,
    owner,
    `WITH blocked AS (SELECT ${ERASING} AS value),
          existing AS (SELECT * FROM user_song_notes
                        WHERE clerk_env = $1 AND clerk_user_id = $2 AND song_id = ANY($4::text[])),
          tombstone AS (SELECT n.song_id, n.note_id FROM existing n WHERE n.deleted_at IS NOT NULL
                         ORDER BY ${NOTE_ORDER} LIMIT 1),
          allowed AS (
            SELECT NOT (SELECT value FROM blocked)
               AND NOT EXISTS (SELECT 1 FROM existing WHERE deleted_at IS NULL)
               AND CASE WHEN EXISTS (SELECT 1 FROM tombstone)
                        THEN COALESCE((SELECT note_id FROM tombstone) = $8::uuid, false)
                        ELSE $8::uuid IS NULL END AS value),
          inserted AS (
            INSERT INTO user_song_notes AS n
              (clerk_env, clerk_user_id, song_id, content, revision, note_id, last_mutation_id, created_at, updated_at)
            SELECT $1::text, $2::text, $3::text, $5::text, 1, $6::uuid, $7::uuid, clock_timestamp(), clock_timestamp()
             WHERE (SELECT value FROM allowed) AND NOT EXISTS (SELECT 1 FROM tombstone)
            ON CONFLICT DO NOTHING
            RETURNING ${NOTE_JSON} AS note),
          revived AS (
            UPDATE user_song_notes AS n
               SET content = $5::text, revision = 1, note_id = $6::uuid, last_mutation_id = $7::uuid,
                   deleted_at = NULL, created_at = clock_timestamp(), updated_at = clock_timestamp()
              FROM tombstone t
             WHERE n.clerk_env = $1 AND n.clerk_user_id = $2 AND n.song_id = t.song_id
               AND (SELECT value FROM allowed)
            RETURNING ${NOTE_JSON} AS note)
     SELECT (SELECT value FROM blocked) AS blocked,
            COALESCE((SELECT note FROM inserted), (SELECT note FROM revived)) AS inserted,
            (SELECT note_id FROM tombstone) AS tombstone,
            ${LIVE_NOTES} AS existing`,
    [owner.env, owner.userId, input.songId, storedIdList(input.storedIds), input.content, input.noteId, input.mutationId, after],
  );
  if (row.inserted) return { status: "created", note: toNote(parseJson<NoteJson>(row.inserted)) };
  const existing = noteList(row.existing);
  if (row.blocked) return { status: "account-erasing" };
  if (existing.length === 0) return { status: "deleted-since", deletedNoteId: (row.tombstone as string | null) ?? null };
  if (
    existing.length === 1 &&
    existing[0].revision === 1 &&
    sameId(existing[0].last_mutation_id, input.mutationId) &&
    existing[0].content === input.content
  ) {
    return { status: "replayed", note: toNote(existing[0]) };
  }
  return { status: "conflict", notes: existing.map(toNote) };
}

/**
 * Applies only to this exact note at this exact revision.
 *
 * `last_mutation_id` holds the LATEST successful write and nothing older. A
 * retry succeeds as `replayed` only while its mutation is still that latest
 * write, with the same content, one revision past the one it expected. After
 * any newer write it is `conflict` with the current text, and writes nothing.
 * A mutation ID is never applied twice.
 */
export async function updateNote(
  sql: PersonalLibrarySql,
  owner: LibraryOwner,
  input: { storedIds: readonly string[]; noteId: string; expectedRevision: number; content: string; mutationId: string },
): Promise<UpdateNoteResult> {
  assertWrite(input.content, input.mutationId);
  if (!UUID.test(input.noteId)) throw new Error("Invalid note ID.");
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) throw new Error("Invalid revision.");
  const [row] = await locked(
    sql,
    owner,
    `WITH blocked AS (SELECT ${ERASING} AS value),
          existing AS (SELECT * FROM user_song_notes
                        WHERE clerk_env = $1 AND clerk_user_id = $2 AND song_id = ANY($3::text[])),
          updated AS (
            UPDATE user_song_notes AS n
               SET content = $6::text, revision = n.revision + 1, last_mutation_id = $7::uuid, updated_at = clock_timestamp()
             WHERE n.clerk_env = $1 AND n.clerk_user_id = $2 AND n.song_id = ANY($3::text[])
               AND n.note_id = $4::uuid AND n.revision = $5::integer AND n.last_mutation_id <> $7::uuid
               AND n.deleted_at IS NULL AND NOT (SELECT value FROM blocked)
            RETURNING ${NOTE_JSON} AS note)
     SELECT (SELECT value FROM blocked) AS blocked,
            (SELECT note FROM updated) AS updated,
            ${LIVE_NOTES} AS existing`,
    [owner.env, owner.userId, storedIdList(input.storedIds), input.noteId, input.expectedRevision, input.content, input.mutationId],
  );
  if (row.updated) return { status: "updated", note: toNote(parseJson<NoteJson>(row.updated)) };
  if (row.blocked) return { status: "account-erasing" };
  const existing = noteList(row.existing);
  const target = existing.find((note) => sameId(note.note_id, input.noteId));
  if (
    target &&
    sameId(target.last_mutation_id, input.mutationId) &&
    target.revision === input.expectedRevision + 1 &&
    target.content === input.content
  ) {
    return { status: "replayed", note: toNote(target) };
  }
  return existing.length > 0 ? { status: "conflict", notes: existing.map(toNote) } : { status: "not-found" };
}

/**
 * Deletes only this exact note at this exact revision: its text is erased and
 * a tombstone stays. A retry after an uncertain delete gets `already-absent`.
 * If the song has a newer note, even one recreated at the same revision
 * number, the answer is `conflict` and it stays.
 */
export async function deleteNote(
  sql: PersonalLibrarySql,
  owner: LibraryOwner,
  input: { storedIds: readonly string[]; noteId: string; expectedRevision: number },
): Promise<DeleteNoteResult> {
  if (!UUID.test(input.noteId)) throw new Error("Invalid note ID.");
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) throw new Error("Invalid revision.");
  const [row] = await locked(
    sql,
    owner,
    `WITH blocked AS (SELECT ${ERASING} AS value),
          existing AS (SELECT * FROM user_song_notes
                        WHERE clerk_env = $1 AND clerk_user_id = $2 AND song_id = ANY($3::text[])),
          removed AS (
            UPDATE user_song_notes AS n
               SET content = '', deleted_at = clock_timestamp(), updated_at = clock_timestamp()
             WHERE n.clerk_env = $1 AND n.clerk_user_id = $2 AND n.song_id = ANY($3::text[])
               AND n.note_id = $4::uuid AND n.revision = $5::integer AND n.deleted_at IS NULL
               AND NOT (SELECT value FROM blocked)
            RETURNING 1)
     SELECT (SELECT value FROM blocked) AS blocked,
            EXISTS (SELECT 1 FROM removed) AS deleted,
            ${LIVE_NOTES} AS existing`,
    [owner.env, owner.userId, storedIdList(input.storedIds), input.noteId, input.expectedRevision],
  );
  if (row.blocked) return { status: "account-erasing" };
  if (row.deleted) return { status: "deleted" };
  const existing = noteList(row.existing);
  return existing.length > 0 ? { status: "conflict", notes: existing.map(toNote) } : { status: "already-absent" };
}

// ---------------------------------------------------------------------------
// Account erasure (the order of these steps is in erasure.ts)
// ---------------------------------------------------------------------------

const PERSONAL_TABLES = ["user_song_favorites", "user_library_recent", "user_song_notes"] as const;

const purgeStatements = (owner: LibraryOwner) =>
  PERSONAL_TABLES.map((table) => ({
    text: `DELETE FROM ${table} WHERE clerk_env = $1 AND clerk_user_id = $2`,
    params: [owner.env, owner.userId],
  }));

/**
 * Closes the account to new writes and records one deletion attempt that might
 * take effect. A `complete` marker stays complete.
 */
export async function beginErasure(sql: PersonalLibrarySql, owner: LibraryOwner, attempt: string): Promise<void> {
  if (!UUID.test(attempt)) throw new Error("Invalid erasure attempt.");
  await locked(
    sql,
    owner,
    `INSERT INTO personal_library_erasures AS e (clerk_env, clerk_user_id, open_attempts)
     VALUES ($1, $2, ARRAY[$3::uuid])
     ON CONFLICT (clerk_env, clerk_user_id) DO UPDATE
       SET open_attempts = CASE WHEN e.state = 'pending' THEN array_append(e.open_attempts, $3::uuid) ELSE e.open_attempts END,
           updated_at = clock_timestamp()`,
    [owner.env, owner.userId, attempt],
  );
}

/**
 * For a deletion Clerk definitively refused: this attempt can no longer take
 * effect. The account reopens only when no other attempt might still succeed.
 * An uncertain attempt never calls this, so its token keeps the marker in place.
 */
export async function releaseErasureAttempt(sql: PersonalLibrarySql, owner: LibraryOwner, attempt: string): Promise<void> {
  if (!UUID.test(attempt)) throw new Error("Invalid erasure attempt.");
  await sql.transaction([
    lockStatement(owner),
    {
      text: `UPDATE personal_library_erasures
                SET open_attempts = array_remove(open_attempts, $3::uuid), updated_at = clock_timestamp()
              WHERE clerk_env = $1 AND clerk_user_id = $2 AND state = 'pending' AND $3::uuid = ANY(open_attempts)`,
      params: [owner.env, owner.userId, attempt],
    },
    {
      text: `DELETE FROM personal_library_erasures
              WHERE clerk_env = $1 AND clerk_user_id = $2 AND state = 'pending' AND cardinality(open_attempts) = 0`,
      params: [owner.env, owner.userId],
    },
  ]);
}

/** Every Personal Library record of this account. Safe to repeat. */
export async function deletePersonalLibraryData(sql: PersonalLibrarySql, owner: LibraryOwner): Promise<void> {
  await sql.transaction([lockStatement(owner), ...purgeStatements(owner)]);
}

/** The last step, only after every other cleanup succeeded. Safe to repeat. */
export async function completeErasure(sql: PersonalLibrarySql, owner: LibraryOwner): Promise<void> {
  await sql.transaction([
    lockStatement(owner),
    ...purgeStatements(owner),
    {
      text: `UPDATE personal_library_erasures
                SET state = 'complete', open_attempts = '{}', completed_at = clock_timestamp(), updated_at = clock_timestamp()
              WHERE clerk_env = $1 AND clerk_user_id = $2 AND state = 'pending'`,
      params: [owner.env, owner.userId],
    },
  ]);
}

/** Pending erasures, least recently tried first, so one stuck account cannot starve the rest. */
export async function listPendingErasures(sql: PersonalLibrarySql, env: ClerkEnv, limit: number): Promise<string[]> {
  const rows = await sql.query(
    `SELECT clerk_user_id FROM personal_library_erasures
      WHERE clerk_env = $1 AND state = 'pending'
      ORDER BY last_recovery_at NULLS FIRST, requested_at
      LIMIT $2`,
    [env, limit],
  );
  return rows.map((row) => row.clerk_user_id as string);
}

export async function noteErasureRecovery(sql: PersonalLibrarySql, owner: LibraryOwner): Promise<void> {
  await sql.query(
    `UPDATE personal_library_erasures SET last_recovery_at = clock_timestamp()
      WHERE clerk_env = $1 AND clerk_user_id = $2 AND state = 'pending'`,
    [owner.env, owner.userId],
  );
}
