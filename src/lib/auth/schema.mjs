/**
 * The account tables, created on first use like the song archive's (see
 * src/lib/archive-store.ts), so there is no migration step to run.
 *
 * A plain .mjs module so that both the site and scripts/bootstrap-admin.mjs
 * create exactly the same tables.
 *
 * Every table carries `clerk_env` ("development" or "production"): Local,
 * Preview and Production share one Neon database, but Clerk Development and
 * Production are separate instances with separate users. Every query filters
 * on it, so test accounts never appear in the production admin - and a
 * Development user ID never means anything in Production.
 *
 * Names, email addresses, photos and ban state are NOT stored here. They
 * belong to Clerk and are read from it. The one exception is an account
 * request's name and email, which are the request itself.
 */

const ENV = `clerk_env text NOT NULL CHECK (clerk_env IN ('development', 'production'))`;

/** @type {string[]} */
export const AUTH_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS roles (
     ${ENV},
     key         text        NOT NULL,
     label       text        NOT NULL,
     description text        NOT NULL DEFAULT '',
     is_system   boolean     NOT NULL DEFAULT false,
     created_at  timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, key)
   )`,
  `CREATE TABLE IF NOT EXISTS role_permissions (
     ${ENV},
     role_key   text NOT NULL,
     permission text NOT NULL,
     PRIMARY KEY (clerk_env, role_key, permission),
     FOREIGN KEY (clerk_env, role_key) REFERENCES roles (clerk_env, key) ON DELETE CASCADE
   )`,
  `CREATE TABLE IF NOT EXISTS user_roles (
     ${ENV},
     clerk_user_id text        NOT NULL,
     role_key      text        NOT NULL,
     granted_by    text,
     granted_at    timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, clerk_user_id, role_key),
     FOREIGN KEY (clerk_env, role_key) REFERENCES roles (clerk_env, key) ON DELETE CASCADE
   )`,
  // Roles chosen when an invitation was sent, given to the person the first
  // time their new account is used (see applyInvitationRoles in store.ts).
  `CREATE TABLE IF NOT EXISTS invitation_roles (
     ${ENV},
     clerk_invitation_id text        NOT NULL,
     email_normalized    text        NOT NULL,
     role_key            text        NOT NULL,
     assigned_by         text,
     created_at          timestamptz NOT NULL DEFAULT now(),
     applied_at          timestamptz,
     PRIMARY KEY (clerk_env, clerk_invitation_id, role_key),
     FOREIGN KEY (clerk_env, role_key) REFERENCES roles (clerk_env, key) ON DELETE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS invitation_roles_pending
     ON invitation_roles (clerk_env, email_normalized) WHERE applied_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS user_permission_overrides (
     ${ENV},
     clerk_user_id text        NOT NULL,
     permission    text        NOT NULL,
     effect        text        NOT NULL CHECK (effect IN ('grant', 'deny')),
     note          text        NOT NULL DEFAULT '',
     set_by        text,
     set_at        timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, clerk_user_id, permission)
   )`,
  `CREATE TABLE IF NOT EXISTS account_requests (
     id                  serial PRIMARY KEY,
     ${ENV},
     name                text        NOT NULL,
     email               text        NOT NULL,
     email_normalized    text        NOT NULL,
     message             text        NOT NULL DEFAULT '',
     status              text        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'invited', 'active', 'rejected', 'revoked', 'expired')),
     clerk_invitation_id text,
     reviewed_by         text,
     reviewed_at         timestamptz,
     review_note         text        NOT NULL DEFAULT '',
     created_at          timestamptz NOT NULL DEFAULT now(),
     updated_at          timestamptz NOT NULL DEFAULT now()
   )`,
  // At most one open (pending or invited) request per address, enforced by the
  // database so two quick submissions cannot both get through.
  `CREATE UNIQUE INDEX IF NOT EXISTS account_requests_open_email
     ON account_requests (clerk_env, email_normalized)
     WHERE status IN ('pending', 'invited')`,
  `CREATE INDEX IF NOT EXISTS account_requests_status
     ON account_requests (clerk_env, status, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS user_profiles (
     ${ENV},
     clerk_user_id        text        NOT NULL,
     middle_name          text        NOT NULL DEFAULT '',
     preferred_name       text        NOT NULL DEFAULT '',
     bio                  text        NOT NULL DEFAULT '',
     phone                text        NOT NULL DEFAULT '',
     voice_part           text,
     service_availability text[]      NOT NULL DEFAULT '{}',
     learning_style       smallint    CHECK (learning_style BETWEEN 1 AND 5),
     theory_level         text,
     reads_sheet_music    boolean,
     created_at           timestamptz NOT NULL DEFAULT now(),
     updated_at           timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, clerk_user_id)
   )`,
  `CREATE TABLE IF NOT EXISTS instruments (
     id         serial PRIMARY KEY,
     ${ENV},
     label      text        NOT NULL,
     sort_order integer     NOT NULL DEFAULT 0,
     archived   boolean     NOT NULL DEFAULT false,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS instruments_label ON instruments (clerk_env, lower(label))`,
  `CREATE TABLE IF NOT EXISTS user_instruments (
     ${ENV},
     clerk_user_id text    NOT NULL,
     instrument_id integer NOT NULL REFERENCES instruments (id) ON DELETE CASCADE,
     proficiency   text    NOT NULL CHECK (proficiency IN ('learning', 'comfortable', 'confident', 'can_lead')),
     is_primary    boolean NOT NULL DEFAULT false,
     PRIMARY KEY (clerk_env, clerk_user_id, instrument_id)
   )`,
  // "can_lead" was an early fourth level, since removed: fold it into the
  // top level that remains. (The CHECK above still allows the old value, so
  // tables created before the change keep working.)
  `UPDATE user_instruments SET proficiency = 'confident' WHERE proficiency = 'can_lead'`,
  `CREATE TABLE IF NOT EXISTS titles (
     id         serial PRIMARY KEY,
     ${ENV},
     label      text        NOT NULL,
     sort_order integer     NOT NULL DEFAULT 0,
     archived   boolean     NOT NULL DEFAULT false,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS titles_label ON titles (clerk_env, lower(label))`,
  `CREATE TABLE IF NOT EXISTS user_titles (
     ${ENV},
     clerk_user_id text        NOT NULL,
     title_id      integer     NOT NULL REFERENCES titles (id) ON DELETE CASCADE,
     is_primary    boolean     NOT NULL DEFAULT false,
     assigned_by   text,
     assigned_at   timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, clerk_user_id, title_id)
   )`,
  // The sheet music each person is given on their Dashboard, chosen for them
  // by whoever looks after the sheet music (manage_sheet_music): one type
  // per person (type_id, added below).
  `CREATE TABLE IF NOT EXISTS user_sheet_music (
     ${ENV},
     clerk_user_id text        NOT NULL,
     variant       text        NOT NULL,
     instrument    text,
     assigned_by   text,
     assigned_at   timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, clerk_user_id)
   )`,
  // The sheet music types offered, named and ordered under Admin ->
  // Configuration. legacy_key ("Capo|Guitar") marks the starting types, so
  // assignments made before types existed can be moved onto them.
  `CREATE TABLE IF NOT EXISTS sheet_music_types (
     id         serial PRIMARY KEY,
     ${ENV},
     label      text        NOT NULL,
     sort_order integer     NOT NULL DEFAULT 0,
     legacy_key text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  // An early shape (one variant + instrument per type) only ever existed in
  // Development: drop its rows and columns so the defaults seed afresh.
  `DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'sheet_music_types' AND column_name = 'variant') THEN
       DELETE FROM sheet_music_types;
       DROP INDEX IF EXISTS sheet_music_types_files;
       ALTER TABLE sheet_music_types DROP COLUMN variant, DROP COLUMN instrument;
     END IF;
   END $$`,
  `ALTER TABLE sheet_music_types ADD COLUMN IF NOT EXISTS legacy_key text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sheet_music_types_label ON sheet_music_types (clerk_env, lower(label))`,
  // Where a type's files are: folder names below "Sheet Music", with '*'
  // standing for any collection folder. Everything inside belongs to the type.
  `CREATE TABLE IF NOT EXISTS sheet_music_type_sources (
     id         serial PRIMARY KEY,
     ${ENV},
     type_id    integer     NOT NULL REFERENCES sheet_music_types (id) ON DELETE CASCADE,
     path       text[]      NOT NULL,
     sort_order integer     NOT NULL DEFAULT 0,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  // Assignments point at a type; the variant/instrument columns are the
  // older form, kept only to move those assignments over (see store.ts).
  `ALTER TABLE user_sheet_music ADD COLUMN IF NOT EXISTS type_id integer
     REFERENCES sheet_music_types (id) ON DELETE CASCADE`,
  `ALTER TABLE user_sheet_music ALTER COLUMN variant DROP NOT NULL`,
  // One-time data changes already applied in an environment (see
  // PERMISSION_FIXUPS in permissions.ts), so each runs exactly once.
  `CREATE TABLE IF NOT EXISTS schema_fixups (
     ${ENV},
     key        text        NOT NULL,
     applied_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, key)
   )`,
  // Availability (src/lib/availability/): a dated change from someone's
  // normal services (user_profiles.service_availability), for one whole
  // service - its date and AM/PM, the same identity the song archive uses.
  // Only real differences are kept: "Normal" deletes the row, and a date
  // range is stored as one row per service it covers.
  `CREATE TABLE IF NOT EXISTS availability_exceptions (
     ${ENV},
     clerk_user_id text        NOT NULL,
     service_date  date        NOT NULL,
     slot          text        NOT NULL CHECK (slot IN ('AM', 'PM')),
     status        text        NOT NULL CHECK (status IN ('available', 'unavailable')),
     note          text,
     created_by    text,
     created_at    timestamptz NOT NULL DEFAULT now(),
     updated_by    text,
     updated_at    timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, clerk_user_id, service_date, slot)
   )`,
  `CREATE INDEX IF NOT EXISTS availability_exceptions_date
     ON availability_exceptions (clerk_env, service_date)`,
];

/** The administrator role row, which the bootstrap script needs before it can assign it. */
export const ADMIN_ROLE_ROW = {
  key: "administrator",
  label: "Administrator",
  description: "Runs the website: accounts, roles and settings. Always has every permission.",
};
