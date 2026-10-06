import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config/site";
import type { AiErrorCode } from "@/lib/ai/errors";
import { buildCandidates, candidateFacts } from "@/lib/service-planner/intelligence";
import type { PlanSlots, PlanSong } from "@/lib/service-planner/model";
import type { DatedService } from "@/types/song-list";

import { buildBrief, buildShortlist, describeCandidate, NO_LIBRARY, SHORTLIST, type LibraryFindings, type PlanContext } from "./brief";
import { linkLibrary } from "./library";
import { isAiLocked, lockedPlaces, locksAfterGeneration, openPlaces, toggleAiLock } from "./locks";
import { CONTEXT_SOURCES } from "../context/authority";
import { NO_MEMORY, type MemoryContext } from "../memory/memory";
import { PLAN_LIMITS, planWithAi, type PlanDeps, type PlanStandingContext, type PlanViewer } from "./plan";
import { generatePrompt, generateSchema, plannerInstructions, replacePrompt, withCorrections } from "./prompt";
import { planAiMessage, planAiRequestSchema, planAiStatus, type PlanAiRequest } from "./protocol";
import { christmasEligible, serviceSeason } from "./season";
import { applyPlan, applySuggestions } from "./validate";

// ---------------------------------------------------------------------------
// A small church: a few familiar hymns, two Psalms used as inserts, a Christmas
// repertoire sung only in December, and songs nobody has sung yet.
// ---------------------------------------------------------------------------

const HYMNAL = siteConfig.sheetMusic.hymnalCollection;

const SONGS: Record<string, { number: string | null; key: string | null }> = {
  "Amazing Grace": { number: "330", key: "G" },
  "Victory in Jesus": { number: "100", key: "Bb" },
  "Blessed Assurance": { number: "200", key: "D" },
  "At Calvary": { number: "150", key: "C" },
  "Holy, Holy, Holy": { number: "1", key: "Eb" },
  "Rarely Sung": { number: "50", key: "F" },
  "Never Sung": { number: "60", key: "A" },
  "Psalm 23": { number: null, key: "F" },
  "Psalm 100": { number: null, key: "G" },
  "Joy to the World": { number: "400", key: "D" },
  "Silent Night": { number: "401", key: "Bb" },
  "Away in a Manger": { number: "402", key: "F" },
  "O Little Town": { number: "403", key: "F" },
};

const id = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function sung(date: string, titles: string[], slot: "AM" | "PM" = "AM"): DatedService {
  return {
    date,
    slot,
    startsAt: `${date}T${slot === "AM" ? "10:30" : "18:00"}:00-07:00`,
    songs: titles.map((title) => ({ title, number: SONGS[title].number, key: SONGS[title].key })),
  };
}

const FAMILIAR = ["Amazing Grace", "Victory in Jesus", "Blessed Assurance", "At Calvary", "Holy, Holy, Holy"];
const past: DatedService[] = [
  sung("2025-12-07", ["Joy to the World", "Silent Night"]),
  sung("2025-12-14", ["Joy to the World", "Silent Night"]),
  sung("2026-05-03", ["Rarely Sung"]),
  sung("2026-06-07", FAMILIAR),
  sung("2026-07-05", FAMILIAR),
  sung("2026-08-02", FAMILIAR),
  sung("2026-08-09", ["Psalm 100"]),
  sung("2026-09-06", ["Psalm 23"]),
];

const candidates = buildCandidates({
  past,
  planned: [],
  catalog: Object.entries(SONGS).map(([title, song]) => ({ title, number: song.number, collection: HYMNAL, defaultKey: song.key })),
  index: null,
  hymnalCollection: HYMNAL,
});

const song = (title: string, key: string | null = SONGS[title].key): PlanSong => ({ title, number: SONGS[title].number, key, insert: false });
const insert = (title: string): PlanSong => ({ ...song(title), insert: true });

const STARTS = "2026-10-11T10:30:00-07:00";
const context = (overrides: Partial<PlanContext> = {}): PlanContext => ({
  service: { date: "2026-10-11", slot: "AM", startsAt: STARTS, label: null, special: false },
  revision: 3,
  cancelled: false,
  frozen: false,
  candidates,
  past,
  week: [],
  ...overrides,
});
const december = (overrides: Partial<PlanContext> = {}) =>
  context({ service: { date: "2026-12-06", slot: "AM", startsAt: "2026-12-06T10:30:00-08:00", label: null, special: false }, ...overrides });

/** A request as the workspace sends it: locks at their defaults unless given. */
function request(slots: PlanSlots, options: Partial<Pick<PlanAiRequest, "mode" | "instruction" | "target" | "revision">> & { locked?: boolean[] } = {}): PlanAiRequest {
  return planAiRequestSchema.parse({
    mode: options.mode ?? "generate",
    anchor: "2026-10-11-am",
    revision: options.revision === undefined ? 3 : options.revision,
    slots,
    locked: options.locked ?? lockedPlaces(slots, {}),
    instruction: options.instruction,
    target: options.target,
  });
}

/** The usual service: two empty places, the insert third, a song chosen fourth, the closer empty. */
const usual = (): PlanSlots => [null, null, insert("Psalm 23"), song("At Calvary"), null];

const brief = (slots: PlanSlots, options: Parameters<typeof request>[1] = {}, ctx = context(), library: LibraryFindings = NO_LIBRARY) =>
  buildBrief(request(slots, options), ctx, library, HYMNAL);

const place = (number: number, title: string) => ({ place: number, songId: id(title) });
const plan = (places: Array<{ place: number; songId: string }>, differentInsert = false) => ({ places, differentInsert, summary: "Kept it familiar." });

// ---------------------------------------------------------------------------

