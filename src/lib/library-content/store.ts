import "server-only";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { getSql } from "@/lib/db";

import type { LyricSection, SectionKind } from "./lyrics";
import type { IndexedSong, IndexStatus, SongSource } from "./plan";

/**
 * The library index: the words of every song, read once from its MuseScore
 * file and kept in Neon, so nothing opens a file while a question is being
 * answered.
 *
 *   library_songs           one row per song of the Sheet Music Index (its
 *                           Song ID): which file its lyrics were read from
 *                           and that file's checksum, the parser's version,
 *                           how it went, and the lyrics as one text
 *   library_song_sections   its verses, refrain and other sections, in order
 *   library_embeddings      vectors, kept by the HASH OF THE TEXT they were
 *                           made from, and the model that made them
 *   library_index_state     when the index was last refreshed
 *
 * Embeddings are stored apart from what they describe on purpose. A song and
 * each section only name the hash of their text, so the same words are never
 * embedded twice: not when a file is saved again unchanged, not when the same
 * hymn sits in two hymnals, not when one verse of a song is corrected. A new
 * embedding model simply has no rows yet - "what needs embedding" is always
 * "hashes without a vector from the current model".
 *
 * Like the planner's tables these are created on first use and every row
 * carries the Clerk environment (Local, Preview and Production share one
 * database). No authorization happens here: the indexer and Conductor's
 * tools check use_ai before they are reached.
 */

const ENV = `clerk_env text NOT NULL CHECK (clerk_env IN ('development', 'production'))`;

const SCHEMA = [
  // pgvector, for the search by theme. The database's owner may enable it; see AI.md if this is refused.
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `CREATE TABLE IF NOT EXISTS library_songs (
     ${ENV},
     song_id              text        NOT NULL,
     title                text        NOT NULL,
     title_key            text        NOT NULL,
     collection           text,
     hymn_number          text,
     status               text        NOT NULL CHECK (status IN ('indexed', 'no_source', 'no_lyrics', 'failed')),
     error_detail         text,
     source_file_id       text,
     source_modified_time text,
     source_md5           text,
     parser_version       integer     NOT NULL,
     content_hash         text,
     lyrics_text          text,
     search_text          text,
     embed_hash           text,
     section_count        integer     NOT NULL DEFAULT 0,
     word_count           integer     NOT NULL DEFAULT 0,
     indexed_at           timestamptz,
     checked_at           timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, song_id)
   )`,
  `CREATE TABLE IF NOT EXISTS library_song_sections (
     ${ENV},
     song_id     text    NOT NULL,
     position    integer NOT NULL,
     kind        text    NOT NULL CHECK (kind IN ('verse', 'refrain', 'section', 'part')),
     number      integer,
     text        text    NOT NULL,
     search_text text    NOT NULL,
     embed_hash  text    NOT NULL,
     PRIMARY KEY (clerk_env, song_id, position),
     FOREIGN KEY (clerk_env, song_id) REFERENCES library_songs (clerk_env, song_id) ON DELETE CASCADE
   )`,
  `CREATE TABLE IF NOT EXISTS library_embeddings (
     ${ENV},
     text_hash  text        NOT NULL,
     model      text        NOT NULL,
     embedding  vector      NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, text_hash, model)
   )`,
  `CREATE TABLE IF NOT EXISTS library_index_state (
     ${ENV} PRIMARY KEY,
     refreshed_at timestamptz NOT NULL
   )`,
];

export class LibraryIndexUnavailableError extends Error {
  constructor() {
    super("DATABASE_URL is not set");
    this.name = "LibraryIndexUnavailableError";
  }
}

let schemaReady = false;

async function librarySql() {
  const sql = getSql();
  if (!sql) throw new LibraryIndexUnavailableError();
  if (!schemaReady) {
    for (const statement of SCHEMA) await sql.query(statement);
    schemaReady = true;
  }
  return sql;
}

// ---------------------------------------------------------------------------
// Writing (the indexer)
// ---------------------------------------------------------------------------

