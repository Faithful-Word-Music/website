import "server-only";

import { getSql } from "@/lib/db";
import { isFresh, serviceId } from "@/lib/song-history";
import { cleanSong, songKey } from "@/lib/song-list";
import type { DatedService, ServiceSlot, Song } from "@/types/song-list";

/**
 * Reading and writing the permanent song archive.
 *
 * Two small tables: one row per service, one row per song sung in it. The
 * tables are created on first use, so there is no migration step to run.
 */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS services (
     id           serial PRIMARY KEY,
     service_date date        NOT NULL,
     slot         text        NOT NULL CHECK (slot IN ('AM', 'PM')),
     starts_at    timestamptz NOT NULL,
     updated_at   timestamptz NOT NULL DEFAULT now(),
     UNIQUE (service_date, slot)
   )`,
  `CREATE TABLE IF NOT EXISTS service_songs (
     service_id integer NOT NULL REFERENCES services (id) ON DELETE CASCADE,
     position   integer NOT NULL,
     number     text,
     title      text    NOT NULL,
     key        text,
     title_key  text    NOT NULL,
     PRIMARY KEY (service_id, position)
   )`,
  `CREATE INDEX IF NOT EXISTS service_songs_title_key ON service_songs (title_key)`,
];

interface ServiceRow {
  date: string;
  slot: ServiceSlot;
  starts_at: Date | string;
  songs: Song[] | string;
}

/**
 * Every stored service, oldest first. Returns null when the archive database
 * is not configured, so callers can carry on with the sheet alone.
 */
export async function loadStoredServices(): Promise<DatedService[] | null> {
  const sql = getSql();
  if (!sql) return null;

  await ensureSchema();

  const rows = (await sql.query(`
    SELECT s.service_date::text AS date,
           s.slot,
           s.starts_at,
           COALESCE(
             json_agg(
               json_build_object('number', ss.number, 'title', ss.title, 'key', ss.key)
               ORDER BY ss.position
             ) FILTER (WHERE ss.service_id IS NOT NULL),
             '[]'
           ) AS songs
      FROM services s
      LEFT JOIN service_songs ss ON ss.service_id = s.id
     GROUP BY s.id
     ORDER BY s.starts_at
  `)) as ServiceRow[];

  return rows
    .map((row) => {
      const songs = typeof row.songs === "string" ? (JSON.parse(row.songs) as Song[]) : row.songs;
      return {
        date: row.date,
        slot: row.slot,
        startsAt: new Date(row.starts_at).toISOString(),
        // Rows saved before placeholders were recognised may hold "#N/A" or
        // "TBD"; they are cleaned on the way out rather than deleted.
        songs: songs.map(cleanSong).filter((song): song is Song => song !== null),
      };
    })
    .filter((service) => service.songs.length > 0);
}

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  const sql = getSql();
  if (!sql || schemaReady) return;
  for (const statement of SCHEMA) await sql.query(statement);
  schemaReady = true;
}

export interface SaveSummary {
  /** Services stored for the first time. */
  added: number;
  /** Fresh services re-saved from the sheet (picks up corrections). */
  refreshed: number;
  /** Stored services older than the freshness window, left untouched. */
  frozen: number;
}

/**
 * Saves services that have already taken place.
 *
 *   not yet stored          -> added
 *   stored and still fresh  -> replaced with the sheet's version
 *   stored and frozen       -> left alone
 *
 * Nothing is ever deleted: a service that disappears from the sheet (because
 * its tab was reused) stays in the archive. All writes happen in one
 * transaction, so a failure part-way leaves the archive as it was.
 */
export async function saveServices(services: DatedService[], now: number): Promise<SaveSummary> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not set");

  await ensureSchema();

  const existing = new Set(
    (
      (await sql.query(
        `SELECT service_date::text AS date, slot FROM services`,
      )) as Array<{ date: string; slot: ServiceSlot }>
    ).map(serviceId),
  );

  const summary: SaveSummary = { added: 0, refreshed: 0, frozen: 0 };
  const toWrite: DatedService[] = [];

  // One row per date and slot: should the sheet ever still hold two services
  // with the same key, the later one wins rather than both being written.
  const unique = new Map(services.map((service) => [serviceId(service), service]));

  for (const service of unique.values()) {
    if (Date.parse(service.startsAt) > now) continue;

    if (!existing.has(serviceId(service))) {
      summary.added += 1;
      toWrite.push(service);
    } else if (isFresh(service, now)) {
      summary.refreshed += 1;
      toWrite.push(service);
    } else {
      summary.frozen += 1;
    }
  }

  if (toWrite.length === 0) return summary;

  await sql.transaction((txn) =>
    toWrite.flatMap((service) => {
      const songs = service.songs.map((song, position) => ({
        position,
        number: song.number,
        title: song.title,
        key: song.key,
        title_key: songKey(song.title),
      }));
      const idOf = `(SELECT id FROM services WHERE service_date = $1::date AND slot = $2)`;

      return [
        txn.query(
          `INSERT INTO services (service_date, slot, starts_at)
           VALUES ($1::date, $2, $3::timestamptz)
           ON CONFLICT (service_date, slot)
           DO UPDATE SET starts_at = EXCLUDED.starts_at, updated_at = now()`,
          [service.date, service.slot, service.startsAt],
        ),
        txn.query(`DELETE FROM service_songs WHERE service_id = ${idOf}`, [
          service.date,
          service.slot,
        ]),
        txn.query(
          `INSERT INTO service_songs (service_id, position, number, title, key, title_key)
           SELECT ${idOf}, x.position, x.number, x.title, x.key, x.title_key
             FROM jsonb_to_recordset($3::jsonb)
               AS x(position int, number text, title text, key text, title_key text)`,
          [service.date, service.slot, JSON.stringify(songs)],
        ),
      ];
    }),
  );

  return summary;
}
