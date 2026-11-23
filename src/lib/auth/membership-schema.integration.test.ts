import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AUTH_SCHEMA } from "./schema.mjs";
import { MEMBERSHIP_SCHEMA, MEMBERSHIP_SCHEMA_READY } from "./membership-schema.mjs";

/**
 * The membership tables on a real, isolated, in-memory PostgreSQL (PGlite).
 * It never reads DATABASE_URL and can reach nothing but the engine this file
 * creates. Set MEMBERSHIP_PGLITE to the file URL of PGlite's dist/index.js:
 *   npm test -- src/lib/auth/membership-schema.integration.test.ts
 */

interface Engine {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  close(): Promise<void>;
}

const packageUrl = process.env.MEMBERSHIP_PGLITE;

describe.skipIf(!packageUrl)("membership schema on isolated PostgreSQL", () => {
  let engine: Engine;

  const apply = async (statements: readonly string[]) => {
    for (const statement of statements) await engine.query(statement);
  };
  const ready = async () => (await engine.query(MEMBERSHIP_SCHEMA_READY)).rows[0].ready;
  const addRole = (env: string, key: string) =>
    engine.query(`INSERT INTO roles (clerk_env, key, label) VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`, [env, key]);
  const grant = (env: string, role: string, permission: string) =>
    engine.query(`INSERT INTO role_permissions (clerk_env, role_key, permission) VALUES ($1, $2, $3)`, [env, role, permission]);
  const hasGrant = async (env: string, role: string, permission: string) =>
    (
      await engine.query(`SELECT 1 FROM role_permissions WHERE clerk_env = $1 AND role_key = $2 AND permission = $3`, [
        env,
        role,
        permission,
      ])
    ).rows.length === 1;
  const latch = (env: string) => engine.query(`INSERT INTO sheet_access_latches (clerk_env) VALUES ($1)`, [env]);
  const audit = () =>
    engine.query(
      `INSERT INTO membership_audit_log (clerk_env, target_user_id, action, actor_user_id)
       VALUES ('development', 'user_a', 'affiliation_verified', 'user_admin')`,
    );
  const decision = (env: string, id: string, email: string, status = "open") =>
    engine.query(
      `INSERT INTO invitation_decisions (id, clerk_env, email_normalized, status, created_by, expires_at)
       VALUES ($1, $2, $3, $4, 'user_admin', now() + interval '30 days')`,
      [id, env, email, status],
    );

  beforeEach(async () => {
    const { PGlite } = (await import(/* @vite-ignore */ packageUrl!)) as { PGlite: new () => Engine };
    engine = new PGlite();
    await apply(AUTH_SCHEMA);
  }, 30_000);

  afterEach(async () => {
    await engine.close();
  });

  it("reports not ready until applied, and applies twice without harm", async () => {
    expect(await ready()).toBe(false);
    await apply(MEMBERSHIP_SCHEMA);
    expect(await ready()).toBe(true);
    await apply(MEMBERSHIP_SCHEMA);
    expect(await ready()).toBe(true);
  });

  describe("once applied", () => {
    beforeEach(async () => {
      await apply(MEMBERSHIP_SCHEMA);
    });

    it("keeps one affiliation per person per Clerk environment", async () => {
      const insert = (env: string) =>
        engine.query(
          `INSERT INTO user_church_affiliations (clerk_env, clerk_user_id, status, verified_by, verified_at, updated_by)
           VALUES ($1, 'user_a', 'verified', 'user_admin', now(), 'user_admin')`,
          [env],
        );
      await insert("development");
      await insert("production");
      await expect(insert("development")).rejects.toThrow();
    });

    it("rejects an affiliation status other than verified or revoked", async () => {
      await expect(
        engine.query(
          `INSERT INTO user_church_affiliations (clerk_env, clerk_user_id, status, updated_by)
           VALUES ('development', 'user_a', 'pending', 'user_admin')`,
        ),
      ).rejects.toThrow();
    });

    it("refuses a verified affiliation with no verifier", async () => {
      await expect(
        engine.query(
          `INSERT INTO user_church_affiliations (clerk_env, clerk_user_id, status, updated_by)
           VALUES ('development', 'user_a', 'verified', 'user_admin')`,
        ),
      ).rejects.toThrow();
    });

    it("refuses to update an audit row", async () => {
      await audit();
      await expect(engine.query(`UPDATE membership_audit_log SET reason = 'changed'`)).rejects.toThrow(/append-only/);
    });

    it("refuses to delete an audit row", async () => {
      await audit();
      await expect(engine.query(`DELETE FROM membership_audit_log`)).rejects.toThrow(/append-only/);
    });

    it("refuses to truncate the audit log", async () => {
      await audit();
      await expect(engine.query(`TRUNCATE membership_audit_log`)).rejects.toThrow(/append-only/);
    });

    it("allows one open invitation decision per address per environment", async () => {
      await decision("development", "dec_1", "a@example.com");
      await decision("production", "dec_2", "a@example.com");
      await expect(decision("development", "dec_3", "a@example.com")).rejects.toThrow();
    });

    it("allows a new decision once the earlier one is superseded", async () => {
      await decision("development", "dec_1", "a@example.com");
      await engine.query(`UPDATE invitation_decisions SET status = 'superseded' WHERE id = 'dec_1'`);
      await decision("development", "dec_2", "a@example.com");
    });

    it("rejects an unknown invitation decision status", async () => {
      await expect(decision("development", "dec_1", "a@example.com", "maybe")).rejects.toThrow();
    });

    it("still allows the Member sheet grant before the environment is latched", async () => {
      await addRole("development", "member");
      await grant("development", "member", "view_sheet_music");
      expect(await hasGrant("development", "member", "view_sheet_music")).toBe(true);
    });

    it("silently drops the Member sheet grant once the environment is latched", async () => {
      await addRole("development", "member");
      await latch("development");
      await grant("development", "member", "view_sheet_music");
      expect(await hasGrant("development", "member", "view_sheet_music")).toBe(false);
    });

    it("does not let an update turn another row into the Member sheet grant after the latch", async () => {
      await addRole("development", "member");
      await grant("development", "member", "view_member_resources");
      await latch("development");
      await engine.query(`UPDATE role_permissions SET permission = 'view_sheet_music' WHERE role_key = 'member'`);
      expect(await hasGrant("development", "member", "view_sheet_music")).toBe(false);
      expect(await hasGrant("development", "member", "view_member_resources")).toBe(true);
    });

    it("latches one Clerk environment without touching the other", async () => {
      await addRole("development", "member");
      await addRole("production", "member");
      await latch("development");
      await grant("production", "member", "view_sheet_music");
      expect(await hasGrant("production", "member", "view_sheet_music")).toBe(true);
    });

    it("leaves other roles' sheet grants alone after the latch", async () => {
      await addRole("development", "musician");
      await latch("development");
      await grant("development", "musician", "view_sheet_music");
      expect(await hasGrant("development", "musician", "view_sheet_music")).toBe(true);
    });

    it("leaves the Member role's other permissions alone after the latch", async () => {
      await addRole("development", "member");
      await latch("development");
      await grant("development", "member", "view_member_resources");
      expect(await hasGrant("development", "member", "view_member_resources")).toBe(true);
    });

    it("refuses to remove a latch", async () => {
      await latch("development");
      await expect(engine.query(`DELETE FROM sheet_access_latches`)).rejects.toThrow(/permanent/);
    });

    describe("activation", () => {
      const stateHash = async (env = "development") =>
        (await engine.query(`SELECT sheet_access_state_hash($1) AS hash`, [env])).rows[0].hash as string;
      const activate = async (env = "development", hash?: string) =>
        (
          await engine.query(`SELECT activate_sheet_access($1, $2, 'report-1', 'user_admin') AS result`, [env, hash ?? (await stateHash(env))])
        ).rows[0].result as { status: string };
      const rollback = async (env = "development") =>
        (await engine.query(`SELECT rollback_sheet_access($1, 'user_admin') AS result`, [env])).rows[0].result as { status: string };
      const mode = async (env = "development") =>
        (await engine.query(`SELECT value FROM site_settings WHERE clerk_env = $1 AND key = 'sheet_access_policy'`, [env])).rows[0]?.value;
      const latched = async (env = "development") =>
        (await engine.query(`SELECT 1 FROM sheet_access_latches WHERE clerk_env = $1`, [env])).rows.length === 1;

      beforeEach(async () => {
        for (const env of ["development", "production"]) {
          await addRole(env, "member");
          await addRole(env, "song_leader");
          await addRole(env, "musician");
          await grant(env, "member", "view_sheet_music");
          await grant(env, "member", "view_member_resources");
          await grant(env, "musician", "view_sheet_music");
        }
      });

      it("removes the Member grant, gives Song Leaders theirs, and enforces", async () => {
        expect((await activate()).status).toBe("activated");
        expect(await hasGrant("development", "member", "view_sheet_music")).toBe(false);
        expect(await hasGrant("development", "member", "view_member_resources")).toBe(true);
        expect(await hasGrant("development", "song_leader", "view_sheet_music")).toBe(true);
        expect(await hasGrant("development", "musician", "view_sheet_music")).toBe(true);
        expect(await mode()).toEqual({ state: "enforcing" });
        expect(await latched()).toBe(true);
      });

      it("keeps a snapshot and an audit record", async () => {
        await activate();
        const [run] = (await engine.query(`SELECT * FROM sheet_access_migration_runs`)).rows as Array<{ kind: string; report_hash: string; snapshot: { role_permissions: unknown[] } }>;
        expect(run.kind).toBe("activate");
        expect(run.report_hash).toBe("report-1");
        expect(run.snapshot.role_permissions).toContainEqual({ role: "member", permission: "view_sheet_music" });
        const audit = (await engine.query(`SELECT action, actor_user_id FROM membership_audit_log`)).rows;
        expect(audit).toContainEqual({ action: "sheet_access_activated", actor_user_id: "user_admin" });
      });

      it("leaves the other Clerk environment untouched", async () => {
        await activate("development");
        expect(await hasGrant("production", "member", "view_sheet_music")).toBe(true);
        expect(await hasGrant("production", "song_leader", "view_sheet_music")).toBe(false);
        expect(await mode("production")).toBeUndefined();
        expect(await latched("production")).toBe(false);
      });

      it("changes nothing when roles changed after the report", async () => {
        const reviewed = await stateHash();
        await grant("development", "song_leader", "view_availability");
        expect((await activate("development", reviewed)).status).toBe("stale");
        expect(await hasGrant("development", "member", "view_sheet_music")).toBe(true);
        expect(await latched()).toBe(false);
      });

      it("notices a changed affiliation", async () => {
        const reviewed = await stateHash();
        await engine.query(
          `INSERT INTO user_church_affiliations (clerk_env, clerk_user_id, status, verified_by, verified_at, updated_by)
           VALUES ('development', 'user_a', 'verified', 'user_admin', now(), 'user_admin')`,
        );
        expect(await stateHash()).not.toBe(reviewed);
      });

      it("is a no-op when run again", async () => {
        await activate();
        expect((await activate()).status).toBe("already");
        expect((await engine.query(`SELECT 1 FROM sheet_access_migration_runs`)).rows).toHaveLength(1);
      });

      it("leaves everything as it was if a step fails", async () => {
        await engine.query(`CREATE FUNCTION fail_it() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'interrupted'; END; $$ LANGUAGE plpgsql`);
        await engine.query(`CREATE TRIGGER fail_settings BEFORE INSERT ON site_settings FOR EACH ROW EXECUTE FUNCTION fail_it()`);
        await expect(activate()).rejects.toThrow(/interrupted/);
        expect(await hasGrant("development", "member", "view_sheet_music")).toBe(true);
        expect(await hasGrant("development", "song_leader", "view_sheet_music")).toBe(false);
        expect(await latched()).toBe(false);
        expect((await engine.query(`SELECT 1 FROM sheet_access_migration_runs`)).rows).toHaveLength(0);
        await engine.query(`DROP TRIGGER fail_settings ON site_settings`);
        expect((await activate()).status).toBe("activated");
      });

      it("keeps an old deployment's stale role form from restoring the grant", async () => {
        await activate();
        await engine.query(`DELETE FROM role_permissions WHERE clerk_env = 'development' AND role_key = 'member'`);
        await engine.query(
          `INSERT INTO role_permissions (clerk_env, role_key, permission)
           SELECT 'development', 'member', unnest(ARRAY['view_sheet_music', 'view_member_resources'])`,
        );
        expect(await hasGrant("development", "member", "view_sheet_music")).toBe(false);
        expect(await hasGrant("development", "member", "view_member_resources")).toBe(true);
      });

      it("skips the Song Leader grant when that role was deleted", async () => {
        await engine.query(`DELETE FROM roles WHERE clerk_env = 'development' AND key = 'song_leader'`);
        expect((await activate()).status).toBe("activated");
      });

      describe("rollback", () => {
        it("refuses before activation", async () => {
          expect((await rollback()).status).toBe("not_activated");
        });

        it("reverses the Song Leader grant it added", async () => {
          await activate();
          expect((await rollback()).status).toBe("rolled_back");
          expect(await hasGrant("development", "song_leader", "view_sheet_music")).toBe(false);
        });

        it("keeps a Song Leader grant that existed before activation", async () => {
          await grant("development", "song_leader", "view_sheet_music");
          await activate();
          await rollback();
          expect(await hasGrant("development", "song_leader", "view_sheet_music")).toBe(true);
        });

        it("never restores universal Member access, and stays enforcing", async () => {
          await activate();
          await rollback();
          expect(await hasGrant("development", "member", "view_sheet_music")).toBe(false);
          expect(await latched()).toBe(true);
          expect(await mode()).toEqual({ state: "enforcing" });
        });

        it("runs only once", async () => {
          await activate();
          await rollback();
          await grant("development", "song_leader", "view_sheet_music");
          expect((await rollback()).status).toBe("already");
          expect(await hasGrant("development", "song_leader", "view_sheet_music")).toBe(true);
        });

        it("does not touch the other environment", async () => {
          await activate("development");
          await activate("production");
          await rollback("development");
          expect(await hasGrant("production", "song_leader", "view_sheet_music")).toBe(true);
        });
      });
    });
  });
});
