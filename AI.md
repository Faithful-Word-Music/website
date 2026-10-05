# Faithful Word Music AI

The internal AI system of the Faithful Word Music website: where it stands, how it is built, and what each phase adds. For the rest of the site see [README.md](./README.md).

## Status

| Phase | What | Status |
|---|---|---|
| **1** | **AI foundation:** the shared AI layer, the `use_ai` permission, the usage log, Admin → AI | **Complete** (2026-10-05) |
| **2** | **Conductor:** the assistant. Read-only tools over the site's own data, streaming, the Conductor page and the floating panel | **Complete** (2026-10-05) |
| 3 | To be scoped | Not started |
| 4 | To be scoped | Not started |
| 5 | To be scoped | Not started |

Where the later phases are headed, in no fixed order yet: the song library's lyrics and content indexed from the MuseScore files in Google Drive (embeddings, semantic search) as a further family of Conductor tools, the Music Director's planning-philosophy document, and **Generate with AI** / **Replace Song with AI** in the Service Planner.

**Not built yet, on purpose:** lyric extraction, MuseScore parsing, Drive indexing, embeddings, pgvector, semantic or full-text lyric search, planning-philosophy ingestion, anything that lets AI change a service plan (generate, replace, reorder, save, publish), conversation history kept on the server, notifications, model routing, scheduled indexing jobs.

## Conductor

**Conductor** is the site's AI assistant ("Faithful Word Music AI Assistant" where a longer name helps). It is for the Music Director and administrators while they plan and review congregational singing, and answers two kinds of question:

- **About this church's music** (when a song was last sung, how often, in what key, what was sung at a service, what is planned, what goes together, whether something is being repeated too soon): **only from the site's own data, through tools.** The model interprets and explains what a tool returned; it never supplies a date, count, key or song from memory.
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
   Vercel AI Gateway         tools.ts → facts.ts → the site's own read layer
   → the model (AI_MODEL)    (song-archive, schedule, song-stats, service-archive,
                              service-planner/intelligence, year-recap)
```

| File | Job |
|---|---|
| `src/lib/ai/service.ts` | `generateAiText()` (one prompt, one answer) and `streamAiText()` (a conversation, with tools, streamed). `backfillAiCosts()` (server-only) |
| `src/lib/ai/stream.ts` | The stream's wire format: one JSON event per line (pure) |
| `src/lib/ai/store.ts` | `ai_usage`: `recordAiUsage()`, `countRecentAiUsage()`, the summaries Admin → AI reads (server-only) |
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

One song may be asked for by title, part of a title or hymnal number. When more than one fits, the tool returns the candidates and the model asks; it never picks.

A tool that cannot read its data returns `{ unavailable: true }` and the model says so. The browser is told only a status key while a tool runs ("Checking the song history…"); tool names, inputs and results never leave the server.

**Adding a tool family** (lyric search in Phase 3): another group in `tools.ts` over its own read functions, a status key in `src/content/conductor.ts`, and a paragraph in `instructions.ts`. Nothing else changes.

## Grounding

`instructions.ts` tells the model, every question:

- This church's facts come **only** from a tool called in this turn. Earlier answers are not a source. Say only what a tool returned; with no tool or an empty result, say the information is not available. Never estimate.
- General music questions need no tool.
- It cannot read lyrics or sheet music, and must not quote a song's words from memory as though it had looked them up.
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

A typical question costs a fraction of a cent to about a cent. AI Gateway's budget remains what stops spending.

## Provider and Gateway

- **Vercel AI SDK** (`ai`, version 7) calling **Vercel AI Gateway**. Models are plain `provider/model` strings.
- **Model:** `AI_MODEL`, default `openai/gpt-5.6-terra`. Conductor uses the same one; it must support tool calling.
- **Credentials:** `AI_GATEWAY_API_KEY`, or the deployment's `VERCEL_OIDC_TOKEN` on Vercel. Server-side only.
- Each request is tagged `feature:<key>` and `env:<development|production>` and carries the person's Clerk user ID.

## Budget

Vercel AI Gateway enforces the budget (a spent one comes back as "This month's AI budget has been used up"). `AI_MONTHLY_BUDGET_USD` (default `10`) only sets the figure shown on Admin → AI.

## Database

One table, unchanged since Phase 1, created on first use and tagged `clerk_env`: **`ai_usage`**, one row per request.

`id`, `clerk_env`, `created_at`, `feature`, `action`, `model`, `response_model`, `clerk_user_id`, `status`, `error_code`, `error_detail`, token columns, `cost_usd`, `duration_ms`, `generation_id`, `finish_reason`.

**A Conductor question is one row** (`assistant` · `answer`) however many model calls it took: their tokens added together, their costs added together, the whole duration. An answer the person stopped is logged with `finish_reason = 'aborted'` and shows as **Stopped**. No prompt, answer, tool input or tool result is ever written.

## Failures

Neither `generateAiText()` nor `streamAiText()` throws. A failure is sorted into a code (`errors.ts`), logged as `[ai] <feature> failed (<code>): <detail>`, recorded, and reported with wording from `src/content/ai.ts`: `forbidden`, `not-configured`, `auth`, `budget`, `rate-limited`, `model-unavailable`, `timeout`, `invalid-response`, `provider`, `unknown`. Before a stream starts it is a JSON response with a status code; once it has started it is an `error` event. Either way the conversation shows the message under the question, with **Try again**, and keeps any text already written.

## Known limitations

- **No lyrics or song content.** Conductor says so when asked.
- **Saved plans only.** Unsaved changes in the planner are not known.
- **History begins October 2025**, so "usual" and "never" are only as good as the records.
- **Cost of a multi-call answer:** the Gateway reports a cost per model call and these are summed. If any call's cost is missing, the row shows "Cost pending", and the later backfill only runs for one-call answers (the Gateway is asked per call, and only the last call's ID is kept).
- **The hourly cap counts rows in `ai_usage`**, so it is per environment, like the usage figures.
- **The conversation is per tab.** A second tab starts its own.
- **Not verified live in Phase 2:** a signed-in person without `use_ai` (no such test account; covered by the route's check, the 401 for a signed-out request, and the navigation tests), and a provider failure mid-stream (the path is the Phase 1 classifier).

## Manual setup

Nothing new for Phase 2: no environment variables, no schema change. From Phase 1: an AI Gateway key with a monthly budget in `AI_GATEWAY_API_KEY`, optionally `AI_MODEL` and `AI_MONTHLY_BUDGET_USD`.
