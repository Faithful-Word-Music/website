import { describe, expect, it } from "vitest";

import type { ConductorAction } from "../conductor/actions";
import { CONDUCTOR_LIMITS } from "../conductor/limits";
import {
  CONVERSATION_LIMITS,
  conversationContext,
  isConversationId,
  messagesToSummarize,
  normalizeSummary,
  normalizeTitle,
  SUMMARY_INSTRUCTIONS,
  summarySource,
  titleFromQuestion,
  type StoredMessage,
} from "./model";

let nextId = 0;
const message = (role: "user" | "assistant", text: string, extra: Partial<StoredMessage> = {}): StoredMessage => ({
  id: (nextId += 1),
  role,
  text,
  status: "complete",
  errorMessage: null,
  createdAt: "2026-10-05T19:00:00.000Z",
  actions: [],
  ...extra,
});

/** A conversation of `exchanges` questions and answers, then the question being asked now. */
const conversation = (exchanges: number, answerChars = 40): StoredMessage[] => [
  ...Array.from({ length: exchanges }, (_, index) => [message("user", `Question ${index + 1}?`), message("assistant", `Answer ${index + 1}. ${"x".repeat(answerChars)}`)]).flat(),
  message("user", "And now?"),
];

describe("a conversation's id and title", () => {
  it("accepts only an id the site gave out", () => {
    expect(isConversationId("0b9d6c1e-3f4a-4c2b-9a51-7e2d8f6a1b3c")).toBe(true);
    for (const value of ["", "12", "0b9d6c1e-3f4a-4c2b-9a51-7e2d8f6a1b3c; DROP TABLE", "../other", null, 7, undefined]) expect(isConversationId(value)).toBe(false);
  });

  it("takes its first title from its first question, cut at a word", () => {
    expect(titleFromQuestion("  When did we last\nsing Blessed Assurance? ", "New conversation")).toBe("When did we last sing Blessed Assurance?");
    const long = titleFromQuestion("Which songs about heaven have we not sung in the evening services since the start of last year?", "New conversation");
    expect(long.length).toBeLessThanOrEqual(61);
    expect(long.endsWith("…")).toBe(true);
    expect(long).toBe("Which songs about heaven have we not sung in the evening…");
    expect(titleFromQuestion("   ", "New conversation")).toBe("New conversation");
    // One enormous word is simply cut.
    expect(titleFromQuestion("x".repeat(200), "New conversation")).toBe(`${"x".repeat(60)}…`);
  });

  it("stores a typed title as one line within the limit, or not at all", () => {
    expect(normalizeTitle("  Hymn\n dates  ")).toBe("Hymn dates");
    expect(normalizeTitle("   ")).toBeNull();
    expect(normalizeTitle(42)).toBeNull();
    expect(normalizeTitle("x".repeat(300))).toHaveLength(CONVERSATION_LIMITS.titleChars);
  });
});

