import { describe, expect, it } from "vitest";

import { actor, director, memory, memoryStore, musician, plain } from "../__fixtures__/memory";
import { PHILOSOPHY, philosophyStore } from "../__fixtures__/philosophy";
import type { Memory } from "../memory/memory";
import { savePhilosophy } from "../planning/service";
import {
  choicesFor,
  describeAction,
  isActionChoice,
  parseConductorAction,
  type ConductorAction,
  type ConductorActionKind,
  type ConductorActionPayloads,
  type ConductorActionResult,
} from "./actions";
import { resolveAction, type ResolveDeps } from "./resolve";

// ---------------------------------------------------------------------------
// Proposals kept in a list, each belonging to one person - reached, like the
// database's (conversations/store.ts), only as that person.
// ---------------------------------------------------------------------------

let nextId = 0;

function proposal<K extends ConductorActionKind>(kind: K, payload: ConductorActionPayloads[K]): ConductorAction {
  nextId += 1;
  return { id: `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`, kind, status: "pending", payload, result: null } as ConductorAction;
}

function setup(options: { memories?: Memory[]; philosophy?: string | null } = {}) {
  const memories = memoryStore(options.memories);
  const philosophy = philosophyStore(options.philosophy === undefined ? PHILOSOPHY : options.philosophy);
  const actions = new Map<string, { owner: string; action: ConductorAction }>();
  const claims: string[] = [];

  /** What the routes hand resolveAction() for one person: only that person's proposals are reachable. */
  const depsFor = (userId: string): ResolveDeps => ({
    get: async (id) => {
      const found = actions.get(id);
      return found && found.owner === userId ? found.action : null;
    },
    claim: async (id, status, result: ConductorActionResult | null) => {
      const found = actions.get(id);
      if (!found || found.owner !== userId || found.action.status !== "pending") return null;
      found.action = { ...found.action, status, result } as ConductorAction;
      claims.push(`${status}:${id}`);
      return found.action;
    },
    release: async (id) => {
      const found = actions.get(id);
      if (found && found.owner === userId) found.action = { ...found.action, status: "pending", result: null } as ConductorAction;
    },
    memory: memories.deps,
    philosophy: philosophy.deps,
  });

  const propose = <K extends ConductorActionKind>(owner: string, kind: K, payload: ConductorActionPayloads[K]) => {
    const action = proposal(kind, payload);
    actions.set(action.id, { owner, action });
    return action.id;
  };

  return { memories, philosophy, actions, claims, depsFor, propose, status: (id: string) => actions.get(id)?.action.status };
}

const SAVE = { text: "The congregation knows hymn 95 extremely well.", suggestedScope: null } as const;

describe("a card's choices", () => {
  it("are a scope or Cancel for a memory to save, and Apply or Cancel for the rest", () => {
    expect(choicesFor("memory_save")).toEqual(["personal", "global", "cancel"]);
    for (const kind of ["memory_update", "memory_delete", "philosophy_edit"] as const) expect(choicesFor(kind)).toEqual(["apply", "cancel"]);
    expect(isActionChoice("global")).toBe(true);
    expect(isActionChoice("save")).toBe(false);
    expect(isActionChoice(undefined)).toBe(false);
  });

  it("is read back only when it is exactly a proposal: nothing a model or a browser made up", () => {
    const good = proposal("memory_save", SAVE);
    expect(parseConductorAction(good)).toEqual(good);
    expect(parseConductorAction({ ...good, kind: "delete_everything" })).toBeNull();
    expect(parseConductorAction({ ...good, status: "approved" })).toBeNull();
    expect(parseConductorAction({ ...good, payload: { text: "" } })).toBeNull();
    expect(parseConductorAction({ ...good, payload: { text: "x".repeat(501), suggestedScope: null } })).toBeNull();
    expect(parseConductorAction({ ...good, payload: { text: "Fine.", suggestedScope: "everyone" } })).toBeNull();
    expect(parseConductorAction(null)).toBeNull();
    // Anything in `result` but a scope is dropped.
    expect(parseConductorAction({ ...good, status: "applied", result: { scope: "global", admin: true } })?.result).toEqual({ scope: "global" });
  });
});