describe("AI locks", () => {
  it("locks the insert by default and nothing else", () => {
    expect(isAiLocked(insert("Psalm 23"), {})).toBe(true);
    expect(isAiLocked(song("Amazing Grace"), {})).toBe(false);
    expect(isAiLocked(null, {})).toBe(false);
    expect(lockedPlaces(usual(), {})).toEqual([false, false, true, false, false]);
  });

  it("treats a hymn from the hymnal in the insert's place as an ordinary song", () => {
    expect(isAiLocked({ ...song("Amazing Grace"), insert: true }, {})).toBe(false);
  });

  it("turns a lock the other way, by song, so it follows the song when it moves", () => {
    const unlocked = toggleAiLock(insert("Psalm 23"), {});
    expect(isAiLocked(insert("Psalm 23"), unlocked)).toBe(false);
    const locked = toggleAiLock(song("At Calvary"), unlocked);
    expect(lockedPlaces([song("At Calvary"), null, insert("Psalm 23")], locked)).toEqual([true, false, false]);
    expect(isAiLocked(song("At Calvary"), toggleAiLock(song("At Calvary"), locked))).toBe(false);
  });

  it("keeps the person's locks after a generation and leaves what AI put in unlocked", () => {
    const choices = toggleAiLock(song("At Calvary"), {});
    const after: PlanSlots = [song("Amazing Grace"), song("Victory in Jesus"), insert("Psalm 100"), song("At Calvary"), null];
    const next = locksAfterGeneration(choices, after, [0, 1, 2]);
    expect(lockedPlaces(after, next)).toEqual([false, false, false, true, false]);
  });

  it("answers for every place that is not locked, and holds an unlocked insert when nothing was asked", () => {
    const slots = usual();
    expect(openPlaces(slots, [false, false, true, false, false], true)).toEqual([0, 1, 3, 4]);
    expect(openPlaces(slots, [false, false, false, false, false], true)).toEqual([0, 1, 3, 4]);
    expect(openPlaces(slots, [false, false, false, false, false], false)).toEqual([0, 1, 2, 3, 4]);
    expect(openPlaces(slots, [true, true, true, true, true], false)).toEqual([0, 1, 4]);
  });
});

describe("the season of a service", () => {
  it("knows the days before Thanksgiving, the Christmas season, the week before Easter and Easter", () => {
    expect(serviceSeason("2026-10-11")).toBeNull();
    expect(serviceSeason("2026-11-15")).toBeNull();
    expect(serviceSeason("2026-11-22")).toBe("thanksgiving");
    expect(serviceSeason("2026-11-25")).toBe("thanksgiving");
    expect(serviceSeason("2026-11-27")).toBe("christmas");
    expect(serviceSeason("2026-12-25")).toBe("christmas");
    expect(serviceSeason("2026-12-27")).toBeNull();
    expect(serviceSeason("2026-03-22")).toBeNull();
    expect(serviceSeason("2026-03-29")).toBe("before-easter");
    expect(serviceSeason("2026-04-01")).toBe("before-easter");
    expect(serviceSeason("2026-04-05")).toBe("easter");
    expect(serviceSeason("2026-04-08")).toBeNull();
  });

  it("establishes a Christmas song from the records or from its own lyrics, and from nothing less", () => {
    const eligible = christmasEligible({ candidates, past, nativity: new Set([id("Away in a Manger"), id("At Calvary")]) });
    // Sung, and only ever in the season.
    expect(eligible.has(id("Joy to the World"))).toBe(true);
    // Never sung here, but its lyrics name the Nativity.
    expect(eligible.has(id("Away in a Manger"))).toBe(true);
    // Never sung, and nothing to go on.
    expect(eligible.has(id("O Little Town"))).toBe(false);
    // Mentions the Nativity, but is sung all year.
    expect(eligible.has(id("At Calvary"))).toBe(false);
    expect(eligible.has(id("Amazing Grace"))).toBe(false);
    expect(eligible.has(id("Psalm 23"))).toBe(false);
  });

  it("stops counting a song as a Christmas song once it is sung at another time of year", () => {
    const eligible = christmasEligible({ candidates, past: [...past, sung("2026-07-12", ["Joy to the World"])], nativity: new Set() });
    expect(eligible.has(id("Joy to the World"))).toBe(false);
    expect(eligible.has(id("Silent Night"))).toBe(true);
  });
});

describe("the library's songs tied to the planner's", () => {
  const lib = (songId: string, title: string, collection: string | null, hymnNumber: string | null, status: "indexed" | "no_source" = "indexed") => ({
    songId,
    title,
    titleKey: id(title),
    collection,
    hymnNumber,
    status,
  });

  it("finds a song by its title, or by its number in the church's hymnal", () => {
    const links = linkLibrary(
      candidates,
      [lib("S1", "Amazing Grace", HYMNAL, "330"), lib("S2", "Victory in Jesus!", HYMNAL, "0100"), lib("S3", "Unknown Song", HYMNAL, "999"), lib("S4", "Other", "Another Book", "330")],
      HYMNAL,
    );
    expect(links.candidateOf.get("S1")).toBe(id("Amazing Grace"));
    expect(links.candidateOf.get("S2")).toBe(id("Victory in Jesus"));
    expect(links.candidateOf.has("S3")).toBe(false);
    // A number in another book is not this hymnal's number.
    expect(links.candidateOf.has("S4")).toBe(false);
  });

  it("stands a song printed in several books for the copy the church sings from", () => {
    const links = linkLibrary(candidates, [lib("X9", "Amazing Grace", "Another Book", "12"), lib("S1", "Amazing Grace", HYMNAL, "330")], HYMNAL);
    expect(links.songOf.get(id("Amazing Grace"))?.songId).toBe("S1");
    expect(links.candidateOf.get("X9")).toBe(id("Amazing Grace"));
  });
});

describe("the candidates", () => {
  const many = buildCandidates({
    past: Array.from({ length: 4 }, (_, week) => ({
      date: `2026-0${week + 3}-01`,
      slot: "AM" as const,
      startsAt: `2026-0${week + 3}-01T10:30:00-07:00`,
      songs: Array.from({ length: 200 }, (_, n) => ({ title: `Hymn ${n}`, number: String(n + 1), key: "C" })),
    })),
    planned: [],
    catalog: Array.from({ length: 40 }, (_, n) => ({ title: `Unsung ${n}`, number: null, collection: null, defaultKey: null })),
    index: null,
    hymnalCollection: HYMNAL,
  });

  it("are a bounded shortlist, however large the library", () => {
    const list = buildShortlist({ candidates: many, startsAt: STARTS, fixed: new Set(), keepable: [], thematic: [], christmasOnly: null });
    expect(list.length).toBeLessThanOrEqual(SHORTLIST.total);
    expect(list.length).toBeGreaterThan(40);
    expect(new Set(list.map((item) => item.id)).size).toBe(list.length);
  });

  it("always include the songs that may be kept, and never a song that cannot be moved", () => {
    const kept = many.find((item) => item.id === "unsung 7")!;
    const list = buildShortlist({ candidates: many, startsAt: STARTS, fixed: new Set(["hymn 0"]), keepable: [kept], thematic: [], christmasOnly: null });
    expect(list[0]).toBe(kept);
    expect(list.some((item) => item.id === "hymn 0")).toBe(false);
  });

  it("take songs found by meaning, but only a few that have never been sung", () => {
    const thematic = many.filter((item) => item.playCount === 0).map((item) => item.id);
    const list = buildShortlist({ candidates: many, startsAt: STARTS, fixed: new Set(), keepable: [], thematic, christmasOnly: null });
    expect(list.filter((item) => item.playCount === 0)).toHaveLength(SHORTLIST.neverSung);
  });

  it("leave Christmas songs out of an ordinary service, and offer nothing else in the Christmas season", () => {
    const ordinary = buildShortlist({ candidates, startsAt: STARTS, fixed: new Set(), keepable: [], thematic: [], christmasOnly: null });
    expect(ordinary.some((item) => item.id === id("Joy to the World"))).toBe(false);
    expect(ordinary.some((item) => item.id === id("Amazing Grace"))).toBe(true);

    const eligible = christmasEligible({ candidates, past, nativity: new Set() });
    const season = buildShortlist({ candidates, startsAt: STARTS, fixed: new Set(), keepable: [], thematic: [], christmasOnly: eligible });
    expect(season.map((item) => item.id).sort()).toEqual([id("Joy to the World"), id("Silent Night")]);
  });

  it("carry the facts, looking from the service: dates in church time, days, the week", () => {
    const amazing = candidates.find((item) => item.id === id("Amazing Grace"))!;
    const described = describeCandidate(amazing, {
      startsAt: STARTS,
      hymnal: HYMNAL,
      week: [{ date: "2026-10-11", service: "Sunday evening", status: "draft", songs: [{ title: "Amazing Grace" }] }],
      openings: new Map([[amazing.id, "Amazing grace, how sweet the sound"]]),
    });
    expect(described).toEqual({
      id: "amazing grace",
      title: "Amazing Grace",
      number: "330",
      timesSung: 3,
      lastSung: "2026-08-02",
      daysBeforeThisService: 70,
      timesInTheYearBefore: 3,
      inThisWeek: ["Sunday evening"],
      lyricsBegin: "Amazing grace, how sweet the sound",
    });
    // No key: the model does not choose keys.
    expect(JSON.stringify(described)).not.toContain('"key"');
  });
});

