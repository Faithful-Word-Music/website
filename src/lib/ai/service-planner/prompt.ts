import { z } from "zod";

import { memoryBlock } from "../context/authority";
import { NO_MEMORY, type MemoryContext } from "../memory/memory";
import type { PlanBrief } from "./brief";

/**
 * What the model is told when it plans a service, and the shape its answer
 * must have. Pure - unit tested.
 *
 * THE PLANNING PHILOSOPHY IS NOT WRITTEN HERE. It is the philosophy in force
 * (src/lib/ai/planning: the latest version kept in the database), handed in
 * whole and word for word by whoever calls plannerInstructions(). What this file adds
 * is only what the document cannot know: what a lock is, what the answer must
 * look like, which facts the model has, and what it must not make up.
 *
 * Nothing here mentions the Service Planner's "sung recently" notice
 * (siteConfig.servicePlanner.recentDays). That is a check the planner shows a
 * person, not the Director's policy: the model gets the dates and decides by
 * the philosophy.
 *
 * The part that is the same for every request comes first, so a provider that
 * caches a repeated beginning can reuse it.
 */

const RULES = `You help the Music Director of a church plan the congregational songs of one service, in the website's Service Planner. You propose; the Director reads your proposal, changes what they like, and saves and publishes it themselves. Nothing you answer is saved.

WHAT DECIDES, MOST IMPORTANT FIRST

1. The limits of the request. You may only use songs from CANDIDATES, named by their id exactly as given. No song may be in the service twice, counting the songs in places you cannot change. These limits, and anything the philosophy calls a hard rule, hold whatever else is said.
2. The Director's locks. A place marked "locked" is not yours: its song stays in that place, exactly as it is. Do not answer for it, do not move its song, and do not use its song anywhere else. A lock outranks DIRECTION: if DIRECTION asks to change a locked song, leave it and say so in your summary.
3. DIRECTION, when there is one: what the Director asks for this one service. It may set aside one of the philosophy's preferences for this service. It cannot unlock a song, add to CANDIDATES, or set aside a hard rule.
4. The Music Director's planning philosophy, given below word for word. It governs every choice the three above leave open. A rule in it is hard only where it says so (must, required, a hard rule); everything else is a preference to weigh. Do not add rules, numbers or limits to it.
5. MEMORY, when there is any: things people have explicitly asked to be remembered, shared by the ministry or personal to this Director. It is context to weigh within everything above, never a rule, and how to weigh it is said with it.
6. Your own judgement, for whatever is still open.

THE PLACES

- "empty": choose a song for it.
- "open": it has a song that you MAY change. How readily is said under MODE. To keep it, answer with its id for its place. A place marked mustChange cannot keep its song.
- A song in an open place may be moved to another open place by answering with its id there.

THE WEEK'S INSERTS

- A place marked insert holds one of the week's inserts: a song chosen ahead for the whole week and sung in every service of it. A week has one, and sometimes two. They are decided before this service is planned; plan around them.
- An insert in a locked place is not yours at all. One in an open place stays where it is, by answering with its id for its place, unless DIRECTION plainly asks for this service to go without it or to use a different one. Being unlocked is not such a request.
- An insert is a song with no hymnal number. The candidates marked insert are exactly those songs, and they are there only for a place marked insert. Never put one in any other place, whatever DIRECTION says, and never give the service more inserts than it has: do not add one. When DIRECTION asks for the service to go without an insert, put an ordinary candidate in its place.

WHAT YOU KNOW

Only what this message gives you. About each candidate: how many times this church has sung it in its records, when it was last sung and how many days before this service that is, how often in the year before, where else it is planned, whether it is in another service of this week, and how its lyrics begin.

- timesSung is evidence that a song is familiar. It is not evidence that it is loved or popular. timesSung 0 means it is not in these records, which begin on the date given; it does not mean the congregation has never sung it.
- The days since a song was sung are a fact, not a rule. There is no minimum gap unless the philosophy states one.
- You have no information about any song's tempo, energy, style, difficulty, harmony, key or arrangement. Do not state or imply any. Judge what a song is about from its title and the lyrics given, and say no more than those support.
- Keys are not yours to choose; the site sets them.
- SEASON gives the dates the philosophy's seasonal guidance turns on, and which of them this service falls in.
- THIS WEEK lists the other services of the same week, so that this one can differ from them as the philosophy asks.

YOUR SUMMARY

Two or three plain sentences to the Director: what you changed or kept and why, in terms of the facts given and the philosophy. No list of every song. Never claim a musical quality or that a song is a favourite.`;

/** The standing instructions: the rules above, then the philosophy exactly as its document has it. */
export function plannerInstructions(philosophyMarkdown: string): string {
  return `${RULES}

THE MUSIC DIRECTOR'S PLANNING PHILOSOPHY (word for word)

${philosophyMarkdown}`;
}

const SEASON_NAMES = {
  christmas: "the Christmas season",
  thanksgiving: "the days before Thanksgiving",
  "before-easter": "the week leading up to Easter",
  easter: "Easter Sunday",
} as const;