describe("what the model is sent of a conversation", () => {
  it("sends a short conversation whole, ending with the question", () => {
    const { turns, summary } = conversationContext({ summary: null }, conversation(2));
    expect(turns.map((turn) => turn.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
    expect(turns.at(-1)).toEqual({ role: "user", text: "And now?" });
    expect(summary).toBeNull();
  });

  it("never sends a long conversation whole: only the latest turns, within the limits", () => {
    const { turns } = conversationContext({ summary: null }, conversation(40));
    expect(turns.length).toBeLessThanOrEqual(CONDUCTOR_LIMITS.historyTurns);
    expect(turns[0].role).toBe("user");
    expect(turns.at(-1)?.text).toBe("And now?");
    // The first questions are not among them.
    expect(turns.some((turn) => turn.text === "Question 1?")).toBe(false);
    expect(turns.some((turn) => turn.text === "Question 40?")).toBe(true);

    const wordy = conversationContext({ summary: null }, conversation(40, 3000)).turns;
    expect(wordy.reduce((total, turn) => total + turn.text.length, 0)).toBeLessThanOrEqual(CONDUCTOR_LIMITS.historyChars + CONDUCTOR_LIMITS.questionChars);
    expect(wordy.at(-1)?.text).toBe("And now?");
  });

  it("carries the summary of what came before, beside the latest turns and not in place of them", () => {
    const { turns, summary } = conversationContext({ summary: "  They were choosing an opener for October 11.  " }, conversation(3));
    expect(summary).toBe("They were choosing an opener for October 11.");
    expect(turns).toHaveLength(7);
    expect(conversationContext({ summary: "   " }, conversation(1)).summary).toBeNull();
  });

  it("leaves out an answer that never said anything, and keeps its question", () => {
    const messages = [message("user", "When?"), message("assistant", "", { status: "error", errorMessage: "timeout" }), message("user", "When, again?")];
    expect(conversationContext({ summary: null }, messages).turns).toEqual([
      { role: "user", text: "When?" },
      { role: "user", text: "When, again?" },
    ]);
  });

  it("tells the model what became of each card, so it never has to take its own word that something was saved", () => {
    const card = (status: ConductorAction["status"], result: ConductorAction["result"] = null): ConductorAction => ({
      id: "p1",
      kind: "memory_save",
      status,
      payload: { text: "The congregation knows hymn 95 extremely well.", suggestedScope: null },
      result,
    });
    const told = (action: ConductorAction) =>
      conversationContext({ summary: null }, [message("user", "Remember that."), message("assistant", "The card is waiting.", { actions: [action] }), message("user", "Did you save it?")]).turns[1].text;

    expect(told(card("pending"))).toContain("The person has not decided yet; nothing has been saved.");
    expect(told(card("cancelled"))).toContain("The person cancelled it; nothing was saved.");
    expect(told(card("applied", { scope: "global" }))).toContain("They saved it to global memory.");
    expect(told(card("applied", { scope: "global" }))).toMatch(/^The card is waiting\.\n\n\[A card asked/);
  });

  it("gives an answer that was only a card its card", () => {
    const action: ConductorAction = { id: "p1", kind: "memory_delete", status: "applied", payload: { memoryId: 4, scope: "personal", text: "Old." }, result: null };
    const { turns } = conversationContext({ summary: null }, [message("user", "Forget that."), message("assistant", "", { actions: [action] }), message("user", "Thanks.")]);
    expect(turns[1]).toEqual({ role: "assistant", text: expect.stringContaining("They deleted it.") });
  });
});

describe("summarising a long conversation", () => {
  /** A conversation as it stands between questions: every question answered. */
  const settled = (exchanges: number, answerChars = 40) => conversation(exchanges, answerChars).slice(0, -1);

  it("leaves a short conversation alone", () => {
    expect(messagesToSummarize(settled(3))).toEqual([]);
    expect(messagesToSummarize([])).toEqual([]);
  });

  it("takes in exactly the messages that have dropped out of the word-for-word part", () => {
    const messages = settled(20);
    const older = messagesToSummarize(messages);
    expect(older.length).toBeGreaterThanOrEqual(CONVERSATION_LIMITS.summarizeAfter);
    // They are the OLDEST messages, in order, and the rest is what the next question would be sent.
    expect(older).toEqual(messages.slice(0, older.length));
    const kept = messages.slice(older.length);
    const next = conversationContext({ summary: "…" }, [...kept, message("user", "Next?")]).turns;
    expect(next).toHaveLength(kept.length + 1);
    expect(next[0].text).toBe(kept[0].text);
  });

  it("waits until enough has dropped out, rather than rewriting the summary after every question", () => {
    // Eleven turns are kept beside the next question: one over is not worth a summary, six over is.
    const justOver = settled(6);
    expect(justOver).toHaveLength(12);
    expect(messagesToSummarize(justOver)).toEqual([]);
    expect(messagesToSummarize(settled(9)).length).toBeGreaterThanOrEqual(CONVERSATION_LIMITS.summarizeAfter);
  });

  it("writes the summary from a bounded amount of text, folding in the summary so far", () => {
    const source = summarySource("They were choosing an opener.", settled(30, 5000));
    expect(source.startsWith("SUMMARY SO FAR\nThey were choosing an opener.\n\nMESSAGES TO ADD\n")).toBe(true);
    expect(source).toContain("PERSON: Question 1?");
    expect(source).toContain("CONDUCTOR: Answer 1.");
    expect(source.length).toBeLessThan(CONVERSATION_LIMITS.summarySourceTotal + 200);
    expect(summarySource(null, settled(1))).not.toContain("SUMMARY SO FAR");
  });

  it("is only ever a summary: told to add nothing, and stored within its limit", () => {
    expect(SUMMARY_INSTRUCTIONS).toContain("Only what the messages say. Add nothing, infer nothing");
    expect(SUMMARY_INSTRUCTIONS).toContain("they will be looked up again");
    expect(normalizeSummary("  They chose hymn 95.  ")).toBe("They chose hymn 95.");
    expect(normalizeSummary("   ")).toBeNull();
    expect(normalizeSummary("x".repeat(5000))).toHaveLength(CONVERSATION_LIMITS.summaryChars);
  });
});
