import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({ lists: [] as Array<{ userId?: string[] }>, users: [] as Array<{ id: string }>, total: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  // One "request": the first call's promise is reused, like React's cache.
  cache: <T,>(fn: () => T) => {
    let value: T | undefined;
    return () => (value ??= fn());
  },
}));
vi.mock("@clerk/nextjs/errors", () => ({ isClerkAPIResponseError: () => false }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: {
      getUserList: async (params: { userId?: string[] }) => {
        clerk.lists.push(params);
        const data = (params.userId ? clerk.users.filter((user) => params.userId!.includes(user.id)) : clerk.users).map((user) => ({
          id: user.id,
          firstName: user.id,
          lastName: null,
          emailAddresses: [],
          primaryEmailAddress: null,
        }));
        return { data, totalCount: params.userId ? data.length : clerk.total };
      },
    },
  }),
}));

beforeEach(() => {
  vi.resetModules();
  clerk.lists = [];
});

describe("accountsByIds", () => {
  it("names people for several features from one Clerk read", async () => {
    clerk.users = [{ id: "user_a" }, { id: "user_b" }, { id: "user_c" }];
    clerk.total = 3;
    const { accountsByIds } = await import("./clerk");
    const first = await accountsByIds(["user_a", "user_c"]);
    const second = await accountsByIds(["user_b"]);
    expect(first.ok && first.value.accounts.map((account) => account.id)).toEqual(["user_a", "user_c"]);
    expect(second.ok && second.value.accounts.map((account) => account.id)).toEqual(["user_b"]);
    expect(clerk.lists).toHaveLength(1);
  });

  it("asks for exactly the IDs when the directory could not hold everyone", async () => {
    clerk.users = [{ id: "user_a" }];
    clerk.total = 900;
    const { accountsByIds } = await import("./clerk");
    const result = await accountsByIds(["user_a"]);
    expect(result.ok && result.value.accounts.map((account) => account.id)).toEqual(["user_a"]);
    expect(clerk.lists.at(-1)?.userId).toEqual(["user_a"]);
  });

  it("asks Clerk nothing for nobody", async () => {
    const { accountsByIds } = await import("./clerk");
    await accountsByIds([]);
    expect(clerk.lists).toHaveLength(0);
  });
});
