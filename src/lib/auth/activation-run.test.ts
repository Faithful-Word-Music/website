import { describe, expect, it } from "vitest";

import { runActivation, SNAPSHOT_PAGE, type ActivationDeps } from "./activation-run";
import { DEFAULT_ROLES } from "./permissions";
import type { RequirementPolicy } from "./profile-requirements";

const DAY = 24 * 60 * 60 * 1000;
const ACTIVATED = "2026-11-02T17:00:00.000Z";
const T = Date.parse(ACTIVATED);

/** An in-memory environment with the same ON CONFLICT DO NOTHING behaviour as the tables. */
function world(accountCount: number, options: { newAccounts?: number } = {}) {
  let policy: RequirementPolicy | null = null;
  const deadlines = new Map<string, string>(); // user|key -> due
  const baselines = new Set<string>();
  const accounts = [
    ...Array.from({ length: accountCount }, (_, i) => ({ id: `user_old${i}`, createdAt: T - (accountCount - i) * DAY })),
    ...Array.from({ length: options.newAccounts ?? 0 }, (_, i) => ({ id: `user_new${i}`, createdAt: T + (i + 1) * 60_000 })),
  ];
  const userRoles = new Map<string, string[]>(accounts.map((a, i) => [a.id, i % 3 === 0 ? ["musician"] : i % 3 === 1 ? ["song_leader"] : []]));
  const failures = { listAt: -1, writeAt: -1, lostBaseline: false };
  let creates = 0;
  let writes = 0;

  const deps: ActivationDeps = {
    async createPolicyOnce() {
      creates += 1;
      policy ??= {
        version: 1,
        activatedAt: ACTIVATED,
        activatedBy: "user_admin",
        snapshot: "pending",
        snapshotCompletedAt: null,
        snapshotAccounts: null,
        pausedAt: null,
      };
      return policy;
    },
    async loadAuthorization() {
      return {
        userRoles,
        rolePermissions: new Map(DEFAULT_ROLES.map((role) => [role.key, role.permissions as string[]])),
        overrides: new Map(),
      };
    },
    async listAccounts(offset, limit) {
      if (offset === failures.listAt) return null;
      return { accounts: accounts.slice(offset, offset + limit), total: accounts.length };
    },
    async writePage(entries) {
      writes += 1;
      if (writes === failures.writeAt) throw new Error("connection lost");
      for (const entry of entries) {
        for (const item of entry.deadlines) {
          const key = `${entry.userId}|${item.key}`;
          if (!deadlines.has(key)) deadlines.set(key, item.dueAt);
        }
        if (!(failures.lostBaseline && entry.userId === "user_old0")) baselines.add(entry.userId);
      }
    },
    async countBaselines(ids) {
      return ids.filter((id) => baselines.has(id)).length;
    },
    async markComplete(count, at) {
      if (!policy) return null;
      policy = { ...policy, snapshot: "complete", snapshotCompletedAt: at, snapshotAccounts: count };
      return policy;
    },
    now: () => T + DAY,
  };
  return {
    deps,
    deadlines,
    baselines,
    failures,
    get policy() {
      return policy;
    },
    get creates() {
      return creates;
    },
  };
}

describe("activation", () => {
  it("snapshots every existing account across pages and only then completes", async () => {
    const w = world(SNAPSHOT_PAGE * 2 + 37);
    const result = await runActivation(w.deps);
    expect(result).toMatchObject({ ok: true, accounts: SNAPSHOT_PAGE * 2 + 37, alreadyComplete: false });
    expect(w.baselines.size).toBe(SNAPSHOT_PAGE * 2 + 37);
    expect(w.policy?.snapshot).toBe("complete");
    // Every deadline is seven days from activation, not from now.
    expect(new Set(w.deadlines.values())).toEqual(new Set([new Date(T + 7 * DAY).toISOString()]));
  });

  it("leaves accounts created after activation to be seen as new members", async () => {
    const w = world(5, { newAccounts: 3 });
    const result = await runActivation(w.deps);
    expect(result).toMatchObject({ ok: true, accounts: 5 });
    expect([...w.baselines].some((id) => id.startsWith("user_new"))).toBe(false);
  });

  it("stays pending (blocking nobody) when Clerk fails partway, and a retry finishes without moving anything", async () => {
    const w = world(SNAPSHOT_PAGE + 10);
    w.failures.listAt = SNAPSHOT_PAGE;
    expect(await runActivation(w.deps)).toMatchObject({ ok: false, problem: "accounts-unavailable" });
    expect(w.policy?.snapshot).toBe("pending");
    const before = new Map(w.deadlines);

    w.failures.listAt = -1;
    expect(await runActivation(w.deps)).toMatchObject({ ok: true, accounts: SNAPSHOT_PAGE + 10 });
    for (const [key, due] of before) expect(w.deadlines.get(key)).toBe(due);
    expect(w.policy?.activatedAt).toBe(ACTIVATED);
  });

  it("stays pending when a database write fails, and recovers on retry", async () => {
    const w = world(SNAPSHOT_PAGE + 1);
    w.failures.writeAt = 2;
    expect(await runActivation(w.deps)).toMatchObject({ ok: false, problem: "failed" });
    expect(w.policy?.snapshot).toBe("pending");
    expect(await runActivation(w.deps)).toMatchObject({ ok: true });
  });

  it("refuses to complete when the check finds an account without its baseline", async () => {
    const w = world(4);
    w.failures.lostBaseline = true;
    expect(await runActivation(w.deps)).toMatchObject({ ok: false, problem: "incomplete" });
    expect(w.policy?.snapshot).toBe("pending");
  });

  it("is idempotent: pressed again (or twice at once) it keeps the first activation", async () => {
    const w = world(3);
    const [first, second] = await Promise.all([runActivation(w.deps), runActivation(w.deps)]);
    expect(first.ok && second.ok).toBe(true);
    expect(w.policy?.activatedAt).toBe(ACTIVATED);
    expect(await runActivation(w.deps)).toMatchObject({ ok: true, alreadyComplete: true });
  });

  it("gives song leaders their leading questions and musicians their instrument ones", async () => {
    const w = world(3);
    await runActivation(w.deps);
    expect(w.deadlines.has("user_old0|instruments")).toBe(true);
    expect(w.deadlines.has("user_old1|leading_experience")).toBe(true);
    expect(w.deadlines.has("user_old1|instruments")).toBe(false);
    expect(w.deadlines.has("user_old2|name")).toBe(true);
    expect(w.deadlines.has("user_old2|reads_sheet_music")).toBe(false);
  });
});
