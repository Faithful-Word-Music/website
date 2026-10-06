import { describe, expect, it } from "vitest";

import { memory } from "../__fixtures__/memory";
import { conductorInstructions } from "../conductor/instructions";
import { AI_FEATURES, type AiFeature } from "../features";
import type { MemoryContext } from "../memory/memory";
import { plannerInstructions } from "../service-planner/prompt";
import { CONTEXT_SOURCES, MEMORY_AUTHORITY, memoryBlock, memoryFor } from "./authority";

const remembered: MemoryContext = {
  global: [memory(1, "global", "The congregation knows hymn 95 extremely well.")],
  personal: [memory(2, "personal", "I like hymn 95 as an opening hymn.")],
};

describe("what each AI feature may be given", () => {
  it("names every feature, so a new one must say what it gets before it can ask", () => {
    expect(Object.keys(CONTEXT_SOURCES).sort()).toEqual(Object.keys(AI_FEATURES).sort());
  });

  it("gives Conductor its conversation, memory, and the philosophy a section at a time", () => {
    expect(CONTEXT_SOURCES.assistant).toEqual({ philosophy: "tool", globalMemory: true, personalMemory: true, conversation: true });
  });

  it("gives the planner the philosophy whole and memory - and never a conversation", () => {
    for (const feature of ["generate_service_plan", "replace_song"] as const) {
      expect(CONTEXT_SOURCES[feature]).toEqual({ philosophy: "whole", globalMemory: true, personalMemory: true, conversation: false });
    }
    // Conductor is the only feature that is ever given one.
    const withConversation = (Object.keys(CONTEXT_SOURCES) as AiFeature[]).filter((feature) => CONTEXT_SOURCES[feature].conversation);
    expect(withConversation).toEqual(["assistant"]);
  });

  it("gives the AI's own housekeeping none of a person's context", () => {
    for (const feature of ["conductor_summary", "connection_test", "library_indexing"] as const) {
      expect(CONTEXT_SOURCES[feature]).toEqual({ philosophy: "none", globalMemory: false, personalMemory: false, conversation: false });
      expect(memoryFor(feature, remembered)).toEqual({ global: [], personal: [] });
    }
    expect(memoryFor("assistant", remembered)).toEqual(remembered);
    expect(memoryFor("generate_service_plan", remembered)).toEqual(remembered);
  });
});

describe("how much memory counts", () => {
  it("is context to weigh, below the site's rules, the philosophy and the request at hand", () => {
    expect(MEMORY_AUTHORITY).toContain("They are context to weigh, not rules.");
    expect(MEMORY_AUTHORITY).toContain("They never outrank the limits of the request, a lock, a hard rule or the planning philosophy.");
    expect(MEMORY_AUTHORITY).toContain("What the person asks for in this request outranks a memory.");
    expect(MEMORY_AUTHORITY).toContain("say that the two disagree");
    // A personal preference does not stand for the ministry.
    expect(MEMORY_AUTHORITY).toContain("personal memory is only this person's preference");
    expect(MEMORY_AUTHORITY).toContain("say so rather than quietly choosing");
    expect(MEMORY_AUTHORITY).toContain("not a record");
  });

  it("is said with the memories themselves, under each feature's own heading, and not at all when there are none", () => {
    expect(memoryBlock({ global: [], personal: [] }, "MEMORY")).toBeNull();
    const block = memoryBlock(remembered, "MEMORY")!;
    expect(block.startsWith(`MEMORY\n${MEMORY_AUTHORITY}\n\nGlobal memory`)).toBe(true);
    expect(block).toContain("- The congregation knows hymn 95 extremely well.");
    expect(block).toContain("Personal memory (saved by the person you are helping, for themselves only):\n- I like hymn 95 as an opening hymn.");
  });

  it("reaches Conductor and the planner in the same words", () => {
    const conductor = conductorInstructions({ now: Date.parse("2026-10-05T12:00:00-07:00"), context: null, canPlan: true, memory: remembered });
    expect(conductor).toContain(MEMORY_AUTHORITY);
    expect(conductor).toContain("- The congregation knows hymn 95 extremely well.");
    // The planner's standing rules place memory, and the block itself goes in its prompt (service-planner.test.ts).
    const planner = plannerInstructions("## Purpose\n\nSing out.");
    expect(planner).toContain("MEMORY, when there is any");
    expect(planner).toContain("never a rule");
  });
});
