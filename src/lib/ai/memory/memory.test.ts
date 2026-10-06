import { describe, expect, it } from "vitest";

import { actor, director, memory, memoryStore, musician, plain } from "../__fixtures__/memory";
import {
  MEMORY_LIMITS,
  normalizeMemoryCategory,
  normalizeMemoryText,
  renderMemories,
  searchMemories,
  selectMemories,
} from "./memory";
import {
  canWriteMemory,
  createMemory,
  deleteMemory,
  listMemories,
  memoryForRequest,
  moveMemory,
  updateMemory,
  writableScopes,
} from "./service";

describe("what a memory may be", () => {
  it("is one tidy statement within the limit", () => {
    expect(normalizeMemoryText("  The congregation\n knows   hymn 95.  ")).toBe("The congregation knows hymn 95.");
    expect(normalizeMemoryText("   ")).toBeNull();
    expect(normalizeMemoryText(42)).toBeNull();
    expect(normalizeMemoryText("x".repeat(MEMORY_LIMITS.textChars + 1))).toBeNull();
  });

  it("takes any short category, or none", () => {
    expect(normalizeMemoryCategory("  Songs ")).toBe("Songs");
    expect(normalizeMemoryCategory("")).toBeNull();
    expect(normalizeMemoryCategory(undefined)).toBeNull();
    expect(normalizeMemoryCategory(7)).toBeUndefined();
    expect(normalizeMemoryCategory("x".repeat(MEMORY_LIMITS.categoryChars + 1))).toBeUndefined();
  });
});