describe("the brief", () => {
  it("opens every unlocked place, and holds an unlocked insert unless something was asked", () => {
    const unlocked = [false, false, false, false, false];
    expect(brief(usual()).open).toEqual([0, 1, 3, 4]);
    expect(brief(usual(), { locked: unlocked }).open).toEqual([0, 1, 3, 4]);
    const asked = brief(usual(), { locked: unlocked, instruction: "Skip the insert for this service." });
    expect(asked.open).toEqual([0, 1, 2, 3, 4]);
    expect(asked.insertPlace).toBe(2);
    expect(asked.offered.has(id("Psalm 23"))).toBe(true);
  });

  it("never offers a song in a place that cannot change, and always one that may be kept", () => {
    const made = brief(usual());
    expect(made.offered.has(id("Psalm 23"))).toBe(false);
    expect(made.offered.has(id("At Calvary"))).toBe(true);
    expect(made.places).toEqual([
      { place: 1, state: "empty" },
      { place: 2, state: "empty" },
      { place: 3, state: "locked", song: { id: "psalm 23", title: "Psalm 23", number: null, insert: true } },
      { place: 4, state: "open", song: { id: "at calvary", title: "At Calvary", number: "150" } },
      { place: 5, state: "empty" },
    ]);
  });

  it("can keep a song the catalog does not know", () => {
    const slots: PlanSlots = [{ title: "A Brand New Song", number: null, key: "E", insert: false }, null];
    const made = brief(slots);
    expect(made.offered.has("a brand new song")).toBe(true);
    const applied = applyPlan(made, plan([{ place: 1, songId: "a brand new song" }, place(2, "Amazing Grace")]));
    expect(applied.ok && applied.slots[0]).toBe(made.slots[0]);
  });

  it("for a replacement opens only the place asked about, and offers nothing already in the service", () => {
    const slots: PlanSlots = [song("Amazing Grace"), song("Victory in Jesus"), insert("Psalm 23"), song("At Calvary"), null];
    const made = brief(slots, { mode: "replace", target: 3 });
    expect(made.open).toEqual([3]);
    expect(made.target).toBe(4);
    for (const title of ["Amazing Grace", "Victory in Jesus", "Psalm 23", "At Calvary"]) expect(made.offered.has(id(title))).toBe(false);
    expect(made.offered.has(id("Blessed Assurance"))).toBe(true);
  });

  it("in the Christmas season offers only Christmas songs and says which songs cannot stay", () => {
    const slots: PlanSlots = [song("Amazing Grace"), song("Silent Night"), insert("Psalm 23"), null];
    const made = brief(slots, {}, december(), { ...NO_LIBRARY, nativity: new Set([id("Away in a Manger")]) });
    expect(made.season).toBe("christmas");
    expect([...made.offered].sort()).toEqual([id("Away in a Manger"), id("Joy to the World"), id("Silent Night")]);
    expect(made.places[0].mustChange).toBe(true);
    expect(made.places[1].mustChange).toBeUndefined();
  });

  it("says when the records begin and whether lyrics were to hand", () => {
    expect(brief(usual()).recordsBegin).toBe("2025-12-07");
    expect(brief(usual()).lyricsIndexed).toBe(false);
  });
});

