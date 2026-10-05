# Faithful Word Music AI

The internal AI system of the Faithful Word Music website: where it stands, how it is built, and what each phase adds. For the rest of the site see [README.md](./README.md).

## Status

| Phase | What | Status |
|---|---|---|
| **1** | **AI foundation:** the shared AI layer, the `use_ai` permission, the usage log, Admin → AI | **Complete** (2026-10-05) |
| **2** | **Conductor:** the assistant. Read-only tools over the site's own data, streaming, the Conductor page and the floating panel | **Complete** (2026-10-05) |
| **3** | **Library Intelligence:** the songs' lyrics read from the MuseScore files, a persistent index in Neon, embeddings, exact and by-theme search, the lyric tools; usage counted per Gateway call | **Complete** (2026-10-05) |
| 4 | To be scoped | Not started |
| 5 | To be scoped | Not started |

Where the later phases are headed, in no fixed order yet: the Music Director's planning-philosophy document, and **Generate with AI** / **Replace Song with AI** in the Service Planner, which will plan from the history (Phase 2) and from what the songs say (Phase 3). The songs' **chords** (in the Chords files, as their own elements beside the lyrics) could be read into the same index if a later feature needs harmony.

**Not built yet, on purpose:** anything about the music itself (notes, rhythm, harmony, chords, transposition, reading a PDF), planning-philosophy ingestion, anything that lets AI change a service plan (generate, replace, reorder, save, publish), conversation history kept on the server, notifications, model routing, scheduled indexing jobs.

## Conductor

**Conductor** is the site's AI assistant ("Faithful Word Music AI Assistant" where a longer name helps). It is for the Music Director and administrators while they plan and review congregational singing, and answers two kinds of question:

- **About this church's music** (when a song was last sung, how often, in what key, what was sung at a service, what is planned, what goes together, whether something is being repeated too soon, **and what a song says**: a verse, a phrase, its themes, songs like it): **only from the site's own data, through tools.** The model interprets and explains what a tool returned; it never supplies a date, count, key, song or lyric from memory.
- **About music in general** (theory, arranging, instruments, audio, equipment): from the model's own knowledge.

It only reads. Nothing a person asks can create, change, publish or delete anything.

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
     (AI_EMBEDDING_MODEL)              └─ lyrics.ts → src/lib/library-content (the library index)
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
| `src/lib/ai/service.ts` | `generateAiText()` (one prompt, one answer), `streamAiText()` (a conversation, with tools, streamed), `embedAiValues()` (texts to vectors), `withAiOperation()` (several calls as one logged request), `backfillAiCosts()` (server-only) |
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
5. **Tools read. They never write.** A tool that changes something belongs to a later phase and needs its own design (approval, audit).
6. **Never store prompts, answers or tool results** in `ai_usage`, or anywhere else on the server.
7. **Words go in `src/content/`**, and a provider's own error text never reaches the browser.
8. **One request, however many calls.** Anything that calls the Gateway more than once does it inside one logged request: a tool's embedding joins the answer's row by itself, and work that is only its calls is wrapped in `withAiOperation()`.
9. **Exact words are matched as text; meaning is matched by embeddings.** Neither stands in for the other.

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

## Grounding

`instructions.ts` tells the model, every question:

- This church's facts come **only** from a tool called in this turn. Earlier answers are not a source. Say only what a tool returned; with no tool or an empty result, say the information is not available. Never estimate.
- General music questions need no tool.
- **Lyrics follow the same rule.** It knows a song's words only from a lyric tool called in this turn: before quoting, paraphrasing, summarizing or saying what a song is about, it calls `get_song_lyrics`, for every song however famous. It quotes exactly what came back, and when a song's lyrics are not indexed, or the song is not in the library, it says they are not available rather than supplying them.
- Exact words go to `find_lyrics`, a subject to `search_songs_by_theme`; a ranking by meaning is judged from the words returned, and a loose fit is called one.
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

- **One per browser tab**, in `conductor-store.ts`, shared by the page and the panel. The store owns the request, so an answer keeps streaming when the panel closes or the page changes.
- Kept in `sessionStorage` (`fwm:conductor-session`) with its owner's user ID: it survives a reload, ends when the tab or the installed app closes, and is discarded if someone else signs in.
- **New conversation** clears it everywhere.
- **Nothing is stored on the server.** There are no conversation tables.

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

## Failures

Neither `generateAiText()` nor `streamAiText()` throws. A failure is sorted into a code (`errors.ts`), logged as `[ai] <feature> failed (<code>): <detail>`, recorded, and reported with wording from `src/content/ai.ts`: `forbidden`, `not-configured`, `auth`, `budget`, `rate-limited`, `model-unavailable`, `timeout`, `invalid-response`, `provider`, `unknown`. Before a stream starts it is a JSON response with a status code; once it has started it is an `error` event. Either way the conversation shows the message under the question, with **Try again**, and keeps any text already written.

## Known limitations

- **Lyrics are only as good as the files.** A word mistyped in MuseScore is quoted mistyped; a first syllable never typed in is missing ("ywhere with Jesus"); a few scores put part of a verse in another voice, which arrives as an "other voice" section rather than in its place. Fix the file and refresh.
- **Some lines are not labelled as a person would.** A Psalm's sections are passes through its repeats, in the order they are written, not always the order they are sung. A refrain that the score writes under every verse is part of each verse.
- **Lyrics keep poetic spellings**, so an exact search for "every" does not find "ev'ry". Conductor is told; searching by theme does not care.
- **The index is refreshed by hand.** New or changed sheet music is not searchable until someone presses Refresh. Admin → AI shows how many songs are out of date.
- **No music.** Notes, rhythm, harmony and chords are not read.
- **A file that matches no row of the Songs tab is not indexed.** Of 546 Standard MuseScore files in Drive at the first refresh, 488 were a song's source; the rest were not looked into.
- **Saved plans only.** Unsaved changes in the planner are not known.
- **History begins October 2025**, so "usual" and "never" are only as good as the records. Most of the hymnal has never been sung in them, and a search by theme returns such songs unless asked for songs sung before.
- **Cost pending:** a request shows "Cost pending" until every one of its calls has a cost; the backfill fills them in when Admin → AI is next opened.
- **The hourly cap counts rows in `ai_usage`**, so it is per environment, like the usage figures.
- **The conversation is per tab.** A second tab starts its own.
- **Not verified live in Phase 3:** the **Refresh library index** button itself was not pressed in a browser. The refresh it calls was run pass by pass against the real Drive, Neon and Gateway (first run, an unchanged run, a rebuild), the lyric tools were asked real questions through Conductor, and the Admin → AI section was looked at on a wide screen and at phone width.
- **Not verified live in Phase 2:** a signed-in person without `use_ai` (no such test account; covered by the route's check, the 401 for a signed-out request, and the navigation tests), and a provider failure mid-stream (the path is the Phase 1 classifier).

## Manual setup

From Phase 1: an AI Gateway key with a monthly budget in `AI_GATEWAY_API_KEY`, optionally `AI_MODEL` and `AI_MONTHLY_BUDGET_USD`. Nothing new for Phase 2.

For Phase 3:

- **Press Refresh library index once in each environment** (Admin → AI), and again whenever sheet music is added or changed. Local and Preview share one index (`development`); Production has its own.
- `AI_EMBEDDING_MODEL` is optional.
- **pgvector** is enabled by the site itself the first time the index is used (`CREATE EXTENSION IF NOT EXISTS vector`), which the database's owner role may do; it was on the Neon database in use. If a different database refuses, enable the `vector` extension once in its console.
- The Google service account needs nothing new: it already reads the Sheet Music folder.