/** What the index holds for every song, for deciding what a refresh must do. One query. */
export async function listIndexedSongs(env: ClerkEnv): Promise<IndexedSong[]> {
  const sql = await librarySql();
  const rows = (await sql.query(
    `SELECT song_id, title, collection, hymn_number, status, source_file_id, source_modified_time, source_md5, parser_version
       FROM library_songs WHERE clerk_env = $1`,
    [env],
  )) as Array<{
    song_id: string;
    title: string;
    collection: string | null;
    hymn_number: string | null;
    status: IndexStatus;
    source_file_id: string | null;
    source_modified_time: string | null;
    source_md5: string | null;
    parser_version: number;
  }>;
  return rows.map((row) => ({
    songId: row.song_id,
    title: row.title,
    collection: row.collection,
    hymnNumber: row.hymn_number,
    status: row.status,
    sourceFileId: row.source_file_id,
    sourceModifiedTime: row.source_modified_time,
    sourceMd5: row.source_md5,
    parserVersion: row.parser_version,
  }));
}

/** A section as it is stored: its text, and the hash its embedding is kept under. */
export interface StoredSection extends LyricSection {
  searchText: string;
  embedHash: string;
}

/** One song as a refresh found it. */
export interface SongRecord {
  songId: string;
  title: string;
  titleKey: string;
  collection: string | null;
  hymnNumber: string | null;
  status: IndexStatus;
  /** Why it failed. Already safe to keep: a status or a parser's message, never a file ID. */
  errorDetail: string | null;
  source: SongSource | null;
  parserVersion: number;
  /** Its words; null unless `status` is "indexed". */
  content: {
    hash: string;
    text: string;
    searchText: string;
    words: number;
    embedHash: string;
    sections: StoredSection[];
  } | null;
}

/**
 * Stores a batch of songs as a refresh read them, replacing whatever was
 * there: each song's row, and all of its sections. One transaction of three
 * statements, however many songs.
 */
export async function saveSongs(env: ClerkEnv, songs: readonly SongRecord[]): Promise<void> {
  if (songs.length === 0) return;
  const sql = await librarySql();

  const rows = songs.map((song) => ({
    song_id: song.songId,
    title: song.title,
    title_key: song.titleKey,
    collection: song.collection,
    hymn_number: song.hymnNumber,
    status: song.status,
    error_detail: song.errorDetail,
    source_file_id: song.source?.driveFileId ?? null,
    source_modified_time: song.source?.modifiedTime ?? null,
    source_md5: song.source?.md5 ?? null,
    parser_version: song.parserVersion,
    content_hash: song.content?.hash ?? null,
    lyrics_text: song.content?.text ?? null,
    search_text: song.content?.searchText ?? null,
    embed_hash: song.content?.embedHash ?? null,
    section_count: song.content?.sections.length ?? 0,
    word_count: song.content?.words ?? 0,
  }));
  const sections = songs.flatMap((song) =>
    (song.content?.sections ?? []).map((section, position) => ({
      song_id: song.songId,
      position,
      kind: section.kind,
      number: section.number,
      text: section.text,
      search_text: section.searchText,
      embed_hash: section.embedHash,
    })),
  );

  await sql.transaction((txn) => [
    txn.query(
      `INSERT INTO library_songs (clerk_env, song_id, title, title_key, collection, hymn_number, status, error_detail,
         source_file_id, source_modified_time, source_md5, parser_version, content_hash, lyrics_text, search_text,
         embed_hash, section_count, word_count, indexed_at, checked_at)
       SELECT $1, s.song_id, s.title, s.title_key, s.collection, s.hymn_number, s.status, s.error_detail,
              s.source_file_id, s.source_modified_time, s.source_md5, s.parser_version, s.content_hash, s.lyrics_text,
              s.search_text, s.embed_hash, s.section_count, s.word_count,
              CASE WHEN s.status = 'indexed' THEN now() END, now()
         FROM jsonb_to_recordset($2::jsonb) AS s(song_id text, title text, title_key text, collection text, hymn_number text,
              status text, error_detail text, source_file_id text, source_modified_time text, source_md5 text,
              parser_version integer, content_hash text, lyrics_text text, search_text text, embed_hash text,
              section_count integer, word_count integer)
       ON CONFLICT (clerk_env, song_id) DO UPDATE SET
         title = EXCLUDED.title, title_key = EXCLUDED.title_key, collection = EXCLUDED.collection,
         hymn_number = EXCLUDED.hymn_number, status = EXCLUDED.status, error_detail = EXCLUDED.error_detail,
         source_file_id = EXCLUDED.source_file_id, source_modified_time = EXCLUDED.source_modified_time,
         source_md5 = EXCLUDED.source_md5, parser_version = EXCLUDED.parser_version, content_hash = EXCLUDED.content_hash,
         lyrics_text = EXCLUDED.lyrics_text, search_text = EXCLUDED.search_text, embed_hash = EXCLUDED.embed_hash,
         section_count = EXCLUDED.section_count, word_count = EXCLUDED.word_count,
         indexed_at = EXCLUDED.indexed_at, checked_at = EXCLUDED.checked_at`,
      [env, JSON.stringify(rows)],
    ),
    txn.query(`DELETE FROM library_song_sections WHERE clerk_env = $1 AND song_id = ANY($2::text[])`, [
      env,
      songs.map((song) => song.songId),
    ]),
    txn.query(
      `INSERT INTO library_song_sections (clerk_env, song_id, position, kind, number, text, search_text, embed_hash)
       SELECT $1, x.song_id, x.position, x.kind, x.number, x.text, x.search_text, x.embed_hash
         FROM jsonb_to_recordset($2::jsonb) AS x(song_id text, position integer, kind text, number integer, text text,
              search_text text, embed_hash text)`,
      [env, JSON.stringify(sections)],
    ),
  ]);
}