describe("what the model is told", () => {
  const philosophy = readFileSync(join(process.cwd(), "src/content/music-planning-philosophy.md"), "utf8").replace(/\r\n?/g, "\n").trim();

  it("carries the Music Director's philosophy whole, word for word", () => {
    const instructions = plannerInstructions(philosophy);
    expect(instructions.endsWith(philosophy)).toBe(true);
    expect(instructions).toContain("must use **only Christmas songs**");
  });

  it("does not turn the planner's 'sung recently' notice into a rule", () => {
    const rules = plannerInstructions("");
    const days = String(siteConfig.servicePlanner.recentDays);
    expect(rules).not.toMatch(new RegExp(`\\b${days}\\b`));
    expect(rules).not.toMatch(/fourteen|two weeks/i);
    expect(rules).toContain("no minimum gap unless the philosophy states one");
    const prompt = generatePrompt(brief(usual()));
    expect(prompt).not.toContain("recentDays");
    expect(prompt).not.toContain("recently-sung");
  });

  it("puts locks above the instruction, and the instruction above the philosophy", () => {
    const rules = plannerInstructions("");
    const at = (words: string) => rules.indexOf(words);
    expect(at("The Director's locks")).toBeGreaterThan(0);
    expect(at("The Director's locks")).toBeLessThan(at("DIRECTION, when there is one"));
    expect(at("DIRECTION, when there is one")).toBeLessThan(at("planning philosophy, given below"));
    expect(rules).toContain("A lock outranks DIRECTION");
  });

  it("says keeping an unlocked song is a real choice", () => {
    expect(plannerInstructions("")).toContain("You do not have to. Keeping it is a real choice");
  });

  it("gives the service, the season's dates, the week, the places to answer for and the instruction", () => {
    const week = [{ date: "2026-10-11", service: "Sunday evening", status: "draft" as const, songs: [{ title: "Amazing Grace" }] }];
    const prompt = generatePrompt(brief(usual(), { instruction: "Keep this one especially familiar." }, context({ week })));
    expect(prompt).toContain('"service":"Sunday morning"');
    expect(prompt).toContain('"thanksgivingDay":"2026-11-26"');
    expect(prompt).toContain('"easterSunday":"2026-04-05"');
    expect(prompt).toContain("Sunday evening");
    expect(prompt).toContain("<<<\nKeep this one especially familiar.\n>>>");
    expect(prompt).toContain("Give one entry for each of these places and no other: 1, 2, 4, 5.");
    expect(prompt).toContain("The records of what has been sung begin 2025-12-07.");
  });

  it("says so when nothing was asked, and never sends a key", () => {
    const prompt = generatePrompt(brief(usual()));
    expect(prompt).toContain("DIRECTION\nNone. Plan by the philosophy.");
    expect(prompt).not.toContain('"key"');
  });

  it("asks for a replacement for one place only", () => {
    const prompt = replacePrompt(brief([song("Amazing Grace"), null], { mode: "replace", target: 0 }));
    expect(prompt).toContain('place 1 only, in place of "Amazing Grace"');
    expect(replacePrompt(brief([song("Amazing Grace"), null], { mode: "replace", target: 1 }))).toContain("place 2 only, which is empty");
  });

  it("holds the answer's ids to the candidates offered", () => {
    const schema = generateSchema([id("Amazing Grace"), id("At Calvary")]);
    expect(schema.safeParse(plan([place(1, "Amazing Grace")])).success).toBe(true);
    expect(schema.safeParse(plan([{ place: 1, songId: "a song that does not exist" }])).success).toBe(false);
    expect(schema.safeParse({ places: "Amazing Grace" }).success).toBe(false);
  });

  it("sends back what was wrong for the second try", () => {
    expect(withCorrections("PROMPT", ["Place 3 is not one of the places to answer for."])).toContain("- Place 3 is not one of the places to answer for.");
  });
});

