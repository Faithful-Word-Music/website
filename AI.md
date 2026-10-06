# Faithful Word Music AI

The internal AI system of the Faithful Word Music website: where it stands, how it is built, and what each phase adds. For the rest of the site see [README.md](./README.md).

## Status

| Phase | What | Status |
|---|---|---|
| **1** | **AI foundation:** the shared AI layer, the `use_ai` permission, the usage log, Admin → AI | **Complete** (2026-10-05) |
| **2** | **Conductor:** the assistant. Read-only tools over the site's own data, streaming, the Conductor page and the floating panel | **Complete** (2026-10-05) |
| **3** | **Library Intelligence:** the songs' lyrics read from the MuseScore files, a persistent index in Neon, embeddings, exact and by-theme search, the lyric tools; usage counted per Gateway call | **Complete** (2026-10-05) |
| **4** | **Planning Intelligence:** the Music Director's planning philosophy as one document in the repository, a shared loader for every AI feature, and Conductor's tool for reading it | **Complete** (2026-10-05) |
| **5** | **AI-assisted planning:** **Generate with AI** and **Suggest with AI** in the Service Planner, per-song AI locks, structured output in the shared layer | **Complete** (2026-10-05) |
| **6** | **Persistence, memory and a configurable philosophy:** Conductor's conversations saved, Personal and Global memory saved only on a person's say-so, the planning philosophy edited on the site with a history, one shared context layer | **Complete** (2026-10-05) |

**Phase 6 completes the initial Faithful Word Music AI project.** Nothing further is planned as part of it; anything more is a new phase, added on purpose. The songs' **chords** (in the Chords files, as their own elements beside the lyrics) could be read into the same index if a later feature needs harmony.

**Not built, on purpose:** anything about the music itself (notes, rhythm, harmony, chords, transposition, reading a PDF), anything that lets AI **save or publish** a service plan (it proposes songs to the editor and nothing more), anything that lets AI save a memory or change the philosophy **by itself** (it proposes; a person approves), notifications, model routing, scheduled indexing jobs.

