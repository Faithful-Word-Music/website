/**
 * The Personal Library tables: favorites, recent history, song notes, and the
 * durable marker that closes them while an account is being erased.
 *
 * Kept apart from AUTH_SCHEMA and MEMBERSHIP_SCHEMA so installing them never
 * re-runs an older data change. Purely additive. There are deliberately no
 * foreign keys: songs come from an index that can be briefly incomplete, and a
 * person's records must outlive that (docs/personal-library.md).
 *
 * Every row belongs to one Clerk environment and one Clerk user.
 */

const ENV = `clerk_env text NOT NULL CHECK (clerk_env IN ('development', 'production'))`;
const USER = `clerk_user_id text NOT NULL CHECK (char_length(clerk_user_id) BETWEEN 1 AND 200)`;
const SONG = `song_id text NOT NULL CHECK (char_length(song_id) BETWEEN 1 AND 200)`;

/** @type {string[]} */
export const PERSONAL_LIBRARY_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS user_song_favorites (
     ${ENV},
     ${USER},
     ${SONG},
     created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
     PRIMARY KEY (clerk_env, clerk_user_id, song_id)
   )`,
  `CREATE INDEX IF NOT EXISTS user_song_favorites_owner_order
     ON user_song_favorites (clerk_env, clerk_user_id, created_at DESC, song_id)`,
  `CREATE TABLE IF NOT EXISTS user_library_recent (
     ${ENV},
     ${USER},
     resource_kind   text        NOT NULL CHECK (resource_kind IN ('song', 'sheet_file')),
     resource_key    text        NOT NULL CHECK (char_length(resource_key) BETWEEN 1 AND 200),
     first_viewed_at timestamptz NOT NULL,
     last_viewed_at  timestamptz NOT NULL,
     PRIMARY KEY (clerk_env, clerk_user_id, resource_kind, resource_key),
     CONSTRAINT user_library_recent_order CHECK (last_viewed_at >= first_viewed_at)
   )`,
  `CREATE INDEX IF NOT EXISTS user_library_recent_owner_order
     ON user_library_recent (clerk_env, clerk_user_id, last_viewed_at DESC, resource_kind, resource_key)`,
  // note_id is new each time a note is created, so a request about a deleted
  // note can never apply to a later one at the same revision. last_mutation_id
  // is only the latest successful write: see updateNote in store.ts.
  // A deleted note stays as a tombstone: deleted_at set, content emptied. It is
  // what stops a retried create from bringing the note back (createNote).
  `CREATE TABLE IF NOT EXISTS user_song_notes (
     ${ENV},
     ${USER},
     ${SONG},
     content          text        NOT NULL CHECK (char_length(content) <= 20000),
     revision         integer     NOT NULL DEFAULT 1 CHECK (revision >= 1),
     note_id          uuid        NOT NULL,
     last_mutation_id uuid        NOT NULL,
     created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
     updated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
     deleted_at       timestamptz,
     PRIMARY KEY (clerk_env, clerk_user_id, song_id)
   )`,
  // For a copy of this table made before tombstones existed.
  `ALTER TABLE user_song_notes ADD COLUMN IF NOT EXISTS deleted_at timestamptz`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_song_notes_tombstone_empty') THEN
       ALTER TABLE user_song_notes
         ADD CONSTRAINT user_song_notes_tombstone_empty CHECK (deleted_at IS NULL OR content = '');
     END IF;
   END
   $$`,
  // One row per account being, or already, erased. Holds no name or content.
  // open_attempts are Clerk deletions that might still take effect.
  `CREATE TABLE IF NOT EXISTS personal_library_erasures (
     ${ENV},
     ${USER},
     state            text        NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'complete')),
     open_attempts    uuid[]      NOT NULL DEFAULT '{}',
     requested_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
     updated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
     last_recovery_at timestamptz,
     completed_at     timestamptz,
     PRIMARY KEY (clerk_env, clerk_user_id),
     CONSTRAINT personal_library_erasures_completed CHECK (state <> 'complete' OR completed_at IS NOT NULL)
   )`,
  // Last on purpose: PERSONAL_LIBRARY_SCHEMA_READY looks for it.
  `CREATE INDEX IF NOT EXISTS personal_library_erasures_pending
     ON personal_library_erasures (clerk_env, last_recovery_at NULLS FIRST, requested_at)
     WHERE state = 'pending'`,
];

/** True once every statement has run: the last object, and the tombstone rule for an older copy. */
export const PERSONAL_LIBRARY_SCHEMA_READY = `SELECT to_regclass('public.personal_library_erasures_pending') IS NOT NULL
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_song_notes_tombstone_empty') AS ready`;