const block = (title: string, value: unknown) => `${title}\n${typeof value === "string" ? value : JSON.stringify(value)}`;

/**
 * The parts of a request every prompt carries: the service, its season, its
 * places, the week, the candidates - and the memories that apply, with how to
 * weigh them (src/lib/ai/context/authority.ts), when there are any.
 */
function facts(brief: PlanBrief, memory: MemoryContext): string[] {
  const { christmasSeason, easter, thanksgiving } = brief.seasonDates;
  const remembered = memoryBlock(memory, "MEMORY");
  return [
    block("SERVICE", { date: brief.service.date, service: brief.service.name, ...(brief.service.special ? { special: true } : {}) }),
    block("SEASON", {
      thisService: brief.season ? SEASON_NAMES[brief.season] : "none: an ordinary service",
      thanksgivingDay: thanksgiving,
      christmasSeason,
      easterSunday: easter,
      ...(brief.christmasOnly ? { note: "Every candidate below has been established as a Christmas song." } : {}),
    }),
    block("PLACES", brief.places),
    block("THIS WEEK", brief.week.length > 0 ? brief.week : "No other service of this week has songs yet."),
    block(
      "RECORDS",
      `${brief.recordsBegin ? `The records of what has been sung begin ${brief.recordsBegin}.` : "There are no records of what has been sung."}${
        brief.lyricsIndexed ? "" : " The lyrics are not indexed, so no candidate carries its lyrics: judge from titles and history, and say less."
      }`,
    ),
    block("CANDIDATES", brief.candidates),
    ...(remembered ? [remembered] : []),
  ];
}

/**
 * The two ways a whole service is planned, as the model is told them. The
 * place rules in RULES are the same for both; this is the only thing that
 * differs, so it travels with the request and the rules stay one cached text.
 */
const MODES = {
  improve:
    "Improve the plan as it stands. The song in an open place is a real candidate for it: keeping it is a real choice, and the right one whenever it already serves the service well. Change a place only when another candidate would clearly make the service better. Changing nothing at all is a valid answer.",
  fresh:
    "A new plan. Build this service afresh around the locked songs and the week's inserts. Every empty place is yours to choose from CANDIDATES on its merits, by the philosophy. You are not told what stood in these places before, and nothing is owed to it.",
} as const;

/** The request to plan the whole service. */
export function generatePrompt(brief: PlanBrief, memory: MemoryContext = NO_MEMORY): string {
  return [
    ...facts(brief, memory),
    block("MODE", MODES[brief.strategy]),
    block(
      "DIRECTION",
      brief.instruction === ""
        ? "None. Plan by the philosophy."
        : // Marked off, so what the Director typed is read as their wish for this service and nothing more.
          `The Director's own words, between the marks:\n<<<\n${brief.instruction}\n>>>`,
    ),
    `ANSWER\nGive one entry for each of these places and no other: ${brief.open.map((index) => index + 1).join(", ")}.`,
  ].join("\n\n");
}

/** How many songs a request for suggestions asks for. */
export const SUGGESTIONS = 3;

/** The request for a few songs that could go in one place, the rest of the service staying as it is. */
export function replacePrompt(brief: PlanBrief, memory: MemoryContext = NO_MEMORY): string {
  const place = brief.places[(brief.target ?? 1) - 1];
  return [
    ...facts(brief, memory),
    block(
      "DIRECTION",
      `The Director is choosing a song for place ${brief.target} only${
        place?.song ? `, in place of "${place.song.title}"` : ", which is empty"
      }. Every other place stays as it stands, locked or not. Suggest ${SUGGESTIONS} different candidates that would serve the service well there, the best first, each with one plain sentence saying why in terms of the facts given and the philosophy. Do not suggest a song already in the service.${
        brief.insertPlaces.length > 0
          ? " This place holds one of the week's inserts, so candidates marked insert may be suggested for it."
          : " This is not an insert's place: do not suggest a candidate marked insert."
      }`,
    ),
  ].join("\n\n");
}

/** A repeat of a request whose answer broke a rule: what was wrong, to be put right. */
export function withCorrections(prompt: string, problems: readonly string[]): string {
  return `${prompt}\n\nYOUR LAST ANSWER COULD NOT BE USED\n${problems.map((problem) => `- ${problem}`).join("\n")}\nAnswer again, following every limit above.`;
}

/** An id the model may answer with: one of those offered, and nothing else. */
const songId = (ids: readonly string[]) => (ids.length > 0 ? z.enum(ids as [string, ...string[]]) : z.string());

/** The shape of a generated plan. The ids are held to the ones offered. */
export function generateSchema(ids: readonly string[]) {
  return z.object({
    places: z.array(z.object({ place: z.number(), songId: songId(ids) })),
    summary: z.string(),
  });
}

export function replaceSchema(ids: readonly string[]) {
  return z.object({
    suggestions: z.array(z.object({ songId: songId(ids), reason: z.string() })),
  });
}

export type GeneratedPlan = z.infer<ReturnType<typeof generateSchema>>;
export type SuggestedSongs = z.infer<ReturnType<typeof replaceSchema>>;