**Phase 6 in one page** is the section [Persistence, memory and configuration](#persistence-memory-and-configuration-phase-6) below. Where an earlier section says something Phase 6 changed, it has been corrected in place.

## Conductor

**Conductor** is the site's AI assistant ("Faithful Word Music AI Assistant" where a longer name helps). It is for the Music Director and administrators while they plan and review congregational singing, and answers two kinds of question:

- **About this church's music** (when a song was last sung, how often, in what key, what was sung at a service, what is planned, what goes together, whether something is being repeated too soon, **and what a song says**: a verse, a phrase, its themes, songs like it): **only from the site's own data, through tools.** The model interprets and explains what a tool returned; it never supplies a date, count, key, song or lyric from memory.
- **About how to plan** (what the planning philosophy says, whether a song suits a place, whether two songs sit well together, why a service may feel repetitive): from the **Music Director's planning philosophy**, read through a tool, together with the records and lyrics above. It says which part is the record, which is the philosophy and which is its own recommendation.
- **About music in general** (theory, arranging, instruments, audio, equipment): from the model's own knowledge.

It only reads, with one exception that is not its own doing: it can **propose** saving, changing or forgetting a memory, or changing a section of the planning philosophy. A proposal is a card; only the person's choice on the card writes anything.

## Architecture

```
Conductor page (/conductor)        floating panel (every other signed-in page)
        │                                   │   drawer on wide screens, sheet on phones
        └────────────┬──────────────────────┘
                     ▼
   src/components/conductor/conductor-store.ts     ONE conversation per tab (sessionStorage)
                     │  POST { messages, context }
                     ▼
   src/app/api/conductor/route.ts                  checks use_ai · validates the body
                     ▼
   src/lib/ai/conductor/conductor.ts               hourly cap · trims history · instructions · tools
                     ▼
   src/lib/ai/service.ts  streamAiText()           the ONLY file that calls the AI SDK
     checks use_ai again · bounded model calls     · never throws · one ai_usage row
        │                         │
        ▼                         ▼
   Vercel AI Gateway         tools.ts ─┬─ facts.ts → the site's own read layer
   → the model (AI_MODEL)              │   (song-archive, schedule, song-stats, service-archive,
   → the embedding model               │    service-planner/intelligence, year-recap)
     (AI_EMBEDDING_MODEL)              ├─ lyrics.ts → src/lib/library-content (the library index)
                                       └─ src/lib/ai/planning → src/content/music-planning-philosophy.md
```

The library index is filled separately, by hand, from Admin → AI:

```
Sheet Music Index + Drive listing     the site's existing, cached read (sheet-music-index.ts)
        │  plan.ts         what does each song need?   <- no file opened
        ▼
only changed Standard .mscz files     readDriveFile(), a few at a time
        │  musescore.ts    the lyric syllables of the score
        │  lyrics.ts       verses, refrain, sections; folded text; hashes
        ▼
library_songs · library_song_sections         (store.ts, Neon)
        ▼
texts with no vector from the current model → embedAiValues() → library_embeddings (pgvector)
```

| File | Job |
|---|---|
| `src/lib/ai/service.ts` | `generateAiText()` (one prompt, one answer), `generateAiObject()` (one prompt, answered as data in a zod schema's shape), `streamAiText()` (a conversation, with tools, streamed), `embedAiValues()` (texts to vectors), `withAiOperation()` (several calls as one logged request) and `failAiOperation()`, `backfillAiCosts()` (server-only) |
| `src/lib/ai/service-planner/` | Generate with AI and Suggest with AI: see **AI-assisted planning** below |
| `src/lib/ai/stream.ts` | The stream's wire format: one JSON event per line (pure) |
| `src/lib/ai/store.ts` | `ai_usage` and `ai_usage_calls`: `recordAiUsage()`, `countRecentAiUsage()`, the summaries Admin → AI reads (server-only) |
| `src/lib/ai/conductor/lyrics.ts` | The index's rows → small, bounded lyric results, each joined to the song's history (pure) |
| `src/lib/library-content/musescore.ts` | `readMscz()`, `extractLyrics()`: the lyric syllables of a `.mscz` (pure) |
| `src/lib/library-content/lyrics.ts` | Syllables → verses, refrain, sections; `searchText()`; hashes; what is embedded; `PARSER_VERSION` (pure) |
| `src/lib/library-content/plan.ts` | `lyricsSource()`, `songWork()`: what a refresh must do for a song, from the Drive listing alone (pure) |
| `src/lib/library-content/directory.ts` | Finding the song meant; folding one song's copies in several books (pure) |
| `src/lib/library-content/indexer.ts` | `refreshLibraryIndex()`, `getLibraryIndexStatus()` (server-only) |
| `src/lib/library-content/store.ts` | The `library_*` tables: writes, counts, phrase and vector queries (server-only) |
| `src/lib/library-content/search.ts` | `searchLyrics()` (literal), `searchByTheme()` and `similarSongs()` (by meaning) (server-only) |
| `src/content/music-planning-philosophy.md` | The Music Director's planning philosophy: the one source, edited by hand |
| `src/lib/ai/planning/philosophy.ts` | `parsePlanningPhilosophy()`, `selectSections()`, `planningGuidance()`, `philosophyOutline()`: the document as its own sections (pure) |
| `src/lib/ai/planning/load.ts` | `loadPlanningPhilosophy()`: read from disk once per server, never throws (server-only) |
| `src/lib/church-calendar.ts` | `thanksgiving()`, `christmasSeason()`, `easter()`, `seasonDates()`: the dates the seasonal guidance turns on (pure) |
| `src/lib/ai/config.ts`, `settings.ts`, `features.ts`, `errors.ts`, `usage.ts`, `format.ts` | Configuration, feature keys, failure codes, token and cost arithmetic (as in Phase 1) |
| `src/lib/ai/conductor/conductor.ts` | `answerConductor()`: one question, start to finish (server-only) |
| `src/lib/ai/conductor/tools.ts` | The tool definitions: names, descriptions, zod input schemas (server-only) |
| `src/lib/ai/conductor/data.ts` | `loadConductorData()`: one read of history, plans and catalog per question (server-only) |
| `src/lib/ai/conductor/facts.ts` | Domain data → small, bounded tool results (pure) |
| `src/lib/ai/conductor/instructions.ts` | What Conductor is told: the grounding rule, its limits, the calendar (pure) |
| `src/lib/ai/conductor/context.ts` | Page context: from a path, validated, described (pure) |
| `src/lib/ai/conductor/limits.ts` | Every bound, `trimConversation()`, `clampToolResult()` (pure) |
| `src/lib/ai/conductor/protocol.ts` | The request body's schema (pure) |
| `src/lib/ai/conductor/session.ts` | The conversation's reducer and how it is stored (pure) |
| `src/lib/ai/conductor/drawer.ts` | The panel's width: default, bounds, clamping, storage (pure) |
| `src/lib/ai/conductor/markdown.ts` | The little Markdown answers use, parsed to data (pure) |
| `src/components/conductor/` | `conductor-store.ts`, `ConductorChat`, `ConductorDock` (launcher, drawer, sheet), `ConductorWorkspace` (the page), `ConductorMarkdown`, `ConductorMark` |
| `src/content/conductor.ts` | Every word of Conductor's interface |
| `src/content/ai.ts` | Failure wording by code, and Admin → AI |

### Rules for anything added later

1. **Never import `ai` or `@ai-sdk/*` outside `src/lib/ai/`.** ESLint refuses it. That is why there is no `useChat`: the browser reads the site's own stream format. New capabilities (structured output, embeddings) are further functions in `service.ts`.
2. **Check `use_ai` where the request arrives**, and let the service check again.
3. **Name the feature** in `AI_FEATURES` before its first request. Conductor is `assistant`.
4. **Facts come from the site's data, through tools.** A new kind of fact is a new tool over an existing read function, never a prompt that asks the model to remember.
5. **Tools read, or propose. They never write what they propose.** A propose tool records one waiting row of `conductor_actions` and shows a card; the write happens in `resolveAction()` on the person's choice, with their permissions checked then, through the same function the manual page uses. Generate with AI still only returns songs to the editor.
6. **Never store prompts, answers or tool results in `ai_usage`.** Conversations have their own tables, private to one person (questions and answers as text; never a tool's input or result).
7. **Words go in `src/content/`**, and a provider's own error text never reaches the browser.
8. **One request, however many calls.** Anything that calls the Gateway more than once does it inside one logged request: a tool's embedding joins the answer's row by itself, and work that is only its calls is wrapped in `withAiOperation()`.
9. **Exact words are matched as text; meaning is matched by embeddings.** Neither stands in for the other.
10. **The planning philosophy has one source.** Every feature reads the version in force (the latest row of `planning_philosophy_revisions`) through `loadPlanningPhilosophy(env)`, or through `assembleAiContext()` which calls it. No prompt, tool description or constant restates what it says, and no code turns one of its preferences into a number. The one thing code does enforce is what the document itself calls a hard rule (Christmas songs only in the Christmas season, for what AI puts into a plan).
11. **Standing context comes from `src/lib/ai/context/`.** A feature says what it may be given in `CONTEXT_SOURCES` and asks `assembleAiContext()`; it does not load memory or the philosophy its own way. Only Conductor is ever given a conversation.
12. **Private rows are reached as a person.** Every conversation, message, proposal and personal-memory query takes the user ID and matches it in SQL. Never add a "by id" read without the owner.
13. **The model chooses by id; the site writes the plan.** A structured answer names songs by the ids it was offered. Titles, numbers, keys and the insert mark come from the site's own records, and an answer is checked in code before any of it reaches the browser.

## Tools

All in `src/lib/ai/conductor/tools.ts`. Each is one question the site can already answer; there is no SQL or general query tool. Inputs are validated with zod before a tool runs. Results are plain objects with capped lists (`truncated: true` when cut), bounded to `toolResultChars`. Dates are `YYYY-MM-DD` in church time (never the first ten characters of a timestamp: the archive stores instants in UTC, where a Wednesday evening is already Thursday).

| Tool | Answers | Built on |
|---|---|---|
| `find_songs` | Which song is meant; its number, times sung, last sung | `buildSongRecords`, `matchesSong`, the planner catalog |
| `get_song` | Last and first sung, counts, keys used, rank, how often it comes round, usual service and place, songs habitually sung with it, the whole service it was last in, latest dates, where it is planned | `buildSongStats`, `buildCompanions` |
| `count_song_uses` | Times sung between two dates, with dates and keys | `usageCount` |
| `get_services_on_date` | The songs of the service(s) on a date, past or planned | the history, the schedule, `serviceOccurrences` |
| `list_services` | Services in a range, by kind or containing a song (12 at most) | `toArchive`, `filterArchive` |
| `list_upcoming_services` | What is planned from today, or where a song is planned | the schedule (and drafts, for a planner) |
| `song_usage` | Most or least used songs in a period | `buildSongRecords`, `usageCount` |
| `songs_not_sung_recently` | Songs gone quiet and not planned | `buildSongRecords`, `christmasSongs` |
| `get_year_summary` | A year in song | `buildYearRecap` |
| `check_song_for_service` | Would this song be repeated too soon there, or is it planned nearby | `buildCandidates`, `candidateFacts`, `servicePlanner.recentDays` |
| `check_service_plan` | What the Service Planner itself notices about a **saved** plan, and who is expected | `loadWorkspace`, `serviceSignals` (exactly as the workspace computes them) |

**The lyric tools** (Phase 3), over the library index:

| Tool | Answers | Built on |
|---|---|---|
| `get_song_lyrics` | One song's words in order: its verses and refrain, or only one verse or the refrain | `resolveLibrarySong`, `getSongSections`, `songLyrics` |
| `find_lyrics` | Which songs contain an **exact phrase** (and, when none does, every one of its words in any order). Text matching: no model, no cost | `searchLyrics` → `findPhrase`, `findWords` |
| `search_songs_by_theme` | Songs **about** something, ranked by closeness of meaning, optionally only those not sung for N days or only those sung before | `searchByTheme` → `embedAiValues`, `nearestTo` |
| `find_similar_songs` | Songs whose words are closest to one song's, with the same narrowing | `similarSongs` → `nearestSongs` (no Gateway call) |

**The planning tool** (Phase 4), over the planning philosophy:

| Tool | Answers | Built on |
|---|---|---|
| `get_planning_philosophy` | What the Music Director's planning philosophy says: the sections named, or the whole document, word for word; and the dates of Thanksgiving, the Christmas season and Easter | `loadPlanningPhilosophy`, `planningGuidance`, `seasonDates` |

Every lyric result carries each song's history from the same data the other tools read (`timesSung`, `lastSung`, `daysSinceLastSung`, `plannedFor`), so "songs about heaven we have not sung recently" is one grounded call. A song printed in several books is listed once, as the copy the church sings from (its hymnal, then the Psalms and Other Songs, then other hymnals), with `alsoIn` naming the rest. A song without indexed lyrics answers `lyricsIndexed: false` and why; before the index has ever been built every lyric tool says so.

One song may be asked for by title, part of a title or hymnal number. When more than one fits, the tool returns the candidates and the model asks; it never picks.

A tool that cannot read its data returns `{ unavailable: true }` and the model says so. The browser is told only a status key while a tool runs ("Checking the song history…", "Reading the lyrics…"); tool names, inputs and results never leave the server.

**Adding a tool family:** another group in `tools.ts` over its own read functions, a status key in `src/content/conductor.ts`, and a paragraph in `instructions.ts`. Nothing else changes.

## Library Intelligence

### What is indexed

- **Every song of the Sheet Music Index** (each Songs-tab row, by Song ID): all the hymnals, the Psalms, Other Songs. Copyrighted or not: the index is read only by people holding `use_ai`, and nothing in it reaches a public page.
- **Its lyrics come only from its Standard MuseScore file** (`siteConfig.sheetMusic.lyricsType`, matched to the type set up under Admin → Configuration), lowest version first. The Chords, Capo and instrument files carry the same words and are never read, not even as a fallback. PDFs are never read; there is no OCR.
- A song with no Standard `.mscz` is `no_source`; one whose file has no lyrics typed in is `no_lyrics`; one whose file cannot be fetched or parsed is `failed` (tried again at each refresh). A file that matches no Songs row is not a song of the Index and is not indexed, as everywhere else on the site.

At the first refresh (October 2026): 563 songs in the Index, 488 indexed into 2,164 sections, 75 with no Standard MuseScore file.

### How lyrics are read

A `.mscz` is a zip with one `.mscx` (XML) at its root; only that entry is decompressed, and it is read in one streaming pass (`saxes`) that looks at `<Lyrics>` and the text written above the staff. Each syllable has a lyric line (`<no>`, from 0), a measure, a voice and whether its word continues. MuseScore 3.6 and 4.x files are written the same way for this purpose; both are in the library.

What the lines mean was worked out from the real files, not assumed (`lyrics.ts` states the rules):

- Each lyric line is a **verse**; its leading "1." / "2." is its number (a line that lost its number takes the next one; a song with no numbers at all is numbered in order).
- The **refrain** is written once, on line 1 only, in the measures after the other lines stop. Some scores mark it REFRAIN or CHORUS; most do not, and it is found either way.
- A **Psalm** keeps the Bible's verse numbers inside its text and its lines are passes through a repeat, so they are plain sections in order, numbers left in.
- A verse written further along another verse's line ("… 5. When He comes") becomes its own verse.
- An **echo** or the men's part in another voice or staff repeats the main line and is dropped; only words the song does not already have are kept, as an "other voice" section.
- A song with one lyric line is one section.

The text is kept as written, poetic spellings and typing slips included ("ev'ry", "takeen"): Conductor quotes the church's own copy. For matching, `searchText()` folds case, accents, apostrophes and punctuation, for lyrics and for what is typed alike.

`PARSER_VERSION` is raised whenever these rules change what a file yields; every song is then read again at the next refresh.

**Checking the rules against the real library.** `src/lib/library-content/survey.test.ts` is skipped by `npm test`. Run by hand it reads every Standard file and prints the shapes it found and the odd ones:

```bash
LIBRARY_SURVEY=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run src/lib/library-content/survey.test.ts --disable-console-intercept
# LIBRARY_SURVEY="psalm 15|christ arose" also prints those songs' sections in full
```

### Refreshing, and why it is cheap

**Admin → AI → Refresh library index.** Nothing schedules it. A refresh:

1. Reads the Index and the Drive listing the site already caches (now with each file's `md5Checksum`), and the index's own rows, in one query.
2. Decides per song, **without opening a file** (`songWork()`): same checksum and parser version → nothing; the file only moved or was saved again unchanged → a note; new, changed, failed last time, title changed, or parser changed → read.
3. Fetches only those files, twelve at a time, and stores each batch in one transaction.
4. Embeds only **texts with no vector from the current model**, in batches, as one `library_indexing` request in the usage log.

Embeddings are kept by the **hash of the text they were made from** (`library_embeddings`), not on the song. So the same words are never embedded twice: not when a file is saved again unchanged, not when one hymn sits in two hymnals, not when one verse of a song is corrected (only that verse and the whole-song text are new). A different `AI_EMBEDDING_MODEL` simply has no vectors yet, so the next refresh embeds everything once and then drops the old model's vectors.

A refresh works in passes of about 40 seconds: each says what is left and the page asks again until nothing is, showing progress, so the first run never depends on one long request. The whole library from nothing took about a minute and cost about a third of a cent. With nothing changed, a refresh opens no file, embeds nothing and logs no request.

The report says what was indexed for the first time, updated, left unchanged, removed, embedded, and how many songs have no file, no lyrics, or could not be read.

### Search

- **Literal** (`find_lyrics`): the phrase is folded and matched against each section's folded text with `LIKE`; a phrase that runs from a verse into the refrain is found on the song. If no song has the phrase, songs holding every one of its words are returned and the result says so. No embedding is involved.
- **By meaning** (`search_songs_by_theme`): the question is embedded (one call, a fraction of a cent, logged beneath the Conductor question) and compared by cosine distance with **both** the whole-song vectors and the section vectors; a song is as near as its nearest part. A whole song is embedded as its words alone (with the title in front, songs came out "similar" for sharing a title word); a section is embedded under its song's title, so a two-line refrain is still about something.
- **Similar songs** (`find_similar_songs`): the song's own whole-song vector against the others'.
- An **exact scan**, not an approximate index: the library is about 2,600 vectors. Add an HNSW index only if it grows by orders of magnitude; the vector column would then need a fixed dimension.
- Closeness is a ranking, not a verdict. Results say so, and the instructions tell Conductor to read the words returned before calling a song a fit.

## Planning Intelligence

How the Music Director plans a song service, made available to the AI: the aim of strong congregational singing, familiar and new songs, the opener, the middle and the closer, flow, songs that should not sit side by side, the week's insert, variety across the week, Thanksgiving, Christmas and Easter.

### One document

**Since Phase 6 the philosophy lives in the database** and is edited under Admin → AI → Planning philosophy (see Phase 6 below). `src/content/music-planning-philosophy.md` is only the seed: the first version an environment gets, and the fallback for a deployment with no database. Editing the file changes nothing at runtime once an environment has been seeded. The parsing rules below are unchanged.

```
src/content/music-planning-philosophy.md
        │  load.ts         read from disk, once per server
        │  philosophy.ts   split at its own "## " headings; refused if unusable
        ▼
   ├─ Conductor            get_planning_philosophy: sections on request
   └─ Generate with AI,    the whole document in their instructions
      Suggest with AI      (src/lib/ai/service-planner)
```

- **A section is each `## ` heading and everything under it**; `### ` parts stay inside their section. There is no list of expected headings, so sections can be added, renamed, reordered or removed with no code change.
- **Nothing is extracted from it.** There is no rules table and no numbers in code. Whether something is a hard rule or a preference is read from the document's own wording ("must", "a hard rule"); every tool result says so in `howToRead`.
- **A document that cannot be used is refused whole**: empty, no `## ` sections, two sections with the same heading, or longer than `PHILOSOPHY_MAX_CHARS` (24,000 characters; it is about 15,700). The loader then logs why, and Conductor says the philosophy is not available. `philosophy.test.ts` reads the real file, so `npm test` fails before a deploy does.
- **It ships with the deployment**: `next.config.ts` lists the file under `outputFileTracingIncludes` for `/api/conductor`. **A new route that reads it must be listed there too.**

### How Conductor reads it

`get_planning_philosophy({ topics?, date? })`:

- `topics` (up to 6) names sections by title, by a word from a title or from a part's title ("openers", "new songs", "Christmas"). Only those sections come back, with the titles of the rest. A topic that names nothing is returned in `notFound`; nothing is guessed.
- With no `topics` the whole document comes back, for judging a whole service or week.
- Each result has `source`, `howToRead`, the sections' text exactly as written, and, when a seasonal section is included or a `date` is given, `seasons`: Thanksgiving, the Christmas season and Easter for that year and the next, from `church-calendar.ts`.
- A section already sent in the same question is named in `alreadyGiven`, not sent again.

For "would this song work here?" Conductor calls it alongside the existing tools (the plan, the song's history, its lyrics, songs by theme). Nothing about history or lyrics is duplicated.

### Grounding

`planningInstructions()` in `instructions.ts` tells Conductor to:

- know the philosophy **only** through the tool, called in this turn;
- keep apart, and name, **the record** (a tool result), **the philosophy** (the document) and **its own recommendation**;
- never state a rule, number or limit the document does not contain, and say so where it is silent;
- treat the Service Planner's 14-day "sung recently" notice (`siteConfig.servicePlanner.recentDays`) as the planner's, not the Director's policy;
- treat times sung as evidence of familiarity, never of being loved, and `timesSung: 0` as unsung in these records, not new to the congregation;
- not read tempo, energy, style or difficulty out of lyrics, and say when musical character is not known;
- treat the week's insert and its place as fixed.

### Cost

The planning layer makes no Gateway call of its own. What it adds is tokens:

- **Every question** carries the instruction paragraph (at most `PLANNING_INSTRUCTIONS_MAX`, 1,300 characters) and one line of section titles, about 450 tokens per model call with the tool's definition. An ordinary two-call question went from about 7,200–8,000 tokens to about 8,600.
- **A planning question** adds the sections asked for: 500 to 2,200 characters each, about 16,700 for the whole document.
- The section titles are in the instructions so the model names the sections it wants in its first call, in the same round as its other lookups.
- `conductorInstructions()` puts everything that is the same for every question first and what changes (the dates, the person, the page) last, so a provider that caches a repeated prefix can reuse it.

Measured on 2026-10-05: a direct question about one section, about 8,700 tokens and half a cent; a pairing judged from the philosophy and two songs' lyrics, about 10,000 tokens and under a cent; a whole planned service judged against the philosophy, its plan, history and lyrics, about 23,000 tokens and three cents.

### Editing the philosophy

- Edit it under **Admin → AI → Planning philosophy** (needs `manage_planning_philosophy`), or ask Conductor to propose a change and press Apply. No deploy. The editor refuses a document the AI could not read.
- Keep each topic under its own `## ` heading, with a title that says what it is about: the titles are how sections are asked for.
- Do not give two sections the same heading.
- State a hard rule as one ("must", "this is a hard rule"). Anything not written as required is treated as a preference.
- Write a number only if it is meant. The AI repeats what is there and is told not to add any.
- Run `npm test` after a large edit: it checks the real file still parses and fits.

### How Generate with AI reads it

Whole: `philosophy.markdown` goes into the generator's instructions word for word (`plannerInstructions()`), after the generator's own rules. `/api/service-planner/ai` is listed in `outputFileTracingIncludes`. See the next section.

## AI-assisted planning

**Generate with AI** plans or revises the songs of the service open in the Service Planner. **Suggest with AI** (the `replace_song` feature) offers up to three songs for one place. Both work on the editor's **current, unsaved** songs and hand songs back to the editor. Neither saves, publishes, touches another service or changes the week's insert: the Director reviews, edits, and presses Save or Publish as always.

### The flow

```
Workspace (browser)     the songs as they stand · which are locked · an optional instruction
        │  POST { mode, anchor, revision, slots, locked[], instruction?, target? }
        ▼
src/app/api/service-planner/ai/route.ts     manage_service_plans AND use_ai · zod body · writes nothing
        ▼
src/lib/ai/service-planner/plan.ts          planWithAi(): the rules, in order
   1. both permissions, again
   2. refused from the request alone: everything locked, the place asked about locked   <- no AI call
   3. hourly cap · the philosophy · the service (run.ts → the planner's own loader)
   4. refused: no such service, cancelled, frozen into history, changed by someone else
   5. the library (run.ts): lyric openings, songs by meaning, the Nativity's words
   6. brief.ts: the places, the week, a shortlist of candidates with their facts
   7. prompt.ts → generateAiObject(): song ids in a fixed shape
   8. validate.ts: the answer held to the rules; one retry saying what was wrong
        ▼
{ slots, changed, summary }  →  the editor's songs: unsaved, with the usual checks, Save and Publish
```

| File | Job |
|---|---|
| `protocol.ts` | The request's schema, the response, each failure's status and words (pure) |
| `locks.ts` | AI locks: defaults, toggling, what stays locked after a generation, which places are open (pure) |
| `season.ts` | Which season a service falls in; which songs are established as Christmas songs (pure) |
| `library.ts` | Tying the planner's songs (by title, or hymnal number) to the library's (pure) |
| `brief.ts` | Everything one request is decided from: the places, the week, the shortlist, and what the answer is held to (pure) |
| `prompt.ts` | The rules the model is given, the two prompts, the answer's schema (pure) |
| `validate.ts` | The answer checked and turned into the site's own `PlanSlots` (pure) |
| `plan.ts` | `planWithAi()`: the whole request, with its reads and the model passed in, so it is unit tested |
| `run.ts` | The real reads, model and usage log behind it (server-only) |
| `src/components/service-planner/AiGenerate.tsx`, `ai-request.ts` | The dialog, and the one `fetch` |

### Locks

Each song in the editor has a lock button (only for someone holding `use_ai`).

- **The insert starts locked; every other song starts unlocked.** An empty place has nothing to lock.
- **Locked: AI will keep this song here.** Its place is not sent as one to answer for, its song is not among the candidates, and it is copied back as the very object that was sent: song, place, key, insert mark. An answer that names a locked place is refused.
- **Unlocked: AI may change this song**, and need not. The model is told that keeping it is a real choice, and a kept song is returned exactly as it was, with its key.
- **A lock outranks the instruction.** "Replace the opener" with the opener locked leaves the opener.
- Locks live in the editor only (`LockChoices`, by `songKey`, so a lock follows a song that is moved). They are never saved and do not make the service "unsaved". After a generation the person's locks stand and every song AI put in is unlocked.
- **Everything locked** is refused before anything is read or asked. So is an unlocked insert with every other song locked and no instruction.

### The insert

- **Locked** (the default): it and its place cannot change.
- **Unlocked, no instruction:** it is still held where it is, **by code** (`openPlaces(…, holdInsert)`): nothing has asked for the service to go without it. The dialog says so.
- **Unlocked, with an instruction:** the model may keep it, replace it, or move it, and is told to keep it unless the instruction plainly asks otherwise. A song put in its place is **`insert: false`**. It is marked as a different insert for this one service only when the model says the instruction asked for exactly that, an instruction was given, and the song has no hymnal number.
- Either way only this service's local songs change. On save, the planner's existing rule makes the service's insert "custom"; the week's insert and the week's other services are untouched.

### Precedence

Told to the model in this order, and enforced in code where code can: (1) the request's limits (candidates only, no song twice, hard rules) → (2) locks → (3) the instruction → (4) the philosophy → (5) the model's judgement. The instruction is passed marked off as the Director's words for this service; it is not stored.

### Candidates: a shortlist, not the library

The model never sees the whole library. `buildShortlist()` takes at most **110** songs:

1. the songs in open places (so keeping one is always possible);
2. up to 36 found **by meaning**: near the insert and the locked songs (`similarSongs`, no Gateway call), near the instruction and near the season's subject (`searchByTheme`, one embedding call each), of which at most 6 never sung here;
3. the 40 most sung, then 24 familiar songs not sung for the longest, then 10 sung once or twice.

Each carries facts from the planner's own `candidateFacts()`: times sung, last sung, days before this service, times in the year before, where else it is planned, which of the week's services it is in, and the first 150 characters of its lyrics. Never a key. Songs in places the model cannot change are not offered (they could not be used twice), and Christmas songs are not offered outside the season, as in the song picker. These numbers bound a prompt; they are not planning policy.

The same week's other services (sung, planned, draft) are listed with their songs.

### Grounding

- The answer's schema (`generateSchema()`) holds each `songId` to an enum of the ids offered, and `validate.ts` checks again: a place not asked about, a place left out, an id not offered, a song twice (counting locked songs), a non-Christmas song in the Christmas season. Any of these refuses the whole answer.
- **One retry.** A refused answer goes back once with what was wrong (`withCorrections()`); a second failure is "AI's answer could not be used, so nothing was changed." A provider failure (budget, key, timeout) is not retried.
- **Keys are the site's.** A kept or moved song keeps its key; a new one gets `candidateFacts().suggestedKey`. The model is never shown a key and never returns one.
- The model's only free text is a two or three sentence summary (and a sentence per suggestion), shown above the songs and never stored. It is told it knows nothing of tempo, style, difficulty or harmony, that times sung is familiarity and not affection, and that `timesSung: 0` means "not in these records".
- **The 14-day notice is not a rule here.** The model gets dates and days, and the philosophy. `recentDays` is not in the prompt (a test holds that), and the planner's own check keeps appearing after a generation as before.

### Seasons

- **Christmas is enforced.** For a service in the site's Christmas season (`inChristmasSeason`), a song AI puts in must be **established** as a Christmas song: never sung outside the season, **and** either sung in it (the records) or with indexed lyrics containing one of a few unmistakable words (`NATIVITY_WORDS`: christmas, bethlehem, manger, noel, nowell, magi, shepherds). Only those are candidates, the answer is checked again, and an unlocked ordinary song may not stay. Two exceptions, both the person's own choice: a **locked** song, and the week's insert kept in its place. With too few such songs for the places to fill, the request is refused with its own message and no AI call.
- **Thanksgiving and Easter are preferences.** `serviceSeason()` says which a service falls in (the Sunday to Thursday of Thanksgiving week, the week before Easter, Easter Sunday), the model is told with the dates, and songs near the season's subject are searched for (`SEASON_SEARCH`) so they are among the candidates. Nothing is refused.
- Manual editing is unchanged: a person can still put any song anywhere.

### Permissions and limits

- **Both `manage_service_plans` and `use_ai`**: at the route (401 signed out, 403 otherwise), again in `planWithAi()`, and `use_ai` once more in the AI layer. The buttons and locks only show for someone holding `use_ai`; that is a convenience.
- `/api/service-planner/:path*` is in the proxy's matcher.
- 30 requests an hour per person for each of the two features, counted from `ai_usage`. An instruction is at most 600 characters. Output 2,000 tokens, `reasoning: "low"`, the AI layer's 60 seconds a call, two calls at most.
- **Usage:** one `ai_usage` row per request (`generate_service_plan` · `generate`, or `replace_song` · `suggest`) with its calls beneath: the model's, an embedding for the instruction or the season, a second model call if the first answer was refused. A request that could not be used is logged as failed with a count of the rules broken, never the answer.
- **Cost, measured 2026-10-05** on the default model: a generation took 10 to 15 seconds and a suggestion about 10. Each sends the philosophy (about 4,000 tokens) and about 100 candidates.

### The interface

- **Generate with AI** is at the foot of the Songs card. Its dialog says how many songs stay and how many places may change, takes **Additional instructions (optional)**, and on success closes: a notice above the songs gives AI's summary with **Undo** (the songs and locks as they were) and **Dismiss**. A failure is shown in the dialog and the editor is untouched. Closing the dialog aborts the request. The instruction is kept in the open editor for the next generation and nowhere else.
- **Suggest with AI** is in the song picker ("Change song" or an empty place), not another button on the row: a phone row has no room for one. A suggestion is chosen like any other song, through the picker's own `choose()`. It is replaced by a hint to unlock when the song is locked.
- Words: `servicePlannerContent.ai` in `src/content/service-planner.ts`.

## Persistence, memory and configuration (Phase 6)

### The kinds of context, and what outranks what

| Kind | Where it lives | Authority |
|---|---|---|
| The site's own rules (permissions, locks, valid song ids, answer checks, the Christmas rule) | code | Enforced in code. Nothing in a prompt changes them |
| Service Planning Philosophy | `planning_philosophy_revisions` | The ministry's official guidance |
| This request's instruction | the request; never stored | May set aside a preference of the philosophy for one service, never a hard rule or a lock |
| Global memory | `ai_memories`, `scope = 'global'` | Context to weigh. Below everything above |
| Personal memory | `ai_memories`, `scope = 'personal'` | One person's preference. Does not stand for the ministry |
| Conversation | `conductor_*` | Conductor's only. Never a source of facts |

`src/lib/ai/context/authority.ts` holds the one wording of this (`MEMORY_AUTHORITY`), sent with the memories themselves to every feature: memory never outranks a lock, a hard rule or the philosophy; a conflict is named, not silently resolved; a memory is something a person said, not a record.

### The context layer

```
Conductor · Generate with AI · Suggest with AI
        │  assembleAiContext(viewer, feature, { query })     src/lib/ai/context/assemble.ts
        ▼
CONTEXT_SOURCES[feature]        what this feature MAY be given            (authority.ts)
        ├─ philosophy           loadPlanningPhilosophy(env): the version in force
        └─ memory               memoryForRequest(): global + the person's own, per their permissions,
                                each scope chosen and bounded on its own (selectMemories)
```

| Feature | Philosophy | Global memory | Personal memory | Conversation |
|---|---|---|---|---|
| Conductor (`assistant`) | section titles in the instructions; text through `get_planning_philosophy` | yes | yes | its own: latest turns + summary |
| Generate with AI, Suggest with AI | whole, in the instructions | yes, in the prompt (`MEMORY` block) | yes | **never**: `PlanStandingContext` has no field for one |
| `conductor_summary`, `connection_test`, `library_indexing` | none | none | none | none |

Personal memory needs `use_personal_ai_memory`; without it none is read or sent. Memory that cannot be read is no memory: a request is not failed for it.

**Retrieval:** every memory of a scope is sent while the scope fits in 3,000 characters. Past that, `selectMemories()` keeps the ones sharing most words with the request, then the most recent. That one function is where a search by meaning would go if memory ever grows large; there are no memory embeddings today.

### Saved conversations

```
browser: conductor-store.ts          holds the open conversation and the list; remembers only WHICH was open
   │  POST /api/conductor { question, conversationId?, retry?, context }      <- no transcript is sent
   ▼
answerConductor()                    conversation looked up AS THIS PERSON (else 404) or created;
   │                                 the question stored; history read from the database
   ▼
conversationContext()                latest turns word for word (12 turns / 12,000 chars, as before)
   │                                 + the conversation's summary, in the instructions
   ▼
streamAiText()                       preface: which conversation this is · tools may emit a card
   │  onSettled                      the answer stored (complete / stopped / error) with its cards,
   ▼                                 BEFORE the page hears "done"; after() keeps the function alive
refreshConversationSummary()         once 6+ messages have dropped out of the word-for-word part
```

- **Routes** (all in the proxy's matcher as `/api/conductor/:path*`, all `use_ai`): `GET /api/conductor/conversations`, `GET | PATCH | DELETE /api/conductor/conversations/[id]`, `POST /api/conductor/actions/[id]`. Routes, not server actions, because the panel is open over pages the session proxy does not run for.
- **Titles:** the first question, cut at a word (`titleFromQuestion`). Renaming sets `title_source = 'user'`. No model call.
- **Try again** sends `retry: true`; the server removes the last exchange only if its question is the one being asked, so a question that never arrived cannot delete the exchange before it.
- **A refused question** (cap, not configured) is taken back: a conversation begun for it is deleted.
- **Summaries** are one `generateAiText` call under the feature `conductor_summary` (so it does not count against 40 questions an hour), with no tools. The summary is written only to `conductor_conversations.summary`, is told to add nothing, is marked "not a source of facts" in Conductor's instructions, and **never becomes a memory**. Until one is written, a long conversation simply sends its latest turns.
- **Cards in history:** each proposal is replayed to the model as one bracketed line saying what the person chose (`describeAction`). That line is the only way Conductor learns something was saved.

### Memory

- **Two scopes.** Personal: one person's, used only when AI is helping them. Global: the ministry's, used for everyone who uses AI.
- **Nothing is saved without a person.** Conductor may call `propose_memory_save` only when the latest message explicitly asks it to remember something (instructions and tool description both say so). The tool writes a waiting proposal and shows a card with the exact text and **Personal / Global / Cancel**. A scope the person named is preselected and never applied for them. Cancel stores nothing. This is true every time, whatever the request said.
- **The hard guarantee is in code, not the prompt:** `ai_memories` is written only by `memory/service.ts`, called from the Memory page's actions and from `resolveAction()`. No tool imports it.
- **Rules** (`memory/service.ts`, unit tested with an in-memory store): personal writes need `use_personal_ai_memory` and reach only one's own rows; global writes need `manage_global_ai_memory`; moving between scopes needs both. A save refused for one scope is refused, never made in the other. Another person's personal memory is "not found" by id.
- **Conductor's tools:** `list_memories` (read, with ids), `propose_memory_save`, `propose_memory_update`, `propose_memory_delete`. The propose tools are not offered to someone who could never use them.
- **Admin → AI → Memory** (`/admin/ai/memory`): My memory / Global memory, add, edit, delete, move, search, category (free text; a few are suggested), when and by whom.
- Limits: 500 characters a memory, 300 memories a scope, 3 cards an answer.

### The configurable philosophy

- **Runtime source:** the latest row of `planning_philosophy_revisions` for the environment. Each row is the whole document. Nothing is updated or deleted.
- **Seeding:** the first time an environment is asked for its philosophy and has none, `currentPhilosophyRevision()` copies `src/content/music-planning-philosophy.md` in as a `seed` revision (a partial unique index makes that happen once). Every route that can ask is listed in `next.config.ts` `outputFileTracingIncludes`; **a new one must be listed too**.
- **One way to change it:** `savePhilosophy()` / `restorePhilosophy()` in `planning/service.ts`. Needs `manage_planning_philosophy`; the new document must pass `parsePlanningPhilosophy`; it is applied only on top of the revision it was made from (`baseRevisionId`), otherwise "conflict"; an unchanged document is refused.
- **Admin → AI → Planning philosophy** (`/admin/ai/philosophy`): each `## ` section its own card (read as Markdown, edited in place, added, removed, reordered), one **Save changes** making one revision with an optional note. Read-only without the permission.
- **AI-assisted editing:** `propose_philosophy_change({ section, newText, explanation })`, offered only with `manage_planning_philosophy`. The card shows what changes (a word diff, condensed to the text around the change), the proposed text and the current text, with **Apply / Cancel**. Apply calls `savePhilosophy` with `source: 'ai'`; a proposal made against a revision no longer in force is refused and stays pending. One section per proposal; it cannot add or remove a section.
- **History:** who, when, how (`seed`, `manual`, `ai`, `restore`), which sections, the note. View any version, compare it with the one in force, restore it. A restore is a new revision.
- **Checking a change:** the page offers a question to ask Conductor ("explain how you would approach this Sunday morning"). It reads the live philosophy and changes no plan. There is no separate preview feature.

### Proposals (`conductor_actions`)

`conductor/actions.ts` (kinds, payload schemas, choices), `conductor/resolve.ts` (settling one), `ConductorActionCard.tsx` (the card).

1. The proposal must be this person's and still `pending`.
2. Permission for the chosen option is checked before anything is claimed; a refusal leaves the card waiting.
3. It is claimed (`pending` → `applied`/`cancelled` in one `UPDATE … WHERE status = 'pending'`), so two clicks or two tabs settle it once.
4. The write runs through the shared service function. If it fails, the claim is released.
5. The request body carries only the choice. The text written is what was recorded when the card was made.

### Permissions added

| Permission | Allows | Default |
|---|---|---|
| `use_personal_ai_memory` | keep and manage your own memories; have AI use them for you | Administrator, Music Director |
| `manage_global_ai_memory` | add, change, delete global memories; move a memory between scopes (with the personal one) | Administrator, Music Director |
| `manage_planning_philosophy` | edit the philosophy, apply a proposal, restore a version | Administrator, Music Director |

Each means something only with `use_ai`. Global memory is **read** by AI for everyone holding `use_ai`. The memory permissions are separate on purpose: a Musician later given `use_ai` and `use_personal_ai_memory` gets their own memory and cannot touch the ministry's. Existing sites get them on the Music Director role once (`PERMISSION_FIXUPS`); custom roles are untouched.

### Files added in Phase 6

| File | Job |
|---|---|
| `src/lib/ai/context/authority.ts`, `assemble.ts` | What each feature may be given; the authority wording; the one loader |
| `src/lib/ai/conversations/model.ts`, `store.ts`, `summary.ts` | Titles, what the model is sent, when to summarise (pure); the three tables; the summary call |
| `src/lib/ai/memory/memory.ts`, `service.ts`, `store.ts` | Limits, selection, rendering (pure); who may do what; `ai_memories` |
| `src/lib/ai/planning/revisions.ts`, `service.ts`, `store.ts`, `run.ts` | Sections to edit, diffs (pure); the change rules; the revisions table; the real deps |
| `src/lib/ai/conductor/actions.ts`, `resolve.ts`, `request.ts` | Proposals; settling one; the routes' shared guard |
| `src/app/api/conductor/conversations/`, `actions/[id]/` | The routes |
| `src/app/admin/ai/layout.tsx`, `memory/`, `philosophy/` | Admin → AI's sub-pages |
| `src/components/conductor/ConductorHistory.tsx`, `ConductorActionCard.tsx` | The conversation list (one component, three places); the cards |
| `src/components/admin/MemoryManager.tsx`, `PhilosophyEditor.tsx`, `PhilosophyHistory.tsx`, `src/components/ai/TextDiff.tsx` | The admin interfaces |
| `src/lib/ai/__fixtures__/` | In-memory stores the tests share |

### Tests

`npm test` covers, without a database or a model: `conversations/conversations.test.ts` (titles, ids, what a long conversation sends, cards replayed, when to summarise), `memory/memory.test.ts` (both scopes, each permission alone, no downgrade, isolation by id, selection, rendering), `conductor/actions.test.ts` (Cancel writes nothing, settle once, another person's card not found, each permission, a payload pointed at someone else's memory, stale philosophy proposals), `planning/revisions.test.ts` (round trip of the real document, edits, conflicts, restore, diffs, the planner receiving the new version), `context/context.test.ts` (per-feature sources, only Conductor gets a conversation, one authority wording), plus the updated `conductor.test.ts`, `service-planner.test.ts` and `auth/permissions.test.ts`.

Not covered by automated tests: the SQL itself (the stores), and the model's own behaviour.

## Grounding

`instructions.ts` tells the model, every question:

- This church's facts come **only** from a tool called in this turn. Earlier answers are not a source. Say only what a tool returned; with no tool or an empty result, say the information is not available. Never estimate.
- General music questions need no tool.
- **Lyrics follow the same rule.** It knows a song's words only from a lyric tool called in this turn: before quoting, paraphrasing, summarizing or saying what a song is about, it calls `get_song_lyrics`, for every song however famous. It quotes exactly what came back, and when a song's lyrics are not indexed, or the song is not in the library, it says they are not available rather than supplying them.
- Exact words go to `find_lyrics`, a subject to `search_songs_by_theme`; a ranking by meaning is judged from the words returned, and a loose fit is called one.
- The planning philosophy follows the same rule, and its own (see Planning Intelligence).
- It cannot read the music itself (notes, rhythm, harmony, chords).
- It only reads, and must not say or imply it changed anything.
- Today's date and the dates of the surrounding Sundays and Wednesdays, written out, so "three Sundays ago" is looked up rather than calculated.

Supporting that in code: earlier turns go back to the model as **text only** (never tool results), so a fact is fetched again rather than recalled; results carry `recordsBegin` so "never" is read as "not in these records"; ambiguous songs are returned, not resolved.

## Permissions

- `use_ai` is checked in `route.ts` (401 signed out, 403 without it) and again in `streamAiText()`.
- **Drafts need `manage_service_plans` as well.** `data.ts` reads the planner's drafts only for someone who holds it; `check_service_plan` refuses without it. `use_ai` alone knows exactly what the public song list shows.
- The page (`/conductor`), the navigation entry and the floating button all follow `use_ai`. Hiding them is a convenience; the route is the protection.
- `/conductor` and `/api/conductor` are in the proxy's matcher (`src/proxy.ts`).

## Streaming

`streamAiText()` calls the SDK's `streamText` with the tools and `stopWhen: isStepCount(maxSteps)`, then turns the SDK's stream into the site's own (`stream.ts`), newline-delimited JSON:

```
{"type":"status","key":"songs"}     a tool started (a content key)
{"type":"text","delta":"Blessed "}  the answer
{"type":"done"}
{"type":"error","code":"timeout","message":"…"}   safe wording from src/content/ai.ts
```

The store reads it with `fetch` and a reader. The view shows the text at a steady pace as it arrives (`useFlowingText` in `ConductorChat`), so uneven chunks do not stutter. **Stop** aborts the request; the server sees the abort and stops the model. A stream that ends without `done` or `error` is shown as a lost connection, with **Try again**.

## The two interfaces

Both render `ConductorChat` over the same store, so they cannot differ.

**The Conductor page** (`/conductor`): the conversation given the whole page. Nothing scrolls inside it: the conversation is part of the page and the window scrolls, while the box to type in stays at the bottom of the window ("Back to top" stands down there). In the navigation under **Tools** (with the Service Planner; someone with only one of the two sees it as a plain link).

**The floating panel** (`ConductorDock`, mounted once in the root layout): a round button in the bottom right corner of every signed-in page, for someone holding `use_ai`. It is not shown on `/conductor` or the login screens, steps aside for the song list's share bar, and sits above a page's own bar of actions (`data-action-bar`: the planner's Save and Publish). "Back to top" stacks above it. The footer leaves that corner empty below 1440px, so neither button ever covers it.

- **Wide screens (1024px and up): a drawer beside the page.** Not a dialog: the page stays live. The dock writes the drawer's width to `--conductor-inset` on `<html>` and `<body>` takes it as a right margin, so the header, the planner and every page **reflow** into the space left; fixed controls read the same variable.
- **Resizing:** the left edge drags (`role="separator"`, pointer capture). While it moves, the width is written to the CSS variable once a frame with no React render, and nothing is selected. Default 420px, minimum 340px, maximum the smaller of *window − 520px* and *62% of the window*, re-clamped when the window changes. Arrow keys move it 24px, Home and End go to the limits, a double-click resets it. The width released at is kept in `localStorage` (`fwm:conductor-width`).
- **Phones and tablets (below 1024px): a sheet over the page.** A modal `<dialog>` (the site's `useModalDialog`) that rises to 93% of the height, with the page visible above it. It follows the visual viewport, so with the keyboard up it is the space above the keyboard. Close with the button, Escape, a tap outside, or by pulling the handle down; it slides away from wherever it is. The page beneath is never unmounted, scrolled or navigated.
- **Open full Conductor** ("Full page") goes to `/conductor` with the conversation intact.

## The conversation

- **Saved on the server** since Phase 6 (see below). `conductor-store.ts` is the browser's one view of it, shared by the page, the panel and the sheet. The store owns the request, so an answer keeps streaming when the panel closes or the page changes.
- The browser remembers only **which** conversation was open (`localStorage`, `fwm:conductor-active`: an id and whose it is), so Conductor carries on with it wherever it is next opened.
- **New chat** starts a new one; nothing is stored until its first question.

## Page context

So "this service" and "this song" mean something, each question carries a small typed context worked out from the page's **address** (`pageContextFor`): the area of the site and, where the path has one, a service anchor (`2026-10-18-pm`), a song slug or a year. The server discards anything that is not shaped like one (`normalizePageContext`) and describes it to the model in one line. An identifier only ever becomes the input of a read-only tool, which applies the person's own permissions.

It is deliberately not the page's content: nothing is scraped from the DOM, and a planner's **unsaved** changes are not known (`check_service_plan` says so). `ConductorPageContext` is where richer planner state would be added later.

## Limits

In `src/lib/ai/conductor/limits.ts`:

| | |
|---|---|
| A question | 2,000 characters |
| History sent back | the last 12 turns, 12,000 characters, an earlier answer cut to 4,000 |
| Model calls per question | 6 (each round of tool use is one, the answer is one) |
| Output | 1,500 tokens, `reasoning: "low"` |
| A tool result | 6,000 characters |
| Time | 60 seconds in all, 10 per tool |
| Per person | 40 questions an hour (counted from `ai_usage`) |

For the lyric tools (`conductor/lyrics.ts`, `library-content/search.ts`): 12 songs for a phrase, 10 for a theme unless asked (20 at most), a section in a search result cut at 600 characters, a phrase at least 4 characters once folded.

For the planning tool (`planning/philosophy.ts`): 6 topics a request, and the document itself at most 24,000 characters. Its result is not passed through `clampToolResult()`, which would drop sections without saying which; the document's own limit is the bound.

A typical question costs a fraction of a cent to about a cent; a search by theme adds one embedding call of a few tokens. AI Gateway's budget remains what stops spending.

## Provider and Gateway

- **Vercel AI SDK** (`ai`, version 7) calling **Vercel AI Gateway**. Models are plain `provider/model` strings.
- **Model:** `AI_MODEL`, default `openai/gpt-5.6-terra`. Conductor uses the same one; it must support tool calling.
- **Embedding model:** `AI_EMBEDDING_MODEL`, default `openai/text-embedding-3-small`, set separately and also a Gateway `provider/model` ID. Nothing is tied to OpenAI or to a vector size.
- **Credentials:** `AI_GATEWAY_API_KEY`, or the deployment's `VERCEL_OIDC_TOKEN` on Vercel. Server-side only.
- Each request is tagged `feature:<key>` and `env:<development|production>` and carries the person's Clerk user ID.

## Budget

Vercel AI Gateway enforces the budget (a spent one comes back as "This month's AI budget has been used up"). `AI_MONTHLY_BUDGET_USD` (default `10`) only sets the figure shown on Admin → AI.

## Database

All created on first use and tagged `clerk_env` (Local, Preview and Production share one database, so each environment has its own rows and its own index).

### Usage

**`ai_usage`**, one row per request **as a person means it**: `id`, `clerk_env`, `created_at`, `feature`, `action`, `model`, `response_model`, `clerk_user_id`, `status`, `error_code`, `error_detail`, token columns, `cost_usd`, `duration_ms`, `generation_id`, `finish_reason`.

**`ai_usage_calls`**, one row per **actual call to the Gateway**, beneath its request: `usage_id`, `kind` (`language` or `embedding`), `model`, `response_model`, token columns, `cost_usd`, `generation_id`.

- **A Conductor question is one `ai_usage` row** (`assistant` · `answer`) however it was answered: a chat call for each round of tool use, plus an embedding call when a tool searched by theme, each a row beneath it. The row's tokens and cost are its calls' added together. A refresh of the index is likewise one `library_indexing` · `index` row with its embedding batches beneath (and no row at all when it embedded nothing).
- **How a call finds its request:** `service.ts` keeps the request in progress in an `AsyncLocalStorage`. `embedAiValues()` called inside one adds a call to it and logs no row of its own; called by itself it logs its own. Nothing has to be passed down through the tools.
- **Counting:** requests, the hourly cap and *by feature* read `ai_usage`, so one question is one request. *By model* reads the calls, so a question that also embedded its search counts under both models, each with its own tokens and cost.
- **Late costs:** a call logged without a cost keeps its generation ID; `backfillAiCosts()` asks the Gateway for each one, and the request's cost is filled in when none of its calls is still waiting. Every call of a multi-call answer is priced (in Phase 2 only one-call answers could be). The Gateway reports a cost and a generation ID for embeddings too.
- Requests logged before `ai_usage_calls` existed were each given the one call they had been recorded as, when the table was created.
- An answer the person stopped is logged with `finish_reason = 'aborted'` and shows as **Stopped**.
- **Never written:** a prompt, an answer, a question's text, a phrase or theme searched for, a lyric, a tool's input or its result.

### The library index

| Table | Holds |
|---|---|
| `library_songs` | One row per Index song: `song_id`, title, `title_key`, collection, hymn number; `status` (`indexed`, `no_source`, `no_lyrics`, `failed`) and `error_detail`; the source's `source_file_id`, `source_modified_time`, `source_md5`; `parser_version`; `content_hash`; `lyrics_text`, `search_text`; `embed_hash`; counts; `indexed_at`, `checked_at` |
| `library_song_sections` | Its sections in order: `kind` (`verse`, `refrain`, `section`, `part`), `number`, `text`, `search_text`, `embed_hash` |
| `library_embeddings` | `text_hash`, `model`, `embedding` (pgvector, no fixed dimension), keyed by hash and model |
| `library_index_state` | When a refresh last ran to the end |

`CREATE EXTENSION IF NOT EXISTS vector` runs with the schema. The Drive file ID is server-only, as everywhere: no tool result, page or log carries it.

### Phase 6 tables

| Table | Holds |
|---|---|
| `conductor_conversations` | `id` (uuid), `clerk_user_id`, `title`, `title_source`, `summary`, `summary_through`, `created_at`, `last_message_at` |
| `conductor_messages` | `conversation_id` (cascade), `role`, `text`, `status` (`complete`, `stopped`, `error`), `error_message` (the error code), `created_at` |
| `conductor_actions` | `id` (uuid), `conversation_id`, `message_id`, `clerk_user_id`, `kind`, `payload`, `status` (`pending`, `applied`, `cancelled`), `result`, `resolved_at` |
| `ai_memories` | `scope`, `owner_user_id` (set exactly when personal, by a CHECK), `text`, `category`, `created_by`, `updated_by`, timestamps |
| `planning_philosophy_revisions` | `markdown`, `source`, `restored_from`, `changed_sections`, `note`, `created_by`, `created_at` |

Deleting a conversation deletes its messages and proposals. A memory or a philosophy revision made from a proposal stays.

## Failures

Neither `generateAiText()` nor `streamAiText()` throws. A failure is sorted into a code (`errors.ts`), logged as `[ai] <feature> failed (<code>): <detail>`, recorded, and reported with wording from `src/content/ai.ts`: `forbidden`, `not-configured`, `auth`, `budget`, `rate-limited`, `model-unavailable`, `timeout`, `invalid-response`, `provider`, `unknown`. Before a stream starts it is a JSON response with a status code; once it has started it is an `error` event. Either way the conversation shows the message under the question, with **Try again**, and keeps any text already written.

## Known limitations

- **Lyrics are only as good as the files.** A word mistyped in MuseScore is quoted mistyped; a first syllable never typed in is missing ("ywhere with Jesus"); a few scores put part of a verse in another voice, which arrives as an "other voice" section rather than in its place. Fix the file and refresh.
- **Some lines are not labelled as a person would.** A Psalm's sections are passes through its repeats, in the order they are written, not always the order they are sung. A refrain that the score writes under every verse is part of each verse.
- **Lyrics keep poetic spellings**, so an exact search for "every" does not find "ev'ry". Conductor is told; searching by theme does not care.
- **The index is refreshed by hand.** New or changed sheet music is not searchable until someone presses Refresh. Admin → AI shows how many songs are out of date.
- **No music.** Notes, rhythm, harmony and chords are not read.
- **A file that matches no row of the Songs tab is not indexed.** Of 546 Standard MuseScore files in Drive at the first refresh, 488 were a song's source; the rest were not looked into.
- **Conductor knows saved plans only.** Unsaved changes in the planner are not known to it (Generate with AI does work from them).
- **History begins October 2025**, so "usual" and "never" are only as good as the records. Most of the hymnal has never been sung in them, and a search by theme returns such songs unless asked for songs sung before.
- **Cost pending:** a request shows "Cost pending" until every one of its calls has a cost; the backfill fills them in when Admin → AI is next opened.
- **The hourly cap counts rows in `ai_usage`**, so it is per environment, like the usage figures.
- **Two tabs on one conversation do not see each other's messages** until it is reopened or the page reloaded.
- **Opening another conversation while an answer is streaming stops that answer**; it is stored as stopped.
- **A summary is the model's reading** of the older messages. It is bounded and told to add nothing, but it is not checked.
- **Memory is matched by words**, not meaning, once a scope outgrows 3,000 characters.
- **"Only when asked" is an instruction to the model.** What code guarantees is that nothing is saved without the person's click; a card the person did not ask for could still be shown, and cancelled.
- **A philosophy proposal changes one existing section.** Adding, removing, renaming or reordering sections is done in the editor.
- **Conversations are kept until deleted.** There is no retention limit or export.
- **Blockquotes in the philosophy** show with their `>` in the editor's read view; the AI reads them correctly.
- **Not verified live in Phase 6:** a person holding only some of the new permissions (covered by tests; verified as Administrator), a phone itself and the phone sheet's conversation list, a conversation long enough to be summarised against the real model, Generate and Suggest run against a real service with a memory saved (the prompt is covered by tests), and the deployed site.
- **Planning advice is judgement.** The philosophy is quoted faithfully, but whether a song fits a place is the model's reading of it. There is no data on what the congregation loves, on musical character, or on which songs are Thanksgiving or Easter songs: those are found by theme, from the lyrics.
- **The philosophy's hard rule is enforced only on what AI puts in.** Generate with AI and Suggest with AI offer only established Christmas songs in the season; a plan made by hand is not checked against it, and Conductor only describes it.
- **"Established as a Christmas song" is conservative.** A carol never sung here whose lyrics are not indexed, or one whose lyrics use none of the listed words, is not offered by AI until it has been sung in a season; a carol also sung at another time of year stops counting. Each can still be chosen by hand, or locked. The first recorded season is December 2025, so that season's songs are the base.
- **The Christmas season is the site's:** the day after Thanksgiving to December 25 (`church-calendar.ts`). The philosophy says "on or after Thanksgiving"; the two differ only for a special service held on Thanksgiving Day itself, which is planned as a Thanksgiving service.
- **A plan is chosen from about 110 candidates**, not the whole library. A song outside them cannot be chosen by AI in that request; a different instruction, or the picker, reaches it.
- **Familiarity is times sung.** There is no data on what the congregation knows or loves, or on tempo, mood or style, so the model's sense of an "opener" or a "closer" comes from titles, the first lines of the lyrics and the history.
- **The week is what is stored.** The week's other services are known as they were last saved; unsaved changes open in another tab are not.
- **Different insert for one service** rests on the model saying the instruction asked for it; otherwise a song in the insert's place is an ordinary song, and can be marked by hand.
- **An embedding that fails** while the candidates are gathered marks the request as failed in the usage log even though the plan was made without it.
- **Not verified live in Phase 5:** a service in the Christmas season, Thanksgiving week or Easter week (covered by tests; no such date was generated against the real library), someone holding only one of the two permissions (the tests and the route's check), a model answer that breaks a rule (the tests), a phone itself (checked at 375px wide in a frame) and the deployed site.
- **Not verified live in Phase 4:** the deployed site (the document was confirmed in the route's build trace, and the questions were asked on the local server), whether the provider's prompt cache is being hit (Admin → AI shows total tokens, not cached ones), and the new example question at phone width.
- **Not verified live in Phase 3:** the **Refresh library index** button itself was not pressed in a browser. The refresh it calls was run pass by pass against the real Drive, Neon and Gateway (first run, an unchanged run, a rebuild), the lyric tools were asked real questions through Conductor, and the Admin → AI section was looked at on a wide screen and at phone width.
- **Not verified live in Phase 2:** a signed-in person without `use_ai` (no such test account; covered by the route's check, the 401 for a signed-out request, and the navigation tests), and a provider failure mid-stream (the path is the Phase 1 classifier).

## Manual setup

From Phase 1: an AI Gateway key with a monthly budget in `AI_GATEWAY_API_KEY`, optionally `AI_MODEL` and `AI_MONTHLY_BUDGET_USD`. Nothing new for Phase 2.

For Phase 3:

- **Press Refresh library index once in each environment** (Admin → AI), and again whenever sheet music is added or changed. Local and Preview share one index (`development`); Production has its own.
- `AI_EMBEDDING_MODEL` is optional.
- **pgvector** is enabled by the site itself the first time the index is used (`CREATE EXTENSION IF NOT EXISTS vector`), which the database's owner role may do; it was on the Neon database in use. If a different database refuses, enable the `vector` extension once in its console.
- The Google service account needs nothing new: it already reads the Sheet Music folder.

Nothing for Phase 4: no key, table or setting.

For Phase 6: no key, package or setting. The five tables are created on first use, and each environment's philosophy is seeded from the repository's document the first time it is asked for. The Music Director role receives the three new permissions once, automatically; **give them to any custom role that should have them** (Admin → Roles). To change the philosophy from now on, use Admin → AI → Planning philosophy, not the Markdown file.

Nothing for Phase 5 either: no key, table, setting or package. It uses `AI_MODEL` (which must support structured output, as the default does) and the library index as it stands; refresh the index if sheet music has been added since.