describe("holding the answer to the rules", () => {
  const full = () => plan([place(1, "Amazing Grace"), place(2, "Victory in Jesus"), place(4, "At Calvary"), place(5, "Blessed Assurance")]);

  it("fills the empty places from the catalog, with the planner's own keys", () => {
    const made = brief(usual());
    const applied = applyPlan(made, full());
    expect(applied).toEqual({
      ok: true,
      changed: [0, 1, 4],
      slots: [song("Amazing Grace"), song("Victory in Jesus"), insert("Psalm 23"), song("At Calvary"), song("Blessed Assurance")],
    });
    const amazing = candidates.find((item) => item.id === id("Amazing Grace"))!;
    expect(applied.ok && applied.slots[0]?.key).toBe(candidateFacts(amazing, STARTS).suggestedKey);
    expect(applied.ok && applied.slots[0]?.key).toBe("G");
  });

  it("never changes a locked place: the song, its key and its mark are the very ones sent", () => {
    const slots: PlanSlots = [song("Holy, Holy, Holy", "D"), null, insert("Psalm 23"), song("At Calvary"), null];
    const made = brief(slots, { locked: [true, false, true, false, false], instruction: "Replace the opener." });
    const applied = applyPlan(made, plan([place(2, "Amazing Grace"), place(4, "Victory in Jesus"), place(5, "Blessed Assurance")]));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.slots[0]).toBe(made.slots[0]);
    expect(applied.slots[0]?.key).toBe("D");
    expect(applied.slots[2]).toBe(made.slots[2]);
    expect(applied.changed).toEqual([1, 3, 4]);
  });

  it("refuses an answer for a locked place, even when the instruction asked for it", () => {
    const slots: PlanSlots = [song("Holy, Holy, Holy"), null];
    const made = brief(slots, { locked: [true, false], instruction: "Replace the opener." });
    const applied = applyPlan(made, plan([place(1, "Amazing Grace"), place(2, "Victory in Jesus")]));
    expect(applied).toEqual({ ok: false, problems: ["Place 1 is not one of the places to answer for."] });
  });

  it("keeps an unlocked song exactly as it was when the model keeps it, key and all", () => {
    const slots: PlanSlots = [null, song("At Calvary", "Db")];
    const made = brief(slots);
    const applied = applyPlan(made, plan([place(1, "Amazing Grace"), place(2, "At Calvary")]));
    expect(applied.ok && applied.slots[1]).toBe(made.slots[1]);
    expect(applied.ok && applied.changed).toEqual([0]);
  });

  it("changes an unlocked song when the model chooses another", () => {
    const applied = applyPlan(brief([song("At Calvary"), null]), plan([place(1, "Amazing Grace"), place(2, "Victory in Jesus")]));
    expect(applied.ok && applied.slots.map((item) => item?.title)).toEqual(["Amazing Grace", "Victory in Jesus"]);
    expect(applied.ok && applied.changed).toEqual([0, 1]);
  });

  it("reports no change when everything is kept", () => {
    const slots: PlanSlots = [song("Amazing Grace"), song("At Calvary")];
    const applied = applyPlan(brief(slots), plan([place(1, "Amazing Grace"), place(2, "At Calvary")]));
    expect(applied.ok && applied.changed).toEqual([]);
  });

  it("moves a song between open places with its key", () => {
    const slots: PlanSlots = [song("At Calvary", "Db"), song("Amazing Grace")];
    const made = brief(slots);
    const applied = applyPlan(made, plan([place(1, "Amazing Grace"), place(2, "At Calvary")]));
    expect(applied.ok && applied.slots).toEqual([made.slots[1], made.slots[0]]);
  });

  it("refuses a place left out, a place answered twice and a place that does not exist", () => {
    const made = brief(usual());
    expect(applyPlan(made, plan([place(1, "Amazing Grace"), place(2, "Victory in Jesus"), place(4, "At Calvary")]))).toEqual({
      ok: false,
      problems: ["Place 5 was not answered."],
    });
    const twice = applyPlan(made, plan([place(1, "Amazing Grace"), place(1, "Victory in Jesus"), place(2, "Blessed Assurance"), place(4, "At Calvary"), place(5, "Holy, Holy, Holy")]));
    expect(twice).toEqual({ ok: false, problems: ["Place 1 was answered more than once."] });
    const beyond = applyPlan(made, plan([...full().places, place(9, "Holy, Holy, Holy")]));
    expect(beyond).toEqual({ ok: false, problems: ["Place 9 is not one of the places to answer for."] });
  });

  it("refuses a song that was not offered: an invented title, or a real song outside the candidates", () => {
    const made = brief(usual());
    const invented = applyPlan(made, plan([{ place: 1, songId: "great is thy faithfulness" }, place(2, "Victory in Jesus"), place(4, "At Calvary"), place(5, "Blessed Assurance")]));
    expect(invented).toEqual({ ok: false, problems: ['"great is thy faithfulness" is not the id of a candidate.', "Place 1 was not answered."] });
    // A Christmas song is a real song, but not a candidate in October.
    const outside = applyPlan(made, plan([place(1, "Joy to the World"), place(2, "Victory in Jesus"), place(4, "At Calvary"), place(5, "Blessed Assurance")]));
    expect(outside.ok).toBe(false);
  });

  it("refuses the same song twice, and a song already in a locked place", () => {
    const made = brief(usual());
    const twice = applyPlan(made, plan([place(1, "Amazing Grace"), place(2, "Amazing Grace"), place(4, "At Calvary"), place(5, "Blessed Assurance")]));
    expect(twice).toEqual({ ok: false, problems: ['"amazing grace" (place 2) would be in the service twice.'] });

    const locked = brief([song("Amazing Grace"), null], { locked: [true, false] });
    // It was never offered, so it cannot be named.
    expect(applyPlan(locked, plan([place(2, "Amazing Grace")])).ok).toBe(false);
  });

  describe("the insert", () => {
    const unlocked = [false, false, false, false, false];
    const skip = "Skip the insert for this service and use a regular hymn in this position.";
    const answer = (third: string, differentInsert = false) =>
      plan([place(1, "Amazing Grace"), place(2, "Victory in Jesus"), place(3, third), place(4, "At Calvary"), place(5, "Blessed Assurance")], differentInsert);

    it("stays, unlocked or not, when nothing was asked: its place is not even open", () => {
      const made = brief(usual(), { locked: unlocked });
      expect(applyPlan(made, answer("Holy, Holy, Holy"))).toEqual({ ok: false, problems: ["Place 3 is not one of the places to answer for."] });
      const applied = applyPlan(made, plan([place(1, "Amazing Grace"), place(2, "Victory in Jesus"), place(4, "At Calvary"), place(5, "Blessed Assurance")]));
      expect(applied.ok && applied.slots[2]).toBe(made.slots[2]);
    });

    it("is kept as the insert when the model keeps it", () => {
      const made = brief(usual(), { locked: unlocked, instruction: "Give me a stronger opener." });
      const applied = applyPlan(made, answer("Psalm 23"));
      expect(applied.ok && applied.slots[2]).toBe(made.slots[2]);
      expect(applied.ok && applied.changed).toEqual([0, 1, 4]);
    });

    it("gives way to a regular hymn when asked, and that hymn is not an insert", () => {
      const made = brief(usual(), { locked: unlocked, instruction: skip });
      const applied = applyPlan(made, answer("Holy, Holy, Holy"));
      expect(applied.ok && applied.slots[2]).toEqual({ title: "Holy, Holy, Holy", number: "1", key: "Eb", insert: false });
      expect(applied.ok && applied.slots.some((item) => item?.insert)).toBe(false);
    });

    it("is never replaced by a hymnal hymn marked as an insert, whatever the model says", () => {
      const applied = applyPlan(brief(usual(), { locked: unlocked, instruction: skip }), answer("Holy, Holy, Holy", true));
      expect(applied.ok && applied.slots[2]?.insert).toBe(false);
    });

    it("can be a different insert for this one service only when asked for", () => {
      const made = brief(usual(), { locked: unlocked, instruction: "Use Psalm 100 as the insert for this service only." });
      const applied = applyPlan(made, answer("Psalm 100", true));
      expect(applied.ok && applied.slots[2]).toEqual({ title: "Psalm 100", number: null, key: "G", insert: true });
      // Without the model saying so, another Psalm in its place is an ordinary song.
      const plain = applyPlan(made, answer("Psalm 100"));
      expect(plain.ok && plain.slots[2]?.insert).toBe(false);
    });

    it("works wherever the insert sits", () => {
      const slots: PlanSlots = [insert("Psalm 23"), null, null];
      const made = brief(slots);
      expect(made.open).toEqual([1, 2]);
      const applied = applyPlan(made, plan([place(2, "Amazing Grace"), place(3, "At Calvary")]));
      expect(applied.ok && applied.slots[0]).toBe(made.slots[0]);
    });
  });

  describe("the Christmas season", () => {
    const library = { ...NO_LIBRARY, nativity: new Set([id("Away in a Manger")]) };
    const slots = (): PlanSlots => [null, null, insert("Psalm 23"), null];

    it("takes only songs established as Christmas songs", () => {
      const made = brief(slots(), {}, december(), library);
      const applied = applyPlan(made, plan([place(1, "Joy to the World"), place(2, "Away in a Manger"), place(4, "Silent Night")]));
      expect(applied.ok && applied.slots.map((item) => item?.title)).toEqual(["Joy to the World", "Away in a Manger", "Psalm 23", "Silent Night"]);
    });

    it("refuses an ordinary hymn, even one the model was somehow able to name", () => {
      const made = brief(slots(), {}, december(), library);
      // As if it had been offered: the rule is checked on its own, not left to the list.
      const offered = { ...made, offered: new Set([...made.offered, id("Amazing Grace")]), songs: new Map([...made.songs, [id("Amazing Grace"), candidates.find((item) => item.id === id("Amazing Grace"))!]]) };
      const applied = applyPlan(offered, plan([place(1, "Joy to the World"), place(2, "Amazing Grace"), place(4, "Silent Night")]));
      expect(applied).toEqual({
        ok: false,
        problems: ['"amazing grace" (place 2) is not established as a Christmas song, and this service is in the Christmas season.'],
      });
    });

    it("lets the week's insert stay in its own place, though it is no Christmas song", () => {
      const made = brief(slots(), { locked: [false, false, false, false], instruction: "Keep the insert." }, december(), library);
      const applied = applyPlan(made, plan([place(1, "Joy to the World"), place(2, "Away in a Manger"), place(3, "Psalm 23"), place(4, "Silent Night")]));
      expect(applied.ok && applied.slots[2]).toBe(made.slots[2]);
    });

    it("does not let an unlocked ordinary song stay", () => {
      const made = brief([song("Amazing Grace"), null], {}, december(), library);
      expect(made.offered.has(id("Amazing Grace"))).toBe(false);
      expect(applyPlan(made, plan([place(1, "Amazing Grace"), place(2, "Silent Night")])).ok).toBe(false);
    });

    it("leaves a locked ordinary song alone: a lock is the person's own choice", () => {
      const made = brief([song("Amazing Grace"), null], { locked: [true, false] }, december(), library);
      const applied = applyPlan(made, plan([place(2, "Silent Night")]));
      expect(applied.ok && applied.slots[0]).toBe(made.slots[0]);
    });
  });

  describe("suggestions for one place", () => {
    const slots = (): PlanSlots => [song("Amazing Grace"), song("At Calvary"), null];
    const made = () => brief(slots(), { mode: "replace", target: 1 });
    const suggestion = (title: string, reason = "It follows the opener naturally.") => ({ songId: id(title), reason });

    it("are the site's own records of the songs, with the planner's key", () => {
      const applied = applySuggestions(made(), { suggestions: [suggestion("Victory in Jesus"), suggestion("Blessed Assurance")] });
      expect(applied).toEqual({
        ok: true,
        suggestions: [
          { title: "Victory in Jesus", number: "100", key: "Bb", reason: "It follows the opener naturally.", lastSung: "2026-08-02T10:30:00-07:00" },
          { title: "Blessed Assurance", number: "200", key: "D", reason: "It follows the opener naturally.", lastSung: "2026-08-02T10:30:00-07:00" },
        ],
      });
    });

    it("drop a song already in the service, one not offered and one given twice, and stop at three", () => {
      const applied = applySuggestions(made(), {
        suggestions: [
          suggestion("Amazing Grace"),
          { songId: "an invented song", reason: "" },
          suggestion("Victory in Jesus"),
          suggestion("Victory in Jesus"),
          suggestion("Blessed Assurance"),
          suggestion("Holy, Holy, Holy"),
          suggestion("Rarely Sung"),
        ],
      });
      expect(applied.ok && applied.suggestions.map((item) => item.title)).toEqual(["Victory in Jesus", "Blessed Assurance", "Holy, Holy, Holy"]);
    });

    it("are refused when none can be used", () => {
      expect(applySuggestions(made(), { suggestions: [suggestion("Amazing Grace")] })).toEqual({ ok: false, problems: ['"amazing grace" is already in the service.'] });
      expect(applySuggestions(made(), { suggestions: [] })).toEqual({ ok: false, problems: ["No song was suggested."] });
    });
  });
});

