import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AUTH_SCHEMA } from "./schema.mjs";
import { MEMBERSHIP_SCHEMA } from "./membership-schema.mjs";
import {
  affiliationsForUsers,
  bindDecisionInvitation,
  changeAffiliation,
  consumeDecision,
  createInvitationDecision,
  decisionForClaim,
  getAffiliation,
  retireDecision,
  retireDecisionForInvitation,
  type MembershipSql,
} from "./membership-store";

/**
 * The membership store on a real, isolated, in-memory PostgreSQL (PGlite).
 * Never reads DATABASE_URL. Set MEMBERSHIP_PGLITE to the file URL of PGlite's
 * dist/index.js to run it.
 */

interface Engine {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  transaction<T>(work: (tx: Engine) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const packageUrl = process.env.MEMBERSHIP_PGLITE;
const ENV = "development" as const;
const LATER = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function adapter(engine: Engine): MembershipSql {
  return {
    query: async (text, params) => (await engine.query(text, params)).rows,
    transaction: (statements) =>
      engine.transaction(async (tx) => {
        const out: Array<Array<Record<string, unknown>>> = [];
        for (const { text, params } of statements) out.push((await tx.query(text, params)).rows);
        return out;
      }),
  };
}

describe.skipIf(!packageUrl)("membership store on isolated PostgreSQL", () => {
  let engine: Engine;
  let sql: MembershipSql;

  const auditRows = async () => (await engine.query(`SELECT * FROM membership_audit_log ORDER BY id`)).rows;
  const decisionStatus = async (id: string) =>
    (await engine.query(`SELECT status FROM invitation_decisions WHERE id = $1`, [id])).rows[0]?.status;

  beforeEach(async () => {
    const { PGlite } = (await import(/* @vite-ignore */ packageUrl!)) as { PGlite: new () => Engine };
    engine = new PGlite();
    for (const statement of [...AUTH_SCHEMA, ...MEMBERSHIP_SCHEMA]) await engine.query(statement);
    sql = adapter(engine);
  }, 30_000);

  afterEach(async () => {
    await engine.close();
  });

  describe("affiliation", () => {
    const verify = (userId = "user_a", env: "development" | "production" = ENV) =>
      changeAffiliation(sql, { env, userId, expected: null, next: "verified", actor: "user_admin", reason: "Known member" });

    it("treats an account with no record as unverified", async () => {
      expect(await getAffiliation(sql, ENV, "user_a")).toBeNull();
    });

    it("records who verified an account", async () => {
      expect(await verify()).toEqual({ ok: true, status: "verified" });
      expect(await getAffiliation(sql, ENV, "user_a")).toMatchObject({ status: "verified", verifiedBy: "user_admin", updatedBy: "user_admin" });
    });

    it("writes one audit row with the prior and new status", async () => {
      await verify();
      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        clerk_env: ENV,
        target_user_id: "user_a",
        action: "affiliation_verified",
        prior_status: null,
        new_status: "verified",
        actor_user_id: "user_admin",
        reason: "Known member",
      });
    });

    it("keeps the original verifier when revoked", async () => {
      await verify();
      const result = await changeAffiliation(sql, { env: ENV, userId: "user_a", expected: "verified", next: "revoked", actor: "user_other", reason: "" });
      expect(result).toEqual({ ok: true, status: "revoked" });
      expect(await getAffiliation(sql, ENV, "user_a")).toMatchObject({ status: "revoked", verifiedBy: "user_admin", updatedBy: "user_other" });
    });

    it("refuses a change based on a stale status, writing nothing", async () => {
      await verify();
      const result = await changeAffiliation(sql, { env: ENV, userId: "user_a", expected: null, next: "revoked", actor: "user_other", reason: "" });
      expect(result).toEqual({ ok: false, problem: "conflict", current: "verified" });
      expect((await getAffiliation(sql, ENV, "user_a"))?.status).toBe("verified");
      expect(await auditRows()).toHaveLength(1);
    });

    it("refuses a change to the status it already has", async () => {
      await verify();
      const result = await changeAffiliation(sql, { env: ENV, userId: "user_a", expected: "verified", next: "verified", actor: "user_admin", reason: "" });
      expect(result).toEqual({ ok: false, problem: "unchanged", current: "verified" });
      expect(await auditRows()).toHaveLength(1);
    });

    it("lets only one of two simultaneous verifications win", async () => {
      const results = await Promise.all([verify(), verify()]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(await auditRows()).toHaveLength(1);
    });

    it("never reads one Clerk environment's record from the other", async () => {
      await verify("user_a", "production");
      expect(await getAffiliation(sql, ENV, "user_a")).toBeNull();
    });

    it("loads many accounts in one query, leaving out the unverified", async () => {
      await verify("user_a");
      await verify("user_b");
      await verify("user_c", "production");
      const map = await affiliationsForUsers(sql, ENV, ["user_a", "user_b", "user_c", "user_d"]);
      expect([...map.keys()].sort()).toEqual(["user_a", "user_b"]);
      expect(map.get("user_a")?.status).toBe("verified");
    });

    it("answers an empty list without a query", async () => {
      const unused = { query: () => Promise.reject(new Error("queried")), transaction: () => Promise.reject(new Error("queried")) };
      expect((await affiliationsForUsers(unused, ENV, [])).size).toBe(0);
    });
  });

  describe("invitation decisions", () => {
    const create = (id: string, email = "a@example.com", env: "development" | "production" = ENV) =>
      createInvitationDecision(sql, {
        id,
        env,
        email,
        verifyAffiliation: true,
        roleKeys: ["musician"],
        accountRequestId: 12,
        actor: "user_admin",
        expiresAt: LATER,
      });

    it("stores an open decision and audits it", async () => {
      await create("dec_1");
      expect(await decisionStatus("dec_1")).toBe("open");
      expect((await auditRows())[0]).toMatchObject({ action: "decision_created", decision_id: "dec_1", account_request_id: 12, target_user_id: null });
    });

    it("supersedes the earlier open decision for the same address", async () => {
      await create("dec_1");
      await create("dec_2");
      expect(await decisionStatus("dec_1")).toBe("superseded");
      expect(await decisionStatus("dec_2")).toBe("open");
      expect((await auditRows()).map((row) => row.action)).toEqual(["decision_created", "decision_superseded", "decision_created"]);
    });

    it("does not supersede a decision in the other Clerk environment", async () => {
      await create("dec_1", "a@example.com", "production");
      await create("dec_2", "a@example.com", ENV);
      expect(await decisionStatus("dec_1")).toBe("open");
    });

    it("binds an invitation once", async () => {
      await create("dec_1");
      expect(await bindDecisionInvitation(sql, ENV, "dec_1", "inv_1")).toBe(true);
      expect(await bindDecisionInvitation(sql, ENV, "dec_1", "inv_2")).toBe(false);
      const [row] = (await engine.query(`SELECT clerk_invitation_id FROM invitation_decisions WHERE id = 'dec_1'`)).rows;
      expect(row.clerk_invitation_id).toBe("inv_1");
    });

    it("will not bind a decision that is no longer open", async () => {
      await create("dec_1");
      await create("dec_2");
      expect(await bindDecisionInvitation(sql, ENV, "dec_1", "inv_1")).toBe(false);
    });

    it("retires an open decision with an audit row", async () => {
      await create("dec_1");
      expect(await retireDecision(sql, { env: ENV, id: "dec_1", status: "revoked", actor: "user_admin", reason: "" })).toBe(true);
      expect(await decisionStatus("dec_1")).toBe("revoked");
      expect((await auditRows()).at(-1)).toMatchObject({ action: "decision_revoked", prior_status: "open", new_status: "revoked" });
    });

    describe("consuming", () => {
      const roleNames = async (userId: string) =>
        (await engine.query(`SELECT role_key FROM user_roles WHERE clerk_user_id = $1`, [userId])).rows.map((row) => row.role_key);

      beforeEach(async () => {
        await engine.query(`INSERT INTO roles (clerk_env, key, label) VALUES ('development', 'musician', 'Musician')`);
        await create("dec_1");
        await bindDecisionInvitation(sql, ENV, "dec_1", "inv_1");
      });

      it("applies roles, affiliation, audit and claim record together", async () => {
        expect(await consumeDecision(sql, { env: ENV, id: "dec_1", invitationId: "inv_1", userId: "user_new" })).toBe(true);
        expect(await decisionStatus("dec_1")).toBe("consumed");
        expect(await roleNames("user_new")).toEqual(["musician"]);
        expect(await getAffiliation(sql, ENV, "user_new")).toMatchObject({ status: "verified", verifiedBy: "user_admin" });
        expect((await auditRows()).map((row) => row.action)).toEqual(expect.arrayContaining(["decision_consumed", "affiliation_verified"]));
        const [check] = (await engine.query(`SELECT outcome FROM invitation_claim_checks WHERE clerk_user_id = 'user_new'`)).rows;
        expect(check.outcome).toBe("claimed");
      });

      it("can only be consumed once", async () => {
        await consumeDecision(sql, { env: ENV, id: "dec_1", invitationId: "inv_1", userId: "user_new" });
        expect(await consumeDecision(sql, { env: ENV, id: "dec_1", invitationId: "inv_1", userId: "user_other" })).toBe(false);
        expect(await roleNames("user_other")).toEqual([]);
      });

      it("refuses a different invitation", async () => {
        expect(await consumeDecision(sql, { env: ENV, id: "dec_1", invitationId: "inv_2", userId: "user_new" })).toBe(false);
        expect(await roleNames("user_new")).toEqual([]);
      });

      it("refuses an expired decision", async () => {
        await engine.query(`UPDATE invitation_decisions SET expires_at = now() - interval '1 minute' WHERE id = 'dec_1'`);
        expect(await consumeDecision(sql, { env: ENV, id: "dec_1", invitationId: "inv_1", userId: "user_new" })).toBe(false);
        expect(await getAffiliation(sql, ENV, "user_new")).toBeNull();
      });

      it("refuses a revoked decision", async () => {
        await retireDecision(sql, { env: ENV, id: "dec_1", status: "revoked", actor: "user_admin", reason: "" });
        expect(await consumeDecision(sql, { env: ENV, id: "dec_1", invitationId: "inv_1", userId: "user_new" })).toBe(false);
      });

      it("refuses the same decision in the other Clerk environment", async () => {
        expect(await consumeDecision(sql, { env: "production", id: "dec_1", invitationId: "inv_1", userId: "user_new" })).toBe(false);
      });

      it("never overwrites a revoked affiliation", async () => {
        await changeAffiliation(sql, { env: ENV, userId: "user_new", expected: null, next: "verified", actor: "user_admin", reason: "" });
        await changeAffiliation(sql, { env: ENV, userId: "user_new", expected: "verified", next: "revoked", actor: "user_admin", reason: "" });
        await consumeDecision(sql, { env: ENV, id: "dec_1", invitationId: "inv_1", userId: "user_new" });
        expect((await getAffiliation(sql, ENV, "user_new"))?.status).toBe("revoked");
      });

      it("skips a role deleted since the invitation", async () => {
        await engine.query(`DELETE FROM roles WHERE key = 'musician'`);
        expect(await consumeDecision(sql, { env: ENV, id: "dec_1", invitationId: "inv_1", userId: "user_new" })).toBe(true);
        expect(await roleNames("user_new")).toEqual([]);
      });

      it("finds the decision for an invitation", async () => {
        expect(await decisionForClaim(sql, ENV, "dec_1")).toMatchObject({ id: "dec_1", email: "a@example.com", status: "open", invitationId: "inv_1" });
        expect(await decisionForClaim(sql, "production", "dec_1")).toBeNull();
      });

      it("retires by Clerk invitation ID", async () => {
        expect(await retireDecisionForInvitation(sql, { env: ENV, invitationId: "inv_1", status: "revoked", actor: "user_admin", reason: "" })).toBe(true);
        expect(await decisionStatus("dec_1")).toBe("revoked");
      });
    });

    it("will not retire a decision twice", async () => {
      await create("dec_1");
      await retireDecision(sql, { env: ENV, id: "dec_1", status: "revoked", actor: "user_admin", reason: "" });
      expect(await retireDecision(sql, { env: ENV, id: "dec_1", status: "expired", actor: "user_admin", reason: "" })).toBe(false);
      expect(await decisionStatus("dec_1")).toBe("revoked");
    });
  });
});
