/**
 * The membership tables: verified church affiliation, its audit history,
 * invitation decisions, and the record of each sheet-access activation.
 *
 * Kept apart from AUTH_SCHEMA so adding them never re-runs its older data
 * changes. Installed automatically on first use (db() in store.ts). They are
 * purely additive and do nothing until an Administrator activates sheet access
 * for one environment, and the site keeps working if the install fails.
 *
 * Every table carries `clerk_env`, like the account tables (schema.mjs).
 * Names and email addresses of account holders are not stored here, apart
 * from the normalized address an invitation decision was made for.
 */

const ENV = `clerk_env text NOT NULL CHECK (clerk_env IN ('development', 'production'))`;

/** @type {string[]} */
export const MEMBERSHIP_SCHEMA = [
  // Verified church affiliation. No row means unverified. Independent of
  // roles: it never makes anyone a musician, and revoking it touches nothing else.
  `CREATE TABLE IF NOT EXISTS user_church_affiliations (
     ${ENV},
     clerk_user_id text        NOT NULL,
     status        text        NOT NULL CHECK (status IN ('verified', 'revoked')),
     verified_by   text,
     verified_at   timestamptz,
     updated_by    text        NOT NULL,
     updated_at    timestamptz NOT NULL DEFAULT now(),
     note          text        NOT NULL DEFAULT '',
     PRIMARY KEY (clerk_env, clerk_user_id),
     CONSTRAINT user_church_affiliations_verifier
       CHECK (status <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
   )`,
  // Append-only history (enforced below). Rows outlive the account they
  // describe, so a reason must not contain personal details.
  `CREATE TABLE IF NOT EXISTS membership_audit_log (
     id                  bigserial PRIMARY KEY,
     ${ENV},
     target_user_id      text,
     action              text        NOT NULL,
     prior_status        text,
     new_status          text,
     actor_user_id       text        NOT NULL,
     reason              text        NOT NULL DEFAULT '',
     account_request_id  integer,
     clerk_invitation_id text,
     decision_id         text,
     created_at          timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT membership_audit_log_subject CHECK (target_user_id IS NOT NULL OR decision_id IS NOT NULL)
   )`,
  `CREATE INDEX IF NOT EXISTS membership_audit_log_target
     ON membership_audit_log (clerk_env, target_user_id, created_at DESC)`,
  `CREATE OR REPLACE FUNCTION membership_audit_log_append_only() RETURNS trigger AS $$
   BEGIN
     RAISE EXCEPTION 'membership_audit_log is append-only';
   END;
   $$ LANGUAGE plpgsql`,
  `CREATE OR REPLACE TRIGGER membership_audit_log_no_change
     BEFORE UPDATE OR DELETE ON membership_audit_log
     FOR EACH ROW EXECUTE FUNCTION membership_audit_log_append_only()`,
  `CREATE OR REPLACE TRIGGER membership_audit_log_no_truncate
     BEFORE TRUNCATE ON membership_audit_log
     FOR EACH STATEMENT EXECUTE FUNCTION membership_audit_log_append_only()`,
  // What an administrator decided for one exact invitation. Single use: only
  // an 'open' decision can be consumed, and an address has at most one.
  `CREATE TABLE IF NOT EXISTS invitation_decisions (
     id                  text        NOT NULL,
     ${ENV},
     email_normalized    text        NOT NULL,
     clerk_invitation_id text,
     account_request_id  integer,
     verify_affiliation  boolean     NOT NULL DEFAULT false,
     role_keys           text[]      NOT NULL DEFAULT '{}',
     status              text        NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'consumed', 'revoked', 'expired', 'superseded', 'review')),
     created_by          text        NOT NULL,
     created_at          timestamptz NOT NULL DEFAULT now(),
     expires_at          timestamptz NOT NULL,
     consumed_by         text,
     consumed_at         timestamptz,
     PRIMARY KEY (clerk_env, id),
     CONSTRAINT invitation_decisions_consumer
       CHECK (status <> 'consumed' OR (consumed_by IS NOT NULL AND consumed_at IS NOT NULL))
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS invitation_decisions_open_email
     ON invitation_decisions (clerk_env, email_normalized) WHERE status = 'open'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS invitation_decisions_invitation
     ON invitation_decisions (clerk_env, clerk_invitation_id) WHERE clerk_invitation_id IS NOT NULL`,
  // Someone already resolved against their invitation, so ordinary requests
  // do not ask Clerk again.
  `CREATE TABLE IF NOT EXISTS invitation_claim_checks (
     ${ENV},
     clerk_user_id text        NOT NULL,
     outcome       text        NOT NULL CHECK (outcome IN ('claimed', 'none', 'review')),
     decision_id   text,
     checked_at    timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_env, clerk_user_id)
   )`,
  // Each activation or rollback: what was reviewed, what it replaced, what it changed.
  `CREATE TABLE IF NOT EXISTS sheet_access_migration_runs (
     id          bigserial PRIMARY KEY,
     ${ENV},
     kind        text        NOT NULL CHECK (kind IN ('activate', 'rollback')),
     report_hash text        NOT NULL,
     snapshot    jsonb       NOT NULL,
     delta       jsonb       NOT NULL DEFAULT '{}',
     actor       text        NOT NULL,
     created_at  timestamptz NOT NULL DEFAULT now()
   )`,
  // One row once an environment has been activated. Permanent: rollback
  // never brings back the universal Member grant.
  `CREATE TABLE IF NOT EXISTS sheet_access_latches (
     ${ENV} PRIMARY KEY,
     run_id bigint,
     set_at timestamptz NOT NULL DEFAULT now()
   )`,
  // A fingerprint of everything that decides who has sheet music here. The
  // impact report records it, and activation refuses if it has since changed.
  `CREATE OR REPLACE FUNCTION sheet_access_state_hash(p_env text) RETURNS text AS $$
     SELECT md5(concat_ws('|',
       (SELECT string_agg(role_key || ':' || permission, ',' ORDER BY role_key, permission)
          FROM role_permissions WHERE clerk_env = p_env),
       (SELECT string_agg(clerk_user_id || ':' || role_key, ',' ORDER BY clerk_user_id, role_key)
          FROM user_roles WHERE clerk_env = p_env),
       (SELECT string_agg(clerk_user_id || ':' || permission || ':' || effect, ',' ORDER BY clerk_user_id, permission)
          FROM user_permission_overrides WHERE clerk_env = p_env),
       (SELECT string_agg(clerk_user_id || ':' || status, ',' ORDER BY clerk_user_id)
          FROM user_church_affiliations WHERE clerk_env = p_env),
       (SELECT value::text FROM site_settings WHERE clerk_env = p_env AND key = 'sheet_access_policy')
     ))
   $$ LANGUAGE sql STABLE`,
  // Activation, all or nothing, for one Clerk environment. A function because
  // the database driver's transactions cannot branch between statements.
  `CREATE OR REPLACE FUNCTION activate_sheet_access(p_env text, p_state_hash text, p_report_hash text, p_actor text)
   RETURNS jsonb AS $$
   DECLARE
     v_snapshot jsonb;
     v_member integer;
     v_leader integer;
     v_run bigint;
   BEGIN
     PERFORM pg_advisory_xact_lock(hashtext('sheet_access_' || p_env));
     IF EXISTS (SELECT 1 FROM sheet_access_latches WHERE clerk_env = p_env) THEN
       RETURN jsonb_build_object('status', 'already');
     END IF;
     IF sheet_access_state_hash(p_env) IS DISTINCT FROM p_state_hash THEN
       RETURN jsonb_build_object('status', 'stale');
     END IF;

     v_snapshot := jsonb_build_object(
       'role_permissions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('role', role_key, 'permission', permission)), '[]'::jsonb)
                              FROM role_permissions WHERE clerk_env = p_env),
       'policy', (SELECT value FROM site_settings WHERE clerk_env = p_env AND key = 'sheet_access_policy'));

     DELETE FROM role_permissions WHERE clerk_env = p_env AND role_key = 'member' AND permission = 'view_sheet_music';
     GET DIAGNOSTICS v_member = ROW_COUNT;
     INSERT INTO role_permissions (clerk_env, role_key, permission)
     SELECT p_env, 'song_leader', 'view_sheet_music'
      WHERE EXISTS (SELECT 1 FROM roles WHERE clerk_env = p_env AND key = 'song_leader')
     ON CONFLICT DO NOTHING;
     GET DIAGNOSTICS v_leader = ROW_COUNT;

     INSERT INTO sheet_access_migration_runs (clerk_env, kind, report_hash, snapshot, delta, actor)
     VALUES (p_env, 'activate', p_report_hash, v_snapshot,
             jsonb_build_object('member_grant_removed', v_member > 0, 'song_leader_grant_added', v_leader > 0), p_actor)
     RETURNING id INTO v_run;
     INSERT INTO sheet_access_latches (clerk_env, run_id) VALUES (p_env, v_run);
     INSERT INTO site_settings (clerk_env, key, value, updated_by)
     VALUES (p_env, 'sheet_access_policy', '{"state": "enforcing"}'::jsonb, p_actor)
     ON CONFLICT (clerk_env, key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();
     INSERT INTO membership_audit_log (clerk_env, target_user_id, action, new_status, actor_user_id)
     VALUES (p_env, 'environment', 'sheet_access_activated', 'enforcing', p_actor);
     RETURN jsonb_build_object('status', 'activated', 'run', v_run);
   END;
   $$ LANGUAGE plpgsql`,
  // Reverses only what activation added. Never gives the Member role sheet
  // music again, and the environment stays enforcing.
  `CREATE OR REPLACE FUNCTION rollback_sheet_access(p_env text, p_actor text) RETURNS jsonb AS $$
   DECLARE
     v_run sheet_access_migration_runs%ROWTYPE;
   BEGIN
     PERFORM pg_advisory_xact_lock(hashtext('sheet_access_' || p_env));
     SELECT * INTO v_run FROM sheet_access_migration_runs
      WHERE clerk_env = p_env AND kind = 'activate' ORDER BY id DESC LIMIT 1;
     IF NOT FOUND THEN
       RETURN jsonb_build_object('status', 'not_activated');
     END IF;
     IF EXISTS (SELECT 1 FROM sheet_access_migration_runs WHERE clerk_env = p_env AND kind = 'rollback') THEN
       RETURN jsonb_build_object('status', 'already');
     END IF;
     IF (v_run.delta ->> 'song_leader_grant_added')::boolean THEN
       DELETE FROM role_permissions WHERE clerk_env = p_env AND role_key = 'song_leader' AND permission = 'view_sheet_music';
     END IF;
     INSERT INTO sheet_access_migration_runs (clerk_env, kind, report_hash, snapshot, delta, actor)
     VALUES (p_env, 'rollback', v_run.report_hash, '{}'::jsonb, v_run.delta, p_actor);
     INSERT INTO membership_audit_log (clerk_env, target_user_id, action, new_status, actor_user_id)
     VALUES (p_env, 'environment', 'sheet_access_rolled_back', 'enforcing', p_actor);
     RETURN jsonb_build_object('status', 'rolled_back');
   END;
   $$ LANGUAGE plpgsql`,
  // After the latch, nothing - including an older deployment saving a stale
  // role form - can give the Member role view_sheet_music. The write is
  // dropped rather than refused, so that older form still saves its other changes.
  `CREATE OR REPLACE FUNCTION role_permissions_block_member_sheet() RETURNS trigger AS $$
   BEGIN
     IF NEW.role_key = 'member' AND NEW.permission = 'view_sheet_music'
        AND EXISTS (SELECT 1 FROM sheet_access_latches WHERE clerk_env = NEW.clerk_env) THEN
       RETURN NULL;
     END IF;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql`,
  `CREATE OR REPLACE TRIGGER role_permissions_member_sheet
     BEFORE INSERT OR UPDATE ON role_permissions
     FOR EACH ROW EXECUTE FUNCTION role_permissions_block_member_sheet()`,
  `CREATE OR REPLACE FUNCTION sheet_access_latches_permanent() RETURNS trigger AS $$
   BEGIN
     RAISE EXCEPTION 'sheet_access_latches rows are permanent';
   END;
   $$ LANGUAGE plpgsql`,
  `CREATE OR REPLACE TRIGGER sheet_access_latches_no_truncate
     BEFORE TRUNCATE ON sheet_access_latches
     FOR EACH STATEMENT EXECUTE FUNCTION sheet_access_latches_permanent()`,
  // Last on purpose: MEMBERSHIP_SCHEMA_READY looks for it.
  `CREATE OR REPLACE TRIGGER sheet_access_latches_no_change
     BEFORE UPDATE OR DELETE ON sheet_access_latches
     FOR EACH ROW EXECUTE FUNCTION sheet_access_latches_permanent()`,
];

/** True once every MEMBERSHIP_SCHEMA statement has run: it names the last object created. */
export const MEMBERSHIP_SCHEMA_READY =
  "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sheet_access_latches_no_change' AND NOT tgisinternal) AS ready";
