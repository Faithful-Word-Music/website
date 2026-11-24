import { describe, expect, it, vi } from "vitest";

import { eraseAccount, recoverPendingErasures, type ClerkDeletion, type ErasureDeps } from "./erasure";

function deps(clerk: ClerkDeletion | Error, overrides: Partial<ErasureDeps> = {}) {
  const calls: string[] = [];
  const step = (name: string) => async () => {
    calls.push(name);
  };
  const value: ErasureDeps = {
    newAttempt: () => "attempt",
    begin: async () => {
      calls.push("begin");
      return true;
    },
    deleteClerkAccount: async () => {
      calls.push("clerk");
      if (clerk instanceof Error) throw clerk;
      return clerk;
    },
    release: step("release"),
    purgeLibrary: step("purge"),
    deleteUserData: step("user"),
    deleteNotificationData: step("notifications"),
    complete: step("complete"),
    ...overrides,
  };
  return { value, calls };
}

describe("eraseAccount", () => {
  it("marks first, and completes only after every cleanup step", async () => {
    const { value, calls } = deps("deleted");
    expect(await eraseAccount(value, true)).toBe("erased");
    expect(calls).toEqual(["begin", "clerk", "purge", "user", "notifications", "complete"]);
  });

  it("does not ask Clerk when the marker cannot be written", async () => {
    const { value, calls } = deps("deleted", { begin: async () => Promise.reject(new Error("db down")) });
    await expect(eraseAccount(value, true)).rejects.toThrow("db down");
    expect(calls).toEqual([]);
  });

  it("releases only its own attempt after a definitive refusal, and removes no data", async () => {
    const { value, calls } = deps("refused");
    expect(await eraseAccount(value, true)).toBe("refused");
    expect(calls).toEqual(["begin", "clerk", "release"]);
  });

  it.each([["an uncertain answer", "uncertain" as const], ["a thrown error", new Error("socket closed")]])(
    "keeps the marker and purges nothing after %s",
    async (_name, clerk) => {
      const { value, calls } = deps(clerk);
      expect(await eraseAccount(value, true)).toBe("uncertain");
      expect(calls).toEqual(["begin", "clerk"]);
    },
  );

  it.each(["purgeLibrary", "deleteUserData", "deleteNotificationData", "complete"] as const)(
    "stays pending when %s fails after Clerk deleted the account",
    async (failing) => {
      const { value, calls } = deps("deleted", { [failing]: async () => Promise.reject(new Error("failed")) });
      expect(await eraseAccount(value, true)).toBe("cleanup-pending");
      expect(calls).not.toContain("complete");
      expect(calls).not.toContain("release");
    },
  );

  it("skips Clerk for an account already gone, and still cleans up", async () => {
    const { value, calls } = deps("deleted");
    expect(await eraseAccount(value, false)).toBe("erased");
    expect(calls).toEqual(["begin", "purge", "user", "notifications", "complete"]);
  });

  it("still runs the existing cleanup when the tables are not installed", async () => {
    const { value, calls } = deps("deleted", {
      begin: async () => {
        calls.push("begin");
        return false;
      },
    });
    expect(await eraseAccount(value, true)).toBe("erased");
    expect(calls).toEqual(["begin", "clerk", "user", "notifications"]);
  });
});

describe("recoverPendingErasures", () => {
  function recovery(answers: Record<string, boolean | null>, failing: string[] = []) {
    const finished: string[] = [];
    return {
      finished,
      value: {
        listPending: async (limit: number) => Object.keys(answers).slice(0, limit),
        accountGone: async (id: string) => answers[id],
        noteTried: vi.fn(async () => undefined),
        cleanupFor: (id: string) => ({
          purgeLibrary: async () => undefined,
          deleteUserData: async () => {
            if (failing.includes(id)) throw new Error("failed");
          },
          deleteNotificationData: async () => undefined,
          complete: async () => {
            finished.push(id);
          },
        }),
      },
    };
  }

  it("completes only accounts Clerk confirms are gone", async () => {
    const { value, finished } = recovery({ gone: true, live: false, unknown: null });
    expect(await recoverPendingErasures(value, 25)).toEqual({ checked: 3, completed: 1, waiting: 1, failed: 1 });
    expect(finished).toEqual(["gone"]);
  });

  it("leaves a failed cleanup pending and carries on to the next account", async () => {
    const { value, finished } = recovery({ broken: true, fine: true }, ["broken"]);
    expect(await recoverPendingErasures(value, 25)).toMatchObject({ completed: 1, failed: 1 });
    expect(finished).toEqual(["fine"]);
  });

  it("is bounded", async () => {
    const { value } = recovery({ a: true, b: true, c: true });
    expect((await recoverPendingErasures(value, 2)).checked).toBe(2);
  });
});