describe("saving a memory Conductor proposed", () => {
  it("writes nothing until the person chooses - and nothing at all on Cancel", async () => {
    const { memories, depsFor, propose, status } = setup();
    const id = propose("user_director", "memory_save", SAVE);
    // The card is up; nothing has been chosen.
    expect(memories.rows).toEqual([]);
    expect(status(id)).toBe("pending");

    const cancelled = await resolveAction(director, id, "cancel", depsFor("user_director"));
    expect(cancelled).toMatchObject({ ok: true, action: { status: "cancelled", result: null } });
    expect(memories.rows).toEqual([]);
    expect(memories.writes).toEqual([]);
  });

  it("saves to Personal as the person's own, with exactly the text on the card", async () => {
    const { memories, depsFor, propose } = setup();
    const id = propose("user_director", "memory_save", { text: "I like hymn 95 as an opening hymn.", suggestedScope: "global" });
    // The scope Conductor suggested is only a suggestion: the choice is what counts.
    const saved = await resolveAction(director, id, "personal", depsFor("user_director"));
    expect(saved).toMatchObject({ ok: true, action: { status: "applied", result: { scope: "personal" } } });
    expect(memories.rows).toMatchObject([{ scope: "personal", ownerUserId: "user_director", text: "I like hymn 95 as an opening hymn." }]);
  });

  it("saves to Global for someone who manages global memory", async () => {
    const { memories, depsFor, propose } = setup();
    const id = propose("user_director", "memory_save", SAVE);
    expect(await resolveAction(director, id, "global", depsFor("user_director"))).toMatchObject({ ok: true, action: { result: { scope: "global" } } });
    expect(memories.rows).toMatchObject([{ scope: "global", ownerUserId: null, createdBy: "user_director", text: SAVE.text }]);
  });

  it("refuses Global without the permission: nothing is saved, not even personally, and the card still waits", async () => {
    const { memories, depsFor, propose, status, claims } = setup();
    const id = propose("user_musician", "memory_save", { ...SAVE, suggestedScope: "global" });
    expect(await resolveAction(musician, id, "global", depsFor("user_musician"))).toEqual({ ok: false, problem: "forbidden" });
    expect(memories.rows).toEqual([]);
    expect(claims).toEqual([]);
    expect(status(id)).toBe("pending");
    // They can still choose what they ARE allowed.
    expect(await resolveAction(musician, id, "personal", depsFor("user_musician"))).toMatchObject({ ok: true });
    expect(memories.rows).toMatchObject([{ scope: "personal", ownerUserId: "user_musician" }]);
  });

  it("refuses Personal without personal memory, and everything without use_ai", async () => {
    const { memories, depsFor, propose, status } = setup();
    const id = propose("user_plain", "memory_save", SAVE);
    expect(await resolveAction(plain, id, "personal", depsFor("user_plain"))).toEqual({ ok: false, problem: "forbidden" });
    expect(await resolveAction(plain, id, "global", depsFor("user_plain"))).toEqual({ ok: false, problem: "forbidden" });
    const lapsed = actor("user_plain", "use_personal_ai_memory", "manage_global_ai_memory");
    expect(await resolveAction(lapsed, id, "personal", depsFor("user_plain"))).toEqual({ ok: false, problem: "forbidden" });
    expect(memories.rows).toEqual([]);
    expect(status(id)).toBe("pending");
  });

  it("is settled once: a second click, or another tab, changes nothing", async () => {
    const { memories, depsFor, propose } = setup();
    const id = propose("user_director", "memory_save", SAVE);
    const deps = depsFor("user_director");
    expect((await resolveAction(director, id, "personal", deps)).ok).toBe(true);
    expect(await resolveAction(director, id, "global", deps)).toEqual({ ok: false, problem: "settled" });
    expect(await resolveAction(director, id, "cancel", deps)).toEqual({ ok: false, problem: "settled" });
    expect(memories.rows).toHaveLength(1);

    const cancelledId = propose("user_director", "memory_save", SAVE);
    expect((await resolveAction(director, cancelledId, "cancel", deps)).ok).toBe(true);
    expect(await resolveAction(director, cancelledId, "personal", deps)).toEqual({ ok: false, problem: "settled" });
    expect(memories.rows).toHaveLength(1);
  });

  it("cannot be settled by anyone but the person it was shown to", async () => {
    const { memories, depsFor, propose, status } = setup();
    const id = propose("user_musician", "memory_save", SAVE);
    // The Director holds every permission, and still cannot reach a musician's card by its id.
    expect(await resolveAction(director, id, "global", depsFor("user_director"))).toEqual({ ok: false, problem: "not-found" });
    expect(await resolveAction(director, id, "cancel", depsFor("user_director"))).toEqual({ ok: false, problem: "not-found" });
    expect(memories.rows).toEqual([]);
    expect(status(id)).toBe("pending");
    expect(await resolveAction(director, "00000000-0000-4000-8000-999999999999", "cancel", depsFor("user_director"))).toEqual({ ok: false, problem: "not-found" });
  });

  it("takes only a choice that belongs on the card", async () => {
    const { memories, depsFor, propose, status } = setup();
    const id = propose("user_director", "memory_save", SAVE);
    expect(await resolveAction(director, id, "apply", depsFor("user_director"))).toEqual({ ok: false, problem: "invalid-choice" });
    expect(memories.rows).toEqual([]);
    expect(status(id)).toBe("pending");
  });

  it("goes back to waiting when the save itself fails", async () => {
    const full = Array.from({ length: 300 }, (_, index) => memory(index + 1, "global", `Memory ${index}`));
    const { depsFor, propose, status } = setup({ memories: full });
    const id = propose("user_director", "memory_save", SAVE);
    expect(await resolveAction(director, id, "global", depsFor("user_director"))).toEqual({ ok: false, problem: "memory-full" });
    expect(status(id)).toBe("pending");
  });
});

