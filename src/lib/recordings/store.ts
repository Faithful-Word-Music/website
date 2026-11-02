import "server-only";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { applySchema } from "@/lib/db";
import { isWriteConflict, plannerSql } from "@/lib/service-planner/store";
import type { ServiceSlot } from "@/types/song-list";

import type { MediaLink, MediaLinkSource, Recording, RecordingSelection, RecordingVisibility } from "./model";

/**
 * Song recordings in the database. Like every table here, each row carries its
 * Clerk environment: Local, Preview and Production share one database.
 *
 *   song_recordings                playable recordings, kept with their song for good;
 *                                  at most one is the song's primary (a unique index)
 *   song_media_links               other media for a song (Drive files, folders) -
 *                                  opened, never played, never in a playlist
 *   service_recording_selections   a recording chosen for one place of one service,
 *                                  instead of the song's primary. Keyed by the place's
 *                                  stable ID (src/lib/service-planner/places.ts), so it
 *                                  moves with its song; it records which song it was
 *                                  chosen for, so it never carries over to a replacement
 *
 * The planner's store goes first (plannerSql): it makes fwm_require(), which
 * guards the selections' writes against a service saved by someone else.
 *
 * No authorization happens here: the server actions
 * (src/app/recordings/actions.ts) check manage_songs or manage_service_plans first.
 */

