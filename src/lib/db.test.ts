import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { applySchema, SCHEMA_LOCK } = await import("./db");

/** A Neon-shaped query function that records what it was asked, and answers the readiness check. */
function fakeSql(ready: boolean | null) {
  const asked: string[] = [];
  const transactions: string[][] = [];
  const sql = {
    query: (text: string) => {
      asked.push(text);
      return text.startsWith("SELECT ready") ? Promise.resolve(ready === null ? [] : [{ ready }]) : ({ text } as unknown);
    },
    transaction: async (list: Array<{ text: string }>) => {
      transactions.push(list.map((item) => item.text));
      return [];
    },
  };
  return { sql: sql as unknown as Parameters<typeof applySchema>[0], asked, transactions };
}

describe("applying a store's schema", () => {
  it("runs nothing when everything is already there - no locks taken at all", async () => {
    const { sql, transactions } = fakeSql(true);
    await applySchema(sql, ["ALTER TABLE t ADD COLUMN IF NOT EXISTS c text"], "SELECT ready");
    expect(transactions).toEqual([]);
  });

  it("runs every statement in one transaction, under the site's one schema lock, when anything is missing", async () => {
    for (const ready of [false, null]) {
      const { sql, transactions } = fakeSql(ready);
      await applySchema(sql, ["CREATE TABLE IF NOT EXISTS a ()", "CREATE TABLE IF NOT EXISTS b ()"], "SELECT ready");
      expect(transactions).toEqual([[`SELECT pg_advisory_xact_lock(${SCHEMA_LOCK})`, "CREATE TABLE IF NOT EXISTS a ()", "CREATE TABLE IF NOT EXISTS b ()"]]);
    }
  });

  it("still applies, under the lock, for a store that gives no readiness check", async () => {
    const { sql, asked, transactions } = fakeSql(true);
    await applySchema(sql, ["CREATE TABLE IF NOT EXISTS a ()"]);
    expect(asked.some((text) => text === "SELECT ready")).toBe(false);
    expect(transactions[0][0]).toContain("pg_advisory_xact_lock");
  });
});