/** Notes what changed about songs whose files did not: where the file is, the song's collection or number. */
export async function touchSongs(
  env: ClerkEnv,
  songs: ReadonlyArray<{ songId: string; collection: string | null; hymnNumber: string | null; source: SongSource }>,
): Promise<void> {
  if (songs.length === 0) return;
  const sql = await librarySql();
  await sql.query(
    `UPDATE library_songs l
        SET collection = s.collection, hymn_number = s.hymn_number, source_file_id = s.source_file_id,
            source_modified_time = s.source_modified_time, source_md5 = s.source_md5, checked_at = now()
       FROM jsonb_to_recordset($2::jsonb) AS s(song_id text, collection text, hymn_number text, source_file_id text,
            source_modified_time text, source_md5 text)
      WHERE l.clerk_env = $1 AND l.song_id = s.song_id`,
    [
      env,
      JSON.stringify(
        songs.map((song) => ({
          song_id: song.songId,
          collection: song.collection,
          hymn_number: song.hymnNumber,
          source_file_id: song.source.driveFileId,
          source_modified_time: song.source.modifiedTime,
          source_md5: song.source.md5,
        })),
      ),
    ],
  );
}

/** Drops songs that have left the Sheet Music Index (their sections go with them). */
export async function removeSongs(env: ClerkEnv, songIds: readonly string[]): Promise<void> {
  if (songIds.length === 0) return;
  const sql = await librarySql();
  await sql.query(`DELETE FROM library_songs WHERE clerk_env = $1 AND song_id = ANY($2::text[])`, [env, [...songIds]]);
}

export async function markRefreshed(env: ClerkEnv): Promise<void> {
  const sql = await librarySql();
  await sql.query(
    `INSERT INTO library_index_state (clerk_env, refreshed_at) VALUES ($1, now())
     ON CONFLICT (clerk_env) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at`,
    [env],
  );
}

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

/** A hash with no vector from `model` yet, in either table. */
const UNEMBEDDED = `NOT EXISTS (
  SELECT 1 FROM library_embeddings e WHERE e.clerk_env = $1 AND e.model = $2 AND e.text_hash = t.embed_hash
)`;

/** How many distinct texts still have no embedding from `model`. */
export async function countUnembedded(env: ClerkEnv, model: string): Promise<number> {
  const sql = await librarySql();
  const [row] = (await sql.query(
    `SELECT count(DISTINCT t.embed_hash) AS waiting FROM (
       SELECT embed_hash FROM library_songs WHERE clerk_env = $1 AND status = 'indexed'
       UNION ALL
       SELECT embed_hash FROM library_song_sections WHERE clerk_env = $1
     ) t WHERE ${UNEMBEDDED}`,
    [env, model],
  )) as Array<{ waiting: string | number }>;
  return Number(row?.waiting ?? 0);
}

/** What a text without an embedding is made of: enough to build that text again (lyrics.ts). */
export interface UnembeddedText {
  hash: string;
  title: string;
  /** One section, or for a whole song all of them in order. */
  sections: LyricSection[];
  whole: boolean;
}