const ENV = `clerk_env text NOT NULL CHECK (clerk_env IN ('development', 'production'))`;
const VISIBILITY = `visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'members'))`;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS song_recordings (
     id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
     ${ENV},
     song_id      text        NOT NULL,
     provider     text        NOT NULL CHECK (provider IN ('youtube')),
     media_id     text        NOT NULL,
     source_url   text        NOT NULL,
     title        text        NOT NULL,
     source_name  text,
     description  text,
     arrangement  text,
     music_key    text,
     ${VISIBILITY},
     is_primary   boolean     NOT NULL DEFAULT false,
     created_by   text,
     created_at   timestamptz NOT NULL DEFAULT now(),
     updated_by   text,
     updated_at   timestamptz NOT NULL DEFAULT now(),
     UNIQUE (clerk_env, song_id, provider, media_id)
   )`,
  // One primary per song, per environment - held by the database, not by care.
  `CREATE UNIQUE INDEX IF NOT EXISTS song_recordings_one_primary
     ON song_recordings (clerk_env, song_id) WHERE is_primary`,
  `CREATE TABLE IF NOT EXISTS song_media_links (
     id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
     ${ENV},
     song_id     text        NOT NULL,
     url         text        NOT NULL,
     source      text        NOT NULL DEFAULT 'other' CHECK (source IN ('google-drive', 'youtube', 'other')),
     title       text        NOT NULL,
     description text,
     ${VISIBILITY},
     created_by  text,
     created_at  timestamptz NOT NULL DEFAULT now(),
     updated_by  text,
     updated_at  timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS song_media_links_song ON song_media_links (clerk_env, song_id)`,
  // recording_id becomes NULL when its recording is deleted: the planner then shows that the
  // chosen recording is gone, instead of the service quietly falling back to the primary.
  `CREATE TABLE IF NOT EXISTS service_recording_selections (
     ${ENV},
     service_date date        NOT NULL,
     slot         text        NOT NULL CHECK (slot IN ('AM', 'PM')),
     place_id     text        NOT NULL,
     song_id      text        NOT NULL,
     recording_id uuid        REFERENCES song_recordings (id) ON DELETE SET NULL,
     selected_by  text,
     selected_at  timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, service_date, slot, place_id)
   )`,
  `CREATE INDEX IF NOT EXISTS service_recording_selections_recording
     ON service_recording_selections (recording_id) WHERE recording_id IS NOT NULL`,
];

/** Names the last thing SCHEMA makes (see applySchema in src/lib/db.ts). */
const SCHEMA_READY = `SELECT to_regclass('service_recording_selections_recording') IS NOT NULL AS ready`;

let schemaReady = false;

export async function recordingsSql() {
  const sql = await plannerSql();
  if (!schemaReady) {
    await applySchema(sql, SCHEMA, SCHEMA_READY);
    schemaReady = true;
  }
  return sql;
}

type Sql = Awaited<ReturnType<typeof recordingsSql>>;

// ---------------------------------------------------------------------------
// Recordings
// ---------------------------------------------------------------------------

interface RecordingRow {
  id: string;
  song_id: string;
  provider: "youtube";
  media_id: string;
  source_url: string;
  title: string;
  source_name: string | null;
  description: string | null;
  arrangement: string | null;
  music_key: string | null;
  visibility: RecordingVisibility;
  is_primary: boolean;
  updated_at: Date | string;
}

const RECORDING_COLUMNS = `id, song_id, provider, media_id, source_url, title, source_name, description, arrangement,
  music_key, visibility, is_primary, updated_at`;

const iso = (value: Date | string) => new Date(value).toISOString();

function toRecording(row: RecordingRow): Recording {
  return {
    id: row.id,
    songId: row.song_id,
    provider: row.provider,
    mediaId: row.media_id,
    sourceUrl: row.source_url,
    title: row.title,
    sourceName: row.source_name,
    description: row.description,
    arrangement: row.arrangement,
    musicKey: row.music_key,
    visibility: row.visibility,
    isPrimary: row.is_primary,
    updatedAt: iso(row.updated_at),
  };
}

/**
 * Recordings, oldest first. `visibility: "public"` returns public ones only -
 * what may be cached and shown to anyone. Optionally only some songs.
 */
export async function listRecordings(
  env: ClerkEnv,
  filter: { visibility?: RecordingVisibility; songIds?: readonly string[] } = {},
): Promise<Recording[]> {
  const sql = await recordingsSql();
  const rows = (await sql.query(
    `SELECT ${RECORDING_COLUMNS} FROM song_recordings
      WHERE clerk_env = $1
        AND ($2::text IS NULL OR visibility = $2)
        AND ($3::text[] IS NULL OR song_id = ANY($3::text[]))
      ORDER BY created_at, id`,
    [env, filter.visibility ?? null, filter.songIds ? [...filter.songIds] : null],
  )) as RecordingRow[];
  return rows.map(toRecording);
}

export async function getRecording(env: ClerkEnv, id: string): Promise<Recording | null> {
  const sql = await recordingsSql();
  const rows = (await sql.query(`SELECT ${RECORDING_COLUMNS} FROM song_recordings WHERE clerk_env = $1 AND id = $2::uuid`, [
    env,
    id,
  ])) as RecordingRow[];
  return rows[0] ? toRecording(rows[0]) : null;
}

export interface RecordingWrite {
  songId: string;
  provider: "youtube";
  mediaId: string;
  sourceUrl: string;
  title: string;
  sourceName: string | null;
  description: string | null;
  arrangement: string | null;
  musicKey: string | null;
  visibility: RecordingVisibility;
}

/**
 * Adds a recording. A song's first recording becomes its primary, so a song
 * with one recording plays it; a later one never takes over - changing the
 * primary is always chosen. If two first recordings race, the one-primary
 * index refuses the second as primary and it is added as an ordinary one.
 */
export async function insertRecording(
  env: ClerkEnv,
  write: RecordingWrite,
  actor: string,
): Promise<{ ok: true; recording: Recording } | { ok: false; reason: "duplicate" }> {
  const sql = await recordingsSql();
  const insert = async (mayBePrimary: boolean) =>
    (await sql.query(
      `INSERT INTO song_recordings
         (clerk_env, song_id, provider, media_id, source_url, title, source_name, description, arrangement, music_key,
          visibility, created_by, updated_by, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12,
         $13::boolean AND NOT EXISTS (SELECT 1 FROM song_recordings WHERE clerk_env = $1 AND song_id = $2 AND is_primary))
       ON CONFLICT (clerk_env, song_id, provider, media_id) DO NOTHING
       RETURNING ${RECORDING_COLUMNS}`,
      [
        env,
        write.songId,
        write.provider,
        write.mediaId,
        write.sourceUrl,
        write.title,
        write.sourceName,
        write.description,
        write.arrangement,
        write.musicKey,
        write.visibility,
        actor,
        mayBePrimary,
      ],
    )) as RecordingRow[];
  let rows: RecordingRow[];
  try {
    rows = await insert(true);
  } catch (error) {
    // 23505: another first recording became the primary at the same moment.
    if ((error as { code?: unknown } | null)?.code !== "23505") throw error;
    rows = await insert(false);
  }
  return rows[0] ? { ok: true, recording: toRecording(rows[0]) } : { ok: false, reason: "duplicate" };
}

export type RecordingDetails = Pick<RecordingWrite, "title" | "sourceName" | "description" | "arrangement" | "musicKey" | "visibility">;

/** Changes a recording's details. Its song, provider and media never change: add another instead. */
export async function updateRecording(env: ClerkEnv, id: string, details: RecordingDetails, actor: string): Promise<Recording | null> {
  const sql = await recordingsSql();
  const rows = (await sql.query(
    `UPDATE song_recordings
        SET title = $3, source_name = $4, description = $5, arrangement = $6, music_key = $7, visibility = $8,
            updated_by = $9, updated_at = now()
      WHERE clerk_env = $1 AND id = $2::uuid
      RETURNING ${RECORDING_COLUMNS}`,
    [env, id, details.title, details.sourceName, details.description, details.arrangement, details.musicKey, details.visibility, actor],
  )) as RecordingRow[];
  return rows[0] ? toRecording(rows[0]) : null;
}

/**
 * Deletes a recording. When it was the primary, the song is left with none -
 * another is never promoted in its place. Services that chose it keep their
 * selection, now pointing at nothing, so the planner can show it is gone.
 */
export async function deleteRecording(env: ClerkEnv, id: string): Promise<Recording | null> {
  const sql = await recordingsSql();
  const rows = (await sql.query(
    `DELETE FROM song_recordings WHERE clerk_env = $1 AND id = $2::uuid RETURNING ${RECORDING_COLUMNS}`,
    [env, id],
  )) as RecordingRow[];
  return rows[0] ? toRecording(rows[0]) : null;
}

/**
 * Makes one recording the song's primary, or (recordingId null) leaves the
 * song with none. One transaction: the old primary is cleared before the new
 * one is set, so the unique index never sees two. Refused (false) when the
 * recording is not one of this song's in this environment.
 */
export async function setPrimaryRecording(env: ClerkEnv, songId: string, recordingId: string | null, actor: string): Promise<boolean> {
  const sql = await recordingsSql();
  const statements = [
    ...(recordingId
      ? [
          sql.query(
            `SELECT fwm_require(EXISTS (
               SELECT 1 FROM song_recordings
                WHERE clerk_env = $1 AND song_id = $2 AND id = $3::uuid AND provider IN ('youtube')
                FOR UPDATE), 'conflict')`,
            [env, songId, recordingId],
          ),
        ]
      : []),
    sql.query(
      `UPDATE song_recordings SET is_primary = false, updated_by = $3, updated_at = now()
        WHERE clerk_env = $1 AND song_id = $2 AND is_primary AND ($4::uuid IS NULL OR id <> $4::uuid)`,
      [env, songId, actor, recordingId],
    ),
    ...(recordingId
      ? [
          sql.query(
            `UPDATE song_recordings SET is_primary = true, updated_by = $3, updated_at = now()
              WHERE clerk_env = $1 AND song_id = $2 AND id = $4::uuid AND NOT is_primary`,
            [env, songId, actor, recordingId],
          ),
        ]
      : []),
  ];
  try {
    await sql.transaction(statements);
    return true;
  } catch (error) {
    if (isWriteConflict(error)) return false;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Media links
// ---------------------------------------------------------------------------

interface LinkRow {
  id: string;
  song_id: string;
  url: string;
  source: MediaLinkSource;
  title: string;
  description: string | null;
  visibility: RecordingVisibility;
  updated_at: Date | string;
}

const LINK_COLUMNS = `id, song_id, url, source, title, description, visibility, updated_at`;

function toLink(row: LinkRow): MediaLink {
  return {
    id: row.id,
    songId: row.song_id,
    url: row.url,
    source: row.source,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    updatedAt: iso(row.updated_at),
  };
}

export async function listMediaLinks(
  env: ClerkEnv,
  filter: { visibility?: RecordingVisibility; songIds?: readonly string[] } = {},
): Promise<MediaLink[]> {
  const sql = await recordingsSql();
  const rows = (await sql.query(
    `SELECT ${LINK_COLUMNS} FROM song_media_links
      WHERE clerk_env = $1
        AND ($2::text IS NULL OR visibility = $2)
        AND ($3::text[] IS NULL OR song_id = ANY($3::text[]))
      ORDER BY created_at, id`,
    [env, filter.visibility ?? null, filter.songIds ? [...filter.songIds] : null],
  )) as LinkRow[];
  return rows.map(toLink);
}

export interface MediaLinkWrite {
  songId: string;
  url: string;
  source: MediaLinkSource;
  title: string;
  description: string | null;
  visibility: RecordingVisibility;
}

export async function insertMediaLink(env: ClerkEnv, write: MediaLinkWrite, actor: string): Promise<MediaLink> {
  const sql = await recordingsSql();
  const rows = (await sql.query(
    `INSERT INTO song_media_links (clerk_env, song_id, url, source, title, description, visibility, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     RETURNING ${LINK_COLUMNS}`,
    [env, write.songId, write.url, write.source, write.title, write.description, write.visibility, actor],
  )) as LinkRow[];
  return toLink(rows[0]);
}

export async function updateMediaLink(
  env: ClerkEnv,
  id: string,
  write: Omit<MediaLinkWrite, "songId">,
  actor: string,
): Promise<MediaLink | null> {
  const sql = await recordingsSql();
  const rows = (await sql.query(
    `UPDATE song_media_links
        SET url = $3, source = $4, title = $5, description = $6, visibility = $7, updated_by = $8, updated_at = now()
      WHERE clerk_env = $1 AND id = $2::uuid
      RETURNING ${LINK_COLUMNS}`,
    [env, id, write.url, write.source, write.title, write.description, write.visibility, actor],
  )) as LinkRow[];
  return rows[0] ? toLink(rows[0]) : null;
}

export async function deleteMediaLink(env: ClerkEnv, id: string): Promise<MediaLink | null> {
  const sql = await recordingsSql();
  const rows = (await sql.query(`DELETE FROM song_media_links WHERE clerk_env = $1 AND id = $2::uuid RETURNING ${LINK_COLUMNS}`, [
    env,
    id,
  ])) as LinkRow[];
  return rows[0] ? toLink(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Selections for one service
// ---------------------------------------------------------------------------

interface SelectionRow {
  date: string;
  slot: ServiceSlot;
  place_id: string;
  song_id: string;
  recording_id: string | null;
}

function toSelection(row: SelectionRow): RecordingSelection {
  return { date: row.date, slot: row.slot, placeId: row.place_id, songId: row.song_id, recordingId: row.recording_id };
}

const SELECTION_COLUMNS = `to_char(service_date, 'YYYY-MM-DD') AS date, slot, place_id, song_id, recording_id`;

/** Selections for services in a date range (inclusive). */
export async function listSelections(env: ClerkEnv, range: { from: string; to?: string }): Promise<RecordingSelection[]> {
  const sql = await recordingsSql();
  const rows = (await sql.query(
    `SELECT ${SELECTION_COLUMNS} FROM service_recording_selections
      WHERE clerk_env = $1 AND service_date >= $2::date AND ($3::date IS NULL OR service_date <= $3::date)
      ORDER BY service_date, slot, place_id`,
    [env, range.from, range.to ?? null],
  )) as SelectionRow[];
  return rows.map(toSelection);
}

/**
 * Selections of published services from `from` on: all a public page may
 * know. A draft's choices stay in the planner until it is published.
 */
export async function listPublishedSelections(env: ClerkEnv, from: string): Promise<RecordingSelection[]> {
  const sql = await recordingsSql();
  const rows = (await sql.query(
    `SELECT to_char(s.service_date, 'YYYY-MM-DD') AS date, s.slot, s.place_id, s.song_id, s.recording_id
       FROM service_recording_selections s
       JOIN service_plans p
         ON p.clerk_env = s.clerk_env AND p.service_date = s.service_date AND p.slot = s.slot
      WHERE s.clerk_env = $1 AND s.service_date >= $2::date AND p.status = 'published'
      ORDER BY s.service_date, s.slot, s.place_id`,
    [env, from],
  )) as SelectionRow[];
  return rows.map(toSelection);
}

export interface SelectionWrite {
  date: string;
  slot: ServiceSlot;
  placeId: string;
  songId: string;
  /** null clears the place's selection: it uses the song's primary again. */
  recordingId: string | null;
}

/**
 * Chooses (or clears) the recording for one place of one service. One
 * transaction, refused as a conflict when the service was saved by anyone
 * since `planRevision` - which song is in which place is the service's to
 * say - or when the recording is not one of that song's.
 */
export async function saveSelection(
  env: ClerkEnv,
  write: SelectionWrite,
  planRevision: number,
  actor: string,
): Promise<{ ok: true } | { ok: false; reason: "conflict" }> {
  const sql = await recordingsSql();
  const guard = sql.query(
    `SELECT fwm_require(
       (SELECT revision FROM service_plans
         WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3 FOR SHARE) = $4,
       'conflict')`,
    [env, write.date, write.slot, planRevision],
  );
  const statements = write.recordingId
    ? [
        guard,
        sql.query(
          `SELECT fwm_require(EXISTS (
             SELECT 1 FROM song_recordings WHERE clerk_env = $1 AND id = $2::uuid AND song_id = $3), 'conflict')`,
          [env, write.recordingId, write.songId],
        ),
        sql.query(
          `INSERT INTO service_recording_selections (clerk_env, service_date, slot, place_id, song_id, recording_id, selected_by)
           VALUES ($1, $2::date, $3, $4, $5, $6::uuid, $7)
           ON CONFLICT (clerk_env, service_date, slot, place_id)
           DO UPDATE SET song_id = EXCLUDED.song_id, recording_id = EXCLUDED.recording_id,
                         selected_by = EXCLUDED.selected_by, selected_at = now()`,
          [env, write.date, write.slot, write.placeId, write.songId, write.recordingId, actor],
        ),
      ]
    : [
        guard,
        sql.query(
          `DELETE FROM service_recording_selections
            WHERE clerk_env = $1 AND service_date = $2::date AND slot = $3 AND place_id = $4`,
          [env, write.date, write.slot, write.placeId],
        ),
      ];
  try {
    await sql.transaction(statements);
    return { ok: true };
  } catch (error) {
    if (isWriteConflict(error)) return { ok: false, reason: "conflict" };
    throw error;
  }
}

/**
 * The statement, for the planner's save transaction, that drops every
 * selection of a service no longer true of it: its place is gone, or now
 * holds a different song. `keep` is each place and the song now in it.
 * Stale selections are ignored on reading anyway (selectionState); this
 * keeps the table honest.
 */
export function pruneSelectionsStatement(
  sql: Sql,
  env: ClerkEnv,
  service: { date: string; slot: ServiceSlot },
  keep: ReadonlyArray<{ placeId: string; songId: string }>,
) {
  return sql.query(
    `DELETE FROM service_recording_selections s
      WHERE s.clerk_env = $1 AND s.service_date = $2::date AND s.slot = $3
        AND NOT EXISTS (
          SELECT 1 FROM unnest($4::text[], $5::text[]) AS k(place_id, song_id)
           WHERE k.place_id = s.place_id AND k.song_id = s.song_id)`,
    [env, service.date, service.slot, keep.map((item) => item.placeId), keep.map((item) => item.songId)],
  );
}