describe("who may save where", () => {
  it("keeps the two memory permissions apart, and both behind use_ai", () => {
    expect(writableScopes(director)).toEqual(["personal", "global"]);
    expect(writableScopes(musician)).toEqual(["personal"]);
    expect(writableScopes(plain)).toEqual([]);
    expect(writableScopes(actor("user_x", "use_ai", "manage_global_ai_memory"))).toEqual(["global"]);
    // The memory permissions do nothing for someone who may not use AI at all.
    expect(writableScopes(actor("user_y", "use_personal_ai_memory", "manage_global_ai_memory"))).toEqual([]);
    expect(canWriteMemory(musician, "global")).toBe(false);
  });

  it("saves a personal memory as the person's own, and a global one as nobody's", async () => {
    const { deps, rows } = memoryStore();
    const mine = await createMemory(director, { scope: "personal", text: " I like hymn 95 as an opener. ", category: "Preferences" }, deps);
    expect(mine).toMatchObject({ ok: true, memory: { scope: "personal", ownerUserId: "user_director", text: "I like hymn 95 as an opener.", category: "Preferences" } });
    const shared = await createMemory(director, { scope: "global", text: "The congregation knows hymn 95 very well." }, deps);
    expect(shared).toMatchObject({ ok: true, memory: { scope: "global", ownerUserId: null, createdBy: "user_director" } });
    expect(rows).toHaveLength(2);
  });

  it("refuses a global save without its permission, and never makes it a personal one", async () => {
    const { deps, rows, writes } = memoryStore();
    expect(await createMemory(musician, { scope: "global", text: "The piano is out of tune on Wednesdays." }, deps)).toEqual({ ok: false, problem: "forbidden" });
    expect(await createMemory(plain, { scope: "global", text: "Anything." }, deps)).toEqual({ ok: false, problem: "forbidden" });
    expect(rows).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("refuses a personal save without personal memory, and never makes it a global one", async () => {
    const { deps, rows } = memoryStore();
    const globalOnly = actor("user_x", "use_ai", "manage_global_ai_memory");
    expect(await createMemory(globalOnly, { scope: "personal", text: "I prefer slower openers." }, deps)).toEqual({ ok: false, problem: "forbidden" });
    expect(await createMemory(plain, { scope: "personal", text: "I prefer slower openers." }, deps)).toEqual({ ok: false, problem: "forbidden" });
    expect(rows).toEqual([]);
  });

  it("lets a personal-only person keep their own memory", async () => {
    const { deps } = memoryStore();
    const saved = await createMemory(musician, { scope: "personal", text: "I read the capo sheet music." }, deps);
    expect(saved).toMatchObject({ ok: true, memory: { ownerUserId: "user_musician" } });
  });

  it("refuses what is not a memory, and a scope that is full", async () => {
    const { deps } = memoryStore();
    expect(await createMemory(director, { scope: "personal", text: "   " }, deps)).toEqual({ ok: false, problem: "invalid" });
    expect(await createMemory(director, { scope: "personal", text: "Fine.", category: 9 }, deps)).toEqual({ ok: false, problem: "invalid" });
    const full = memoryStore(Array.from({ length: MEMORY_LIMITS.perScope }, (_, index) => memory(index + 1, "global", `Memory ${index}`)));
    expect(await createMemory(director, { scope: "global", text: "One more." }, full.deps)).toEqual({ ok: false, problem: "full" });
  });
});

describe("one person's memory is theirs alone", () => {
  const seeded = () =>
    memoryStore([
      memory(1, "personal", "I like hymn 95 as an opener.", "user_director"),
      memory(2, "personal", "I read the capo sheet music.", "user_musician"),
      memory(3, "global", "The congregation knows hymn 95 very well."),
    ]);

  it("lists the global memories for everyone, and personal ones only for their owner", async () => {
    const { deps } = seeded();
    expect((await listMemories(director, deps)).personal.map((item) => item.id)).toEqual([1]);
    expect((await listMemories(musician, deps)).personal.map((item) => item.id)).toEqual([2]);
    for (const who of [director, musician, plain]) expect((await listMemories(who, deps)).global.map((item) => item.id)).toEqual([3]);
    // Without personal memory, a person's own rows are not read at all.
    expect((await listMemories(plain, deps)).personal).toEqual([]);
    // Without use_ai there is no memory.
    expect(await listMemories(actor("user_none", "use_personal_ai_memory"), deps)).toEqual({ global: [], personal: [] });
  });

  it("cannot reach another person's memory by its id: not to change, move or delete it", async () => {
    const { deps, rows, writes } = seeded();
    expect(await updateMemory(director, { id: 2, text: "Changed by someone else." }, deps)).toEqual({ ok: false, problem: "not-found" });
    expect(await deleteMemory(director, 2, deps)).toEqual({ ok: false, problem: "not-found" });
    expect(await moveMemory(director, { id: 2, scope: "global" }, deps)).toEqual({ ok: false, problem: "not-found" });
    expect(rows.find((row) => row.id === 2)).toMatchObject({ text: "I read the capo sheet music.", scope: "personal", ownerUserId: "user_musician" });
    expect(writes).toEqual([]);
  });

  it("lets a person change and delete their own", async () => {
    const { deps, rows } = seeded();
    expect(await updateMemory(musician, { id: 2, text: "I read the chords sheet music.", category: "Preferences" }, deps)).toMatchObject({
      ok: true,
      memory: { text: "I read the chords sheet music.", category: "Preferences", updatedBy: "user_musician" },
    });
    expect(await updateMemory(musician, { id: 2, text: "I read the chords sheet music." }, deps)).toEqual({ ok: false, problem: "unchanged" });
    expect(await deleteMemory(musician, 2, deps)).toMatchObject({ ok: true });
    expect(rows.map((row) => row.id)).toEqual([1, 3]);
  });

  it("lets only someone who manages global memory change or delete a global one", async () => {
    const { deps, rows } = seeded();
    expect(await updateMemory(musician, { id: 3, text: "Not theirs to change." }, deps)).toEqual({ ok: false, problem: "forbidden" });
    expect(await deleteMemory(plain, 3, deps)).toEqual({ ok: false, problem: "forbidden" });
    expect(rows.find((row) => row.id === 3)?.text).toBe("The congregation knows hymn 95 very well.");
    expect(await updateMemory(director, { id: 3, text: "The congregation knows hymn 95 extremely well." }, deps)).toMatchObject({ ok: true });
  });

  it("moves a memory between the scopes only for someone who may write both", async () => {
    const { deps, rows } = seeded();
    // A musician's own memory cannot be pushed into the ministry's.
    expect(await moveMemory(musician, { id: 2, scope: "global" }, deps)).toEqual({ ok: false, problem: "forbidden" });
    expect(rows.find((row) => row.id === 2)?.scope).toBe("personal");

    expect(await moveMemory(director, { id: 1, scope: "global" }, deps)).toMatchObject({ ok: true, memory: { scope: "global", ownerUserId: null } });
    expect(await moveMemory(director, { id: 3, scope: "personal" }, deps)).toMatchObject({ ok: true, memory: { scope: "personal", ownerUserId: "user_director" } });
    expect(await moveMemory(director, { id: 3, scope: "personal" }, deps)).toEqual({ ok: false, problem: "unchanged" });
  });
});

describe("what an AI request is given of memory", () => {
  it("gives global memory to everyone using AI, and personal memory only to its owner with the permission", async () => {
    const { deps } = memoryStore([
      memory(1, "personal", "I like hymn 95 as an opener.", "user_director"),
      memory(2, "personal", "I read the capo sheet music.", "user_musician"),
      memory(3, "global", "The congregation knows hymn 95 very well."),
    ]);
    expect(await memoryForRequest(director, deps)).toMatchObject({ global: [{ id: 3 }], personal: [{ id: 1 }] });
    expect(await memoryForRequest(musician, deps)).toMatchObject({ global: [{ id: 3 }], personal: [{ id: 2 }] });
    expect(await memoryForRequest(plain, deps)).toMatchObject({ global: [{ id: 3 }], personal: [] });
  });

  it("sends everything while it fits, newest first", () => {
    const all = [memory(1, "global", "Older.", null, "2026-09-01T00:00:00.000Z"), memory(2, "global", "Newer.", null, "2026-10-01T00:00:00.000Z")];
    expect(selectMemories(all).map((item) => item.id)).toEqual([2, 1]);
  });

  it("past the limit keeps what bears on the request, then the most recent - and never more than fits", () => {
    const filler = (id: number, day: number) => memory(id, "global", `Note ${id} about the sound desk. ${"x".repeat(180)}`, null, `2026-09-${String(day).padStart(2, "0")}T00:00:00.000Z`);
    const all = [
      memory(1, "global", `The congregation knows hymn 95 extremely well. ${"y".repeat(160)}`, null, "2026-01-01T00:00:00.000Z"),
      ...Array.from({ length: 12 }, (_, index) => filler(index + 2, index + 1)),
    ];
    const chosen = selectMemories(all, { query: "Is hymn 95 a good opener for the congregation?", maxChars: 800 });
    expect(chosen.reduce((total, item) => total + item.text.length, 0)).toBeLessThanOrEqual(800);
    // The oldest memory of all, kept because it is what was asked about.
    expect(chosen.map((item) => item.id)).toContain(1);
    // The rest are the latest ones.
    expect(chosen.filter((item) => item.id !== 1).map((item) => item.id)).toEqual([13, 12]);
    // With nothing to go on, the most recent win, and the old one does not fit.
    expect(selectMemories(all, { maxChars: 800 }).map((item) => item.id)).toEqual([13, 12, 11]);
  });

  it("is written out under its two scopes, so the model knows whose a memory is", () => {
    expect(renderMemories({ global: [], personal: [] })).toBeNull();
    const text = renderMemories({
      global: [memory(3, "global", "The congregation knows hymn 95 very well.")],
      personal: [memory(1, "personal", "I like hymn 95 as an opener.")],
    });
    expect(text).toBe(
      "Global memory (shared by the whole ministry):\n- The congregation knows hymn 95 very well.\n\nPersonal memory (saved by the person you are helping, for themselves only):\n- I like hymn 95 as an opener.",
    );
    expect(renderMemories({ global: [], personal: [memory(1, "personal", "Mine.")] })).not.toContain("Global memory");
  });

  it("is searched by every word typed, in the text or the category", () => {
    const all = [{ text: "The Wednesday pianist is new.", category: "Musicians" }, { text: "Hymn 95 is well known.", category: "Songs" }];
    expect(searchMemories(all, "wednesday pianist")).toEqual([all[0]]);
    expect(searchMemories(all, "songs")).toEqual([all[1]]);
    expect(searchMemories(all, "  ")).toEqual(all);
    expect(searchMemories(all, "organ")).toEqual([]);
  });
});