describe("changing and forgetting a memory Conductor proposed", () => {
  const seeded = () =>
    setup({
      memories: [
        memory(1, "personal", "I like hymn 95 as an opener.", "user_director"),
        memory(2, "global", "The Wednesday pianist is new."),
        memory(3, "personal", "I read the capo sheet music.", "user_musician"),
      ],
    });

  it("applies a change only on Apply", async () => {
    const { memories, depsFor, propose } = seeded();
    const payload = { memoryId: 1, scope: "personal", before: "I like hymn 95 as an opener.", after: "I like hymn 95 as a closer." } as const;
    const cancelled = propose("user_director", "memory_update", payload);
    await resolveAction(director, cancelled, "cancel", depsFor("user_director"));
    expect(memories.rows[0].text).toBe("I like hymn 95 as an opener.");

    const applied = propose("user_director", "memory_update", payload);
    expect(await resolveAction(director, applied, "apply", depsFor("user_director"))).toMatchObject({ ok: true, action: { status: "applied" } });
    expect(memories.rows[0].text).toBe("I like hymn 95 as a closer.");
  });

  it("forgets a memory only on Apply", async () => {
    const { memories, depsFor, propose } = seeded();
    const payload = { memoryId: 2, scope: "global", text: "The Wednesday pianist is new." } as const;
    await resolveAction(director, propose("user_director", "memory_delete", payload), "cancel", depsFor("user_director"));
    expect(memories.rows).toHaveLength(3);
    expect(await resolveAction(director, propose("user_director", "memory_delete", payload), "apply", depsFor("user_director"))).toMatchObject({ ok: true });
    expect(memories.rows.map((row) => row.id)).toEqual([1, 3]);
  });

  it("will not change a global memory for someone who may not, whatever the card says", async () => {
    const { memories, depsFor, propose, status } = seeded();
    const change = propose("user_musician", "memory_update", { memoryId: 2, scope: "global", before: "The Wednesday pianist is new.", after: "Nothing to see." });
    const forget = propose("user_musician", "memory_delete", { memoryId: 2, scope: "global", text: "The Wednesday pianist is new." });
    expect(await resolveAction(musician, change, "apply", depsFor("user_musician"))).toEqual({ ok: false, problem: "forbidden" });
    expect(await resolveAction(musician, forget, "apply", depsFor("user_musician"))).toEqual({ ok: false, problem: "forbidden" });
    expect(memories.rows[1].text).toBe("The Wednesday pianist is new.");
    expect(status(change)).toBe("pending");
  });

  it("cannot be pointed at another person's memory: a payload naming it finds nothing", async () => {
    const { memories, depsFor, propose, status } = seeded();
    // As if a model had been talked into naming someone else's memory.
    const change = propose("user_director", "memory_update", { memoryId: 3, scope: "personal", before: "?", after: "Overwritten." });
    const forget = propose("user_director", "memory_delete", { memoryId: 3, scope: "personal", text: "?" });
    expect(await resolveAction(director, change, "apply", depsFor("user_director"))).toEqual({ ok: false, problem: "memory-gone" });
    expect(await resolveAction(director, forget, "apply", depsFor("user_director"))).toEqual({ ok: false, problem: "memory-gone" });
    expect(memories.rows[2]).toMatchObject({ text: "I read the capo sheet music.", ownerUserId: "user_musician" });
    // Nothing was done, so the cards are waiting again.
    expect(status(change)).toBe("pending");
    expect(status(forget)).toBe("pending");
  });
});