// ---------------------------------------------------------------------------
// One request, start to finish, with the server's reads and the model stood in for.
// ---------------------------------------------------------------------------

type Answer = unknown | { fails: AiErrorCode };

function harness(
  answers: Answer[],
  options: { context?: PlanContext | null; library?: LibraryFindings; philosophy?: string | null; memory?: MemoryContext; recent?: number; loadThrows?: boolean } = {},
) {
  const seen = { asked: [] as Array<{ prompt: string; instructions: string }>, loads: 0, requests: 0, failed: [] as AiErrorCode[] };
  const deps: PlanDeps<PlanViewer> = {
    hymnal: HYMNAL,
    context: async () => ({
      philosophy: options.philosophy === undefined ? "## Purpose\n\nSing out." : options.philosophy,
      memory: options.memory ?? NO_MEMORY,
    }),
    load: async () => {
      seen.loads += 1;
      if (options.loadThrows) throw new Error("database down");
      return options.context === undefined ? context() : options.context;
    },
    library: async () => options.library ?? NO_LIBRARY,
    // As the AI layer does: an answer that does not fit the schema is "invalid-response".
    ask: async ({ prompt, instructions, schema }) => {
      seen.asked.push({ prompt, instructions });
      const next = answers.shift();
      if (next && typeof next === "object" && "fails" in next) return { ok: false, code: (next as { fails: AiErrorCode }).fails };
      const parsed = schema.safeParse(next);
      return parsed.success ? { ok: true, object: parsed.data } : { ok: false, code: "invalid-response" };
    },
    recentRequests: async () => options.recent ?? 0,
    asOneRequest: async (_viewer, _feature, work) => {
      seen.requests += 1;
      return work();
    },
    fail: (code) => {
      seen.failed.push(code);
    },
  };
  return { deps, seen };
}

const viewer = (...permissions: string[]): PlanViewer => ({ userId: "user_1", can: (permission) => permissions.includes(permission) });
const director = viewer("manage_service_plans", "use_ai");
const good = () => plan([place(1, "Amazing Grace"), place(2, "Victory in Jesus"), place(4, "At Calvary"), place(5, "Blessed Assurance")]);