/** Up to `limit` texts with no embedding from `model`: whole songs first, then sections. */
export async function listUnembedded(env: ClerkEnv, model: string, limit: number): Promise<UnembeddedText[]> {
  const sql = await librarySql();
  const [songs, sections] = (await Promise.all([
    sql.query(
      `SELECT t.embed_hash AS hash, t.title,
              (SELECT json_agg(json_build_object('kind', x.kind, 'number', x.number, 'text', x.text) ORDER BY x.position)
                 FROM library_song_sections x WHERE x.clerk_env = t.clerk_env AND x.song_id = t.song_id) AS sections
         FROM library_songs t
        WHERE t.clerk_env = $1 AND t.status = 'indexed' AND ${UNEMBEDDED}
        LIMIT $3`,
      [env, model, limit],
    ),
    sql.query(
      `SELECT t.embed_hash AS hash, s.title, t.kind, t.number, t.text
         FROM library_song_sections t
         JOIN library_songs s ON s.clerk_env = t.clerk_env AND s.song_id = t.song_id
        WHERE t.clerk_env = $1 AND ${UNEMBEDDED}
        LIMIT $3`,
      [env, model, limit],
    ),
  ])) as [
    Array<{ hash: string; title: string; sections: LyricSection[] | null }>,
    Array<{ hash: string; title: string; kind: SectionKind; number: number | null; text: string }>,
  ];

  const waiting = new Map<string, UnembeddedText>();
  for (const row of songs) waiting.set(row.hash, { hash: row.hash, title: row.title, sections: row.sections ?? [], whole: true });
  for (const row of sections) {
    if (!waiting.has(row.hash)) {
      waiting.set(row.hash, { hash: row.hash, title: row.title, sections: [{ kind: row.kind, number: row.number, text: row.text }], whole: false });
    }
  }
  return [...waiting.values()].slice(0, limit);
}

/** A vector as pgvector reads it. Every figure is a finite number, so nothing here needs escaping. */
export function vectorLiteral(vector: readonly number[]): string {
  return `[${vector.map((value) => (Number.isFinite(value) ? value : 0)).join(",")}]`;
}

export async function saveEmbeddings(
  env: ClerkEnv,
  model: string,
  embeddings: ReadonlyArray<{ hash: string; vector: readonly number[] }>,
): Promise<void> {
  if (embeddings.length === 0) return;
  const sql = await librarySql();
  await sql.query(
    `INSERT INTO library_embeddings (clerk_env, text_hash, model, embedding)
     SELECT $1, e.hash, $2, e.vector::vector FROM jsonb_to_recordset($3::jsonb) AS e(hash text, vector text)
     ON CONFLICT (clerk_env, text_hash, model) DO NOTHING`,
    [env, model, JSON.stringify(embeddings.map(({ hash, vector }) => ({ hash, vector: vectorLiteral(vector) })))],
  );
}

/** Drops vectors nothing names any more, and those of a model no longer used. Returns how many went. */
export async function pruneEmbeddings(env: ClerkEnv, model: string): Promise<number> {
  const sql = await librarySql();
  const rows = (await sql.query(
    `DELETE FROM library_embeddings e
      WHERE e.clerk_env = $1
        AND (e.model <> $2
          OR NOT (EXISTS (SELECT 1 FROM library_songs s WHERE s.clerk_env = $1 AND s.embed_hash = e.text_hash)
               OR EXISTS (SELECT 1 FROM library_song_sections x WHERE x.clerk_env = $1 AND x.embed_hash = e.text_hash)))
      RETURNING 1`,
    [env, model],
  )) as unknown[];
  return rows.length;
}

// ---------------------------------------------------------------------------
// Reading: status (Admin -> AI)
// ---------------------------------------------------------------------------

export interface LibraryIndexCounts {
  songs: number;
  indexed: number;
  noSource: number;
  noLyrics: number;
  failed: number;
  sections: number;
  /** Indexed songs whose words have no embedding from the current model yet. */
  awaitingEmbedding: number;
  /** When a refresh last ran to the end (ISO); null before the first. */
  refreshedAt: string | null;
}