describe("changing the philosophy on Conductor's proposal", () => {
  const EDIT = {
    sectionId: "recent-usage",
    sectionTitle: "Recent Usage",
    before: "Do not repeat a song within a month.",
    after: "Recent usage is considered, but is secondary to familiarity.",
    explanation: "Makes recent usage secondary, as asked.",
    baseRevisionId: 1,
  } as const;

  it("leaves the philosophy exactly as it was on Cancel", async () => {
    const { philosophy, depsFor, propose } = setup();
    const id = propose("user_director", "philosophy_edit", EDIT);
    expect(await resolveAction(director, id, "cancel", depsFor("user_director"))).toMatchObject({ ok: true, action: { status: "cancelled" } });
    expect(philosophy.revisions).toHaveLength(1);
    expect(philosophy.revisions[0].markdown).toBe(PHILOSOPHY);
  });

  it("applies it on Apply, through the same versions a manual edit makes, marked as Conductor's proposal", async () => {
    const { philosophy, depsFor, propose } = setup();
    const id = propose("user_director", "philosophy_edit", EDIT);
    expect(await resolveAction(director, id, "apply", depsFor("user_director"))).toMatchObject({ ok: true, action: { status: "applied" } });
    expect(philosophy.revisions).toHaveLength(2);
    expect(philosophy.revisions[1]).toMatchObject({ source: "ai", by: "user_director", changedSections: ["Recent Usage"], note: EDIT.explanation });
    expect(philosophy.revisions[1].markdown).toContain(EDIT.after);
    // Only that section: the hard rule beside it is untouched.
    expect(philosophy.revisions[1].markdown).toContain("Every service in the season must use only Christmas songs. This is a hard rule.");
    expect(philosophy.revisions[1].markdown).not.toContain(EDIT.before);
    // One history: a manual edit goes on top of it like any other version.
    const manual = await savePhilosophy(director, { markdown: philosophy.revisions[1].markdown.replace("sing out", "sing out loudly"), source: "manual", baseRevisionId: 2 }, philosophy.deps);
    expect(manual).toMatchObject({ ok: true, revision: { id: 3, source: "manual" } });
  });

  it("is only for someone holding manage_planning_philosophy - asking Conductor is not a permission", async () => {
    const { philosophy, depsFor, propose, status } = setup();
    const id = propose("user_musician", "philosophy_edit", EDIT);
    expect(await resolveAction(musician, id, "apply", depsFor("user_musician"))).toEqual({ ok: false, problem: "forbidden" });
    expect(philosophy.revisions).toHaveLength(1);
    expect(status(id)).toBe("pending");
  });

  it("refuses a proposal made against a version that is no longer in force", async () => {
    const { philosophy, depsFor, propose, status } = setup();
    const id = propose("user_director", "philosophy_edit", EDIT);
    await savePhilosophy(director, { markdown: PHILOSOPHY.replace("sing out", "sing out loudly"), source: "manual", baseRevisionId: 1 }, philosophy.deps);
    expect(await resolveAction(director, id, "apply", depsFor("user_director"))).toEqual({ ok: false, problem: "philosophy-changed" });
    expect(philosophy.revisions).toHaveLength(2);
    expect(philosophy.revisions[1].markdown).not.toContain(EDIT.after);
    expect(status(id)).toBe("pending");
  });

  it("refuses a section that is not there, and says so when the philosophy cannot be kept", async () => {
    const gone = setup();
    const missing = gone.propose("user_director", "philosophy_edit", { ...EDIT, sectionId: "no-such-section" });
    expect(await resolveAction(director, missing, "apply", gone.depsFor("user_director"))).toEqual({ ok: false, problem: "philosophy-changed" });

    const none = setup({ philosophy: null });
    const id = none.propose("user_director", "philosophy_edit", EDIT);
    expect(await resolveAction(director, id, "apply", none.depsFor("user_director"))).toEqual({ ok: false, problem: "unavailable" });
  });
});

describe("what Conductor is told became of a card", () => {
  const save = proposal("memory_save", SAVE) as Extract<ConductorAction, { kind: "memory_save" }>;

  it("never reads as saved unless the person saved it", () => {
    expect(describeAction(save)).toContain("The person has not decided yet; nothing has been saved.");
    expect(describeAction({ ...save, status: "cancelled" })).toContain("The person cancelled it; nothing was saved.");
    expect(describeAction({ ...save, status: "applied", result: { scope: "global" } })).toContain("They saved it to global memory.");
    expect(describeAction({ ...save, status: "applied", result: { scope: "personal" } })).toContain("They saved it to personal memory.");
    for (const status of ["pending", "cancelled"] as const) expect(describeAction({ ...save, status })).not.toContain("They saved");
  });

  it("covers every kind of card", () => {
    const update = proposal("memory_update", { memoryId: 1, scope: "personal", before: "Old.", after: "New." });
    const forget = proposal("memory_delete", { memoryId: 1, scope: "global", text: "Old." });
    const edit = proposal("philosophy_edit", { sectionId: "purpose", sectionTitle: "Purpose", before: "a", after: "b", explanation: "", baseRevisionId: 1 });
    expect(describeAction({ ...update, status: "applied" } as ConductorAction)).toContain("They applied the change.");
    expect(describeAction({ ...forget, status: "applied" } as ConductorAction)).toContain("They deleted it.");
    expect(describeAction({ ...edit, status: "applied" } as ConductorAction)).toContain("the philosophy now reads as proposed");
    expect(describeAction(edit)).toContain('section "Purpose"');
    expect(describeAction(edit)).toContain("nothing has been saved");
  });
});