describe("a request to plan with AI", () => {
  it("needs both manage_service_plans and use_ai, and reads nothing without them", async () => {
    for (const who of [viewer(), viewer("use_ai"), viewer("manage_service_plans"), viewer("view_sheet_music", "manage_availability")]) {
      const { deps, seen } = harness([good()]);
      expect(await planWithAi(who, request(usual()), deps)).toEqual({ ok: false, problem: "forbidden" });
      expect(seen).toMatchObject({ loads: 0, requests: 0, asked: [] });
    }
  });

  it("fills a partly built service and returns it for the editor, as one request", async () => {
    const { deps, seen } = harness([good()]);
    const sent = request(usual());
    const result = await planWithAi(director, sent, deps);
    expect(result).toEqual({
      ok: true,
      mode: "generate",
      slots: [song("Amazing Grace"), song("Victory in Jesus"), insert("Psalm 23"), song("At Calvary"), song("Blessed Assurance")],
      changed: [0, 1, 4],
      summary: "Kept it familiar.",
      lyricsUsed: false,
    });
    expect(seen.requests).toBe(1);
    expect(seen.asked).toHaveLength(1);
    expect(seen.failed).toEqual([]);
    // The request itself is untouched: nothing but the answer says what changed.
    expect(sent.slots[0]).toBeNull();
  });

  it("plans an empty service and a full one", async () => {
    const empty = await planWithAi(director, request([null, null]), harness([plan([place(1, "Amazing Grace"), place(2, "At Calvary")])]).deps);
    expect(empty.ok && empty.mode === "generate" && empty.slots.map((item) => item?.title)).toEqual(["Amazing Grace", "At Calvary"]);

    const slots: PlanSlots = [song("Amazing Grace"), song("At Calvary")];
    const full = await planWithAi(director, request(slots), harness([plan([place(1, "Amazing Grace"), place(2, "Victory in Jesus")])]).deps);
    expect(full.ok && full.mode === "generate" && full.changed).toEqual([1]);
  });

  it("makes no AI call when every song is locked", async () => {
    const slots: PlanSlots = [song("Amazing Grace"), song("Victory in Jesus"), insert("Psalm 23")];
    const { deps, seen } = harness([good()]);
    expect(await planWithAi(director, request(slots, { locked: [true, true, true] }), deps)).toEqual({ ok: false, problem: "nothing-to-change" });
    expect(seen).toMatchObject({ loads: 0, requests: 0, asked: [] });
    // The insert unlocked, with nothing asked, is still held: there is still nothing to change.
    expect((await planWithAi(director, request(slots, { locked: [true, true, false] }), deps)).ok).toBe(false);
    expect(seen.asked).toEqual([]);
  });

  it("plans around a heavily locked service, leaving every locked song as it was", async () => {
    const slots: PlanSlots = [song("Holy, Holy, Holy", "D"), song("Amazing Grace"), insert("Psalm 23"), song("At Calvary"), null];
    const { deps, seen } = harness([plan([place(5, "Blessed Assurance")])]);
    const result = await planWithAi(director, request(slots, { locked: [true, true, true, true, false] }), deps);
    expect(result.ok && result.mode === "generate" && result.slots).toEqual([...slots.slice(0, 4), song("Blessed Assurance")]);
    expect(seen.asked[0].prompt).toContain("Give one entry for each of these places and no other: 5.");
  });

  it("gives the model the philosophy, the instruction and the week", async () => {
    const week = [{ date: "2026-10-14", service: "Wednesday evening", status: "planned" as const, songs: [{ title: "Victory in Jesus" }] }];
    const { deps, seen } = harness([good()], { context: context({ week }), philosophy: "## Purpose\n\nThe congregation should sing out." });
    await planWithAi(director, request(usual(), { instruction: "Lean toward salvation." }), deps);
    expect(seen.asked[0].instructions).toContain("The congregation should sing out.");
    expect(seen.asked[0].prompt).toContain("Lean toward salvation.");
    expect(seen.asked[0].prompt).toContain("Wednesday evening");
    expect(seen.asked[0].prompt).toContain('"inThisWeek":["Wednesday evening"]');
  });

  it("gives the model the memories that apply, each under its own scope, below the philosophy", async () => {
    const remembered = (id: number, scope: "personal" | "global", text: string) => ({
      id,
      scope,
      ownerUserId: scope === "personal" ? "user_1" : null,
      text,
      category: null,
      createdBy: "user_1",
      updatedBy: "user_1",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    const memory: MemoryContext = {
      global: [remembered(1, "global", "The congregation knows hymn 95 extremely well.")],
      personal: [remembered(2, "personal", "I like hymn 95 as an opening hymn.")],
    };
    const cases: Array<[PlanAiRequest, Answer]> = [
      [request(usual()), good()],
      [request(usual(), { mode: "replace", target: 0 }), { suggestions: [{ songId: id("Amazing Grace"), reason: "Familiar." }] }],
    ];
    for (const [sent, answer] of cases) {
      const { deps, seen } = harness([answer], { memory });
      await planWithAi(director, sent, deps);
      const { prompt, instructions } = seen.asked[0];
      expect(prompt).toContain("MEMORY");
      expect(prompt).toContain("Global memory (shared by the whole ministry):\n- The congregation knows hymn 95 extremely well.");
      expect(prompt).toContain("Personal memory (saved by the person you are helping, for themselves only):\n- I like hymn 95 as an opening hymn.");
      // How to weigh it travels with it: never above a lock, a hard rule or the philosophy.
      expect(prompt).toContain("They never outrank the limits of the request, a lock, a hard rule or the planning philosophy.");
      const at = (text: string) => instructions.indexOf(text);
      expect(at("planning philosophy, given below")).toBeLessThan(at("MEMORY, when there is any"));
      expect(at("MEMORY, when there is any")).toBeLessThan(at("Your own judgement"));
    }
  });

  it("says nothing about memory when there is none, and can never be handed a conversation", async () => {
    const { deps, seen } = harness([good()]);
    await planWithAi(director, request(usual()), deps);
    expect(seen.asked[0].prompt).not.toContain("MEMORY");
    // What a planning request plans from: the philosophy and memory. Nothing said to Conductor has a place in it.
    const standing: PlanStandingContext = { philosophy: "## Purpose\n\nSing out.", memory: NO_MEMORY };
    expect(Object.keys(standing).sort()).toEqual(["memory", "philosophy"]);
    for (const feature of ["generate_service_plan", "replace_song"] as const) {
      expect(CONTEXT_SOURCES[feature]).toEqual({ philosophy: "whole", globalMemory: true, personalMemory: true, conversation: false });
    }
  });

  it("asks once more, saying what was wrong, when the answer breaks a rule", async () => {
    const twice = plan([place(1, "Amazing Grace"), place(2, "Amazing Grace"), place(4, "At Calvary"), place(5, "Blessed Assurance")]);
    const { deps, seen } = harness([twice, good()]);
    const result = await planWithAi(director, request(usual()), deps);
    expect(result.ok).toBe(true);
    expect(seen.asked).toHaveLength(2);
    expect(seen.asked[1].prompt).toContain("YOUR LAST ANSWER COULD NOT BE USED");
    expect(seen.asked[1].prompt).toContain("would be in the service twice");
    expect(seen.requests).toBe(1);
  });

  it("gives up after a second unusable answer, and returns no songs at all", async () => {
    const locked = plan([...good().places, place(3, "Holy, Holy, Holy")]);
    const { deps, seen } = harness([locked, locked]);
    const result = await planWithAi(director, request(usual()), deps);
    expect(result).toEqual({ ok: false, problem: "unusable" });
    expect(seen.asked).toHaveLength(PLAN_LIMITS.attempts);
    expect(seen.failed).toEqual(["invalid-response"]);
  });

  it("treats a malformed or invented answer the same way", async () => {
    const invented = plan([{ place: 1, songId: "a hymn that does not exist" }, place(2, "Victory in Jesus"), place(4, "At Calvary"), place(5, "Blessed Assurance")]);
    const recovered = harness(["Here is a lovely plan!", good()]);
    expect((await planWithAi(director, request(usual()), recovered.deps)).ok).toBe(true);
    expect(recovered.seen.asked).toHaveLength(2);

    const never = harness([invented, { places: [] }]);
    expect(await planWithAi(director, request(usual()), never.deps)).toEqual({ ok: false, problem: "unusable" });
  });

  it("does not try again when AI itself is unavailable", async () => {
    for (const code of ["budget", "timeout", "not-configured", "provider"] as const) {
      const { deps, seen } = harness([{ fails: code }, good()]);
      expect(await planWithAi(director, request(usual()), deps)).toEqual({ ok: false, problem: "ai", code });
      expect(seen.asked).toHaveLength(1);
      expect(seen.failed).toEqual([code]);
    }
  });

  it("refuses a service that is gone, cancelled, frozen, changed by someone else or unreadable, before asking", async () => {
    const cases: Array<[Parameters<typeof harness>[1], string]> = [
      [{ context: null }, "not-found"],
      [{ context: context({ cancelled: true }) }, "cancelled"],
      [{ context: context({ frozen: true }) }, "locked-service"],
      [{ context: context({ revision: 4 }) }, "conflict"],
      [{ context: context({ revision: null }) }, "conflict"],
      [{ loadThrows: true }, "unavailable"],
      [{ philosophy: null }, "no-philosophy"],
      [{ recent: PLAN_LIMITS.perHour }, "hourly"],
    ];
    for (const [options, problem] of cases) {
      const { deps, seen } = harness([good()], options);
      expect(await planWithAi(director, request(usual()), deps)).toEqual({ ok: false, problem });
      expect(seen.asked).toEqual([]);
    }
  });

  it("plans a service that has never been saved", async () => {
    const { deps } = harness([good()], { context: context({ revision: null }) });
    expect((await planWithAi(director, request(usual(), { revision: null }), deps)).ok).toBe(true);
  });

  it("in the Christmas season refuses, without asking, when too few Christmas songs are known", async () => {
    const slots: PlanSlots = [null, null, insert("Psalm 23"), null];
    const short = harness([good()], { context: december() });
    expect(await planWithAi(director, request(slots), short.deps)).toEqual({ ok: false, problem: "christmas-short" });
    expect(short.seen.asked).toEqual([]);

    const enough = harness([plan([place(1, "Joy to the World"), place(2, "Away in a Manger"), place(4, "Silent Night")])], {
      context: december(),
      library: { lyricsIndexed: true, thematic: [], openings: new Map(), nativity: new Set([id("Away in a Manger")]) },
    });
    const result = await planWithAi(director, request(slots), enough.deps);
    expect(result.ok && result.mode === "generate" && result.lyricsUsed).toBe(true);
    expect(enough.seen.asked[0].prompt).toContain("the Christmas season");
    expect(enough.seen.asked[0].prompt).not.toContain("Amazing Grace");
  });

  it("tells the model which season a Thanksgiving or Easter service falls in", async () => {
    const at = (date: string) => context({ service: { date, slot: "AM", startsAt: `${date}T10:30:00-07:00`, label: null, special: false } });
    const thanksgiving = harness([good()], { context: at("2026-11-22") });
    await planWithAi(director, request(usual()), thanksgiving.deps);
    expect(thanksgiving.seen.asked[0].prompt).toContain('"thisService":"the days before Thanksgiving"');
    const easter = harness([good()], { context: at("2027-03-28") });
    await planWithAi(director, request(usual()), easter.deps);
    expect(easter.seen.asked[0].prompt).toContain('"thisService":"Easter Sunday"');
    expect(easter.seen.asked[0].prompt).toContain('"easterSunday":"2027-03-28"');
  });

  it("names a special service as one", async () => {
    const special = context({ service: { date: "2026-10-16", slot: "PM", startsAt: "2026-10-16T19:00:00-07:00", label: "Missions Conference", special: true } });
    const { deps, seen } = harness([plan([place(1, "Amazing Grace"), place(2, "At Calvary")])], { context: special });
    expect((await planWithAi(director, request([null, null]), deps)).ok).toBe(true);
    expect(seen.asked[0].prompt).toContain('"service":"Missions Conference (Friday evening)","special":true');
  });

  describe("for a replacement", () => {
    const slots = (): PlanSlots => [song("Amazing Grace"), song("At Calvary"), insert("Psalm 23")];
    const answer = { suggestions: [{ songId: id("Victory in Jesus"), reason: "It carries the opener's thought on." }] };

    it("suggests songs for one place and changes nothing", async () => {
      const { deps, seen } = harness([answer]);
      const result = await planWithAi(director, request(slots(), { mode: "replace", target: 1 }), deps);
      expect(result).toMatchObject({ ok: true, mode: "replace", suggestions: [{ title: "Victory in Jesus", number: "100", key: "Bb" }] });
      expect(result).not.toHaveProperty("slots");
      expect(seen.asked[0].prompt).toContain('place 2 only, in place of "At Calvary"');
    });

    it("does not suggest for a locked song until it is unlocked", async () => {
      const { deps, seen } = harness([answer]);
      expect(await planWithAi(director, request(slots(), { mode: "replace", target: 2 }), deps)).toEqual({ ok: false, problem: "target-locked" });
      expect(seen).toMatchObject({ loads: 0, asked: [] });
      const unlocked = await planWithAi(director, request(slots(), { mode: "replace", target: 2, locked: [false, false, false] }), deps);
      expect(unlocked.ok).toBe(true);
    });

    it("needs both permissions too", async () => {
      const { deps } = harness([answer]);
      expect(await planWithAi(viewer("manage_service_plans"), request(slots(), { mode: "replace", target: 1 }), deps)).toEqual({ ok: false, problem: "forbidden" });
    });
  });
});

describe("the request and its failures", () => {
  const body = { mode: "generate", anchor: "2026-10-11-am", revision: null, slots: [null, song("Amazing Grace")], locked: [false, false] };

  it("accepts the editor's songs, locks and an optional instruction", () => {
    const parsed = planAiRequestSchema.parse(body);
    expect(parsed.instruction).toBe("");
    expect(planAiRequestSchema.parse({ ...body, instruction: "  Keep it familiar.  " }).instruction).toBe("Keep it familiar.");
  });

  it("refuses what is not a request", () => {
    expect(planAiRequestSchema.safeParse({ ...body, locked: [false] }).success).toBe(false);
    expect(planAiRequestSchema.safeParse({ ...body, anchor: "next sunday" }).success).toBe(false);
    expect(planAiRequestSchema.safeParse({ ...body, slots: [] , locked: [] }).success).toBe(false);
    expect(planAiRequestSchema.safeParse({ ...body, instruction: "x".repeat(601) }).success).toBe(false);
    expect(planAiRequestSchema.safeParse({ ...body, mode: "replace" }).success).toBe(false);
    expect(planAiRequestSchema.safeParse({ ...body, mode: "replace", target: 2 }).success).toBe(false);
    expect(planAiRequestSchema.safeParse({ ...body, mode: "publish" }).success).toBe(false);
  });

  it("has words and a status for every failure", () => {
    expect(planAiStatus({ ok: false, problem: "signed-out" })).toBe(401);
    expect(planAiStatus({ ok: false, problem: "forbidden" })).toBe(403);
    expect(planAiStatus({ ok: false, problem: "conflict" })).toBe(409);
    expect(planAiStatus({ ok: false, problem: "ai", code: "rate-limited" })).toBe(429);
    expect(planAiMessage({ ok: false, problem: "ai", code: "budget" })).toContain("budget");
    expect(planAiMessage({ ok: false, problem: "nothing-to-change" })).toContain("Every song is locked");
    expect(planAiMessage({ ok: false, problem: "christmas-short" })).toContain("Christmas");
  });
});