export async function getLibraryIndexCounts(env: ClerkEnv, model: string): Promise<LibraryIndexCounts> {
  const sql = await librarySql();
  const [row] = (await sql.query(
    `SELECT count(*) AS songs,
            count(*) FILTER (WHERE status = 'indexed') AS indexed,
            count(*) FILTER (WHERE status = 'no_source') AS no_source,
            count(*) FILTER (WHERE status = 'no_lyrics') AS no_lyrics,
            count(*) FILTER (WHERE status = 'failed') AS failed,
            coalesce(sum(section_count), 0) AS sections,
            count(*) FILTER (WHERE status = 'indexed' AND NOT EXISTS (
              SELECT 1 FROM library_embeddings e WHERE e.clerk_env = $1 AND e.model = $2 AND e.text_hash = s.embed_hash
            )) AS awaiting,
            (SELECT refreshed_at FROM library_index_state WHERE clerk_env = $1) AS refreshed_at
       FROM library_songs s WHERE s.clerk_env = $1`,
    [env, model],
  )) as Array<Record<string, string | number | Date | null>>;
  return {
    songs: Number(row?.songs ?? 0),
    indexed: Number(row?.indexed ?? 0),
    noSource: Number(row?.no_source ?? 0),
    noLyrics: Number(row?.no_lyrics ?? 0),
    failed: Number(row?.failed ?? 0),
    sections: Number(row?.sections ?? 0),
    awaitingEmbedding: Number(row?.awaiting ?? 0),
    refreshedAt: row?.refreshed_at ? new Date(row.refreshed_at as string | Date).toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// Reading: the songs and their words (Conductor's tools)
// ---------------------------------------------------------------------------

/** A song of the library as the tools name it. Never its Drive file. */
export interface LibrarySong {
  songId: string;
  title: string;
  titleKey: string;
  collection: string | null;
  hymnNumber: string | null;
  status: IndexStatus;
  /** Why it could not be read, when it failed. */
  errorDetail: string | null;
  /** Songs with the same hash say exactly the same words. */
  contentHash: string | null;
}

interface SongRow {
  song_id: string;
  title: string;
  title_key: string;
  collection: string | null;
  hymn_number: string | null;
  status: IndexStatus;
  error_detail: string | null;
  content_hash: string | null;
}

const SONG_COLUMNS = `s.song_id, s.title, s.title_key, s.collection, s.hymn_number, s.status, s.error_detail, s.content_hash`;

const toSong = (row: SongRow): LibrarySong => ({
  songId: row.song_id,
  title: row.title,
  titleKey: row.title_key,
  collection: row.collection,
  hymnNumber: row.hymn_number,
  status: row.status,
  errorDetail: row.error_detail,
  contentHash: row.content_hash,
});

/** Every song the index knows, with or without lyrics: small rows, for finding the one a person means. */
export async function listLibrarySongs(env: ClerkEnv): Promise<LibrarySong[]> {
  const sql = await librarySql();
  const rows = (await sql.query(`SELECT ${SONG_COLUMNS} FROM library_songs s WHERE s.clerk_env = $1 ORDER BY s.title, s.song_id`, [env])) as SongRow[];
  return rows.map(toSong);
}

export async function getSongSections(env: ClerkEnv, songId: string): Promise<LyricSection[]> {
  const sql = await librarySql();
  return (await sql.query(
    `SELECT kind, number, text FROM library_song_sections WHERE clerk_env = $1 AND song_id = $2 ORDER BY position`,
    [env, songId],
  )) as LyricSection[];
}

/** A section found by a search, with the song it is in. */
export interface SectionHit {
  song: LibrarySong;
  section: LyricSection | null;
  /** How close it is to what was asked, 0 to 1; null for an exact match. */
  score: number | null;
}

type HitRow = SongRow & { kind: SectionKind | null; number: number | null; text: string | null; score?: string | number | null };

const toHit = (row: HitRow): SectionHit => ({
  song: toSong(row),
  section: row.kind && row.text !== null ? { kind: row.kind, number: row.number, text: row.text } : null,
  score: row.score === null || row.score === undefined ? null : Number(row.score),
});

/**
 * Sections containing an exact phrase, already folded (searchText): only
 * letters, digits and spaces, so it is safe inside LIKE. A phrase that runs
 * from one section into the next is found on the song, with no section.
 */
export async function findPhrase(env: ClerkEnv, phrase: string, limit: number): Promise<SectionHit[]> {
  const sql = await librarySql();
  const pattern = `%${phrase}%`;
  const rows = (await sql.query(
    `SELECT ${SONG_COLUMNS}, x.kind, x.number, x.text
       FROM library_song_sections x
       JOIN library_songs s ON s.clerk_env = x.clerk_env AND s.song_id = x.song_id
      WHERE x.clerk_env = $1 AND x.search_text LIKE $2
     UNION ALL
     SELECT ${SONG_COLUMNS}, NULL, NULL, NULL
       FROM library_songs s
      WHERE s.clerk_env = $1 AND s.status = 'indexed' AND s.search_text LIKE $2
        AND NOT EXISTS (
          SELECT 1 FROM library_song_sections x
           WHERE x.clerk_env = s.clerk_env AND x.song_id = s.song_id AND x.search_text LIKE $2
        )
      LIMIT $3`,
    [env, pattern, limit],
  )) as HitRow[];
  return rows.map(toHit);
}

/**
 * Songs whose lyrics contain every one of the words, in any order, with the
 * section that has the most of them. For a phrase half-remembered.
 */
export async function findWords(env: ClerkEnv, words: readonly string[], limit: number): Promise<SectionHit[]> {
  if (words.length === 0) return [];
  const sql = await librarySql();
  const rows = (await sql.query(
    `SELECT DISTINCT ON (s.song_id) ${SONG_COLUMNS}, x.kind, x.number, x.text
       FROM library_songs s
       JOIN library_song_sections x ON x.clerk_env = s.clerk_env AND x.song_id = s.song_id
      WHERE s.clerk_env = $1 AND s.status = 'indexed'
        AND string_to_array(s.search_text, ' ') @> $2::text[]
      ORDER BY s.song_id,
               (SELECT count(*) FROM unnest($2::text[]) AS w WHERE w = ANY(string_to_array(x.search_text, ' '))) DESC,
               x.position
      LIMIT $3`,
    [env, [...words], limit],
  )) as HitRow[];
  return rows.map(toHit);
}

/**
 * The songs and the sections nearest a vector, by cosine distance, among
 * those embedded by `model`. An exact scan: the library is a few thousand
 * vectors, so there is no index to keep and nothing approximate about it.
 */
export async function nearestTo(
  env: ClerkEnv,
  model: string,
  vector: readonly number[],
  limit: number,
): Promise<{ songs: SectionHit[]; sections: SectionHit[] }> {
  const sql = await librarySql();
  const literal = vectorLiteral(vector);
  const [songs, sections] = (await Promise.all([
    sql.query(
      `SELECT ${SONG_COLUMNS}, NULL AS kind, NULL AS number, NULL AS text, 1 - (e.embedding <=> $3::vector) AS score
         FROM library_songs s
         JOIN library_embeddings e ON e.clerk_env = s.clerk_env AND e.text_hash = s.embed_hash AND e.model = $2
        WHERE s.clerk_env = $1 AND s.status = 'indexed'
        ORDER BY e.embedding <=> $3::vector LIMIT $4`,
      [env, model, literal, limit],
    ),
    sql.query(
      `SELECT ${SONG_COLUMNS}, x.kind, x.number, x.text, 1 - (e.embedding <=> $3::vector) AS score
         FROM library_song_sections x
         JOIN library_songs s ON s.clerk_env = x.clerk_env AND s.song_id = x.song_id
         JOIN library_embeddings e ON e.clerk_env = x.clerk_env AND e.text_hash = x.embed_hash AND e.model = $2
        WHERE x.clerk_env = $1
        ORDER BY e.embedding <=> $3::vector LIMIT $4`,
      [env, model, literal, limit],
    ),
  ])) as [HitRow[], HitRow[]];
  return { songs: songs.map(toHit), sections: sections.map(toHit) };
}

/** The songs whose words as a whole are nearest one song's, nearest first. Asks nothing of the AI Gateway. */
export async function nearestSongs(env: ClerkEnv, model: string, songId: string, limit: number): Promise<SectionHit[] | null> {
  const sql = await librarySql();
  const rows = (await sql.query(
    `WITH own AS (
       SELECT e.embedding FROM library_songs s
         JOIN library_embeddings e ON e.clerk_env = s.clerk_env AND e.text_hash = s.embed_hash AND e.model = $2
        WHERE s.clerk_env = $1 AND s.song_id = $3
     )
     SELECT ${SONG_COLUMNS}, NULL AS kind, NULL AS number, NULL AS text, 1 - (e.embedding <=> own.embedding) AS score,
            true AS embedded
       FROM own, library_songs s
       JOIN library_embeddings e ON e.clerk_env = s.clerk_env AND e.text_hash = s.embed_hash AND e.model = $2
      WHERE s.clerk_env = $1 AND s.status = 'indexed' AND s.song_id <> $3
      ORDER BY e.embedding <=> own.embedding LIMIT $4`,
    [env, model, songId, limit],
  )) as HitRow[];
  if (rows.length > 0) return rows.map(toHit);

  // Nothing near it, or the song itself has no embedding yet: say which.
  const [own] = (await sql.query(
    `SELECT 1 AS present FROM library_songs s
       JOIN library_embeddings e ON e.clerk_env = s.clerk_env AND e.text_hash = s.embed_hash AND e.model = $2
      WHERE s.clerk_env = $1 AND s.song_id = $3`,
    [env, model, songId],
  )) as unknown[];
  return own ? [] : null;
}
