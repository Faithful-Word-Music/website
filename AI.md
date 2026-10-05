# Faithful Word Music AI

The internal AI system of the Faithful Word Music website: where it stands, how it is built, and what each phase adds. For the rest of the site see [README.md](./README.md).

## Status

| Phase | What | Status |
|---|---|---|
| **1** | **AI foundation:** the shared AI layer, the `use_ai` permission, the usage log, Admin → AI | **Complete** (live request confirmed 2026-10-05: answer, tokens and cost logged) |
| 2 | To be scoped | Not started |
| 3 | To be scoped | Not started |
| 4 | To be scoped | Not started |
| 5 | To be scoped | Not started |

Where the later phases are headed, in no fixed order yet: structured tools that answer from the real database (song usage, dates, statistics, past and upcoming services), the song library's lyrics and content indexed from the MuseScore files in Google Drive (embeddings, semantic search), the Music Director's planning-philosophy document, the **AI Assistant**, and **Generate with AI** / **Replace Song with AI** in the Service Planner. Fill in the table as each phase is scoped.

**Not built yet, on purpose:** any chat interface, conversation history, Drive or MuseScore ingestion, lyrics, embeddings, pgvector, RAG, song-theme analysis, planning-philosophy ingestion, and anything AI in the Service Planner.

## Architecture

```
page / server action / route          checks use_ai (withPermission, requireAnyPermission)
        │
        ▼
src/lib/ai/service.ts                 the ONLY file that imports the AI SDK
  generateAiText()                    checks use_ai again · times the request · never throws
        │                     │
        ▼                     ▼
Vercel AI SDK  ──►  Vercel AI Gateway  ──►  the model (AI_MODEL)
                    budget · keys · logs
        │
        ▼
src/lib/ai/store.ts  ──►  Neon: ai_usage      one row per request, success or failure
        │
        ▼
/admin/ai                              status · connection test · this month's usage
```

| File | Job |
|---|---|
| `src/lib/ai/service.ts` | `generateAiText()`: the one way to call a model. `backfillAiCosts()`: fills in costs the Gateway reports late (server-only) |
| `src/lib/ai/store.ts` | The `ai_usage` table: `recordAiUsage()` (never throws), `getAiUsageSummary()`, `listRecentAiUsage()` (server-only) |
| `src/lib/ai/config.ts` | `aiConfig()`: model, display budget, whether credentials are present. Never reads or returns the key itself (server-only) |
| `src/lib/ai/features.ts` | `AI_FEATURES`: the features a request can belong to, which is what cost is reported by (pure) |
| `src/lib/ai/errors.ts` | `classifyAiError()`: any failure → one of ten codes, plus a credential-free detail for the log (pure) |
| `src/lib/ai/usage.ts`, `format.ts`, `settings.ts` | Token and cost reading, the month and its budget, how figures are written, defaults and env parsing (pure) |
| `src/content/ai.ts` | Every word a person sees: error messages by code, and the Admin → AI page |
| `src/app/admin/ai/page.tsx`, `src/components/admin/AiConnectionTest.tsx` | Admin → AI |
| `testAiConnectionAction` in `src/app/admin/actions.ts` | The connection test |

### Making an AI request (what Phase 2 builds on)

```ts
const result = await generateAiText({
  viewer,                         // from withPermission("use_ai", ...) or getViewer()
  feature: "assistant",           // a key of AI_FEATURES
  action: "answer",               // optional: what the feature is doing
  instructions: "...",            // the standing instructions
  prompt: "...",
  maxOutputTokens: 800,           // optional
  reasoning: "low",               // optional
});
if (!result.ok) return { ok: false, error: result.message }; // safe to show
result.text; result.tokens; result.costUsd; result.durationMs;
```

Rules for anything added later:

1. **Never import `ai` or `@ai-sdk/*` outside `src/lib/ai/`.** ESLint refuses it. Streaming, tool calling, structured output and embeddings are added as further functions in `service.ts`, sharing the same permission check, logging and error handling.
2. **Check `use_ai` where the request arrives** (`withPermission("use_ai", …)` for an action, `getViewer()` + `viewer.can("use_ai")` for a route), exactly like every other protected feature. The service checks again, but it is the backstop, not the gate.
3. **Name the feature.** Add it to `AI_FEATURES` first; its usage is then reported separately with no other change.
4. **Facts come from the database, not the model.** Song usage, dates, statistics and service history are to be given to the model by tools that run real queries (`lib/song-archive.ts`, `lib/schedule.ts`, `lib/service-planner/intelligence.ts`), never guessed by it.
5. **Never store prompts or answers in `ai_usage`.** Conversation history gets its own tables.
6. **Words go in `src/content/ai.ts`**, and a provider's own error text never reaches the browser.

## Access

Only people holding the **`use_ai`** permission ("Use AI features", `src/lib/auth/permissions.ts`):

- **Administrator** holds every permission, always.
- **Music Director** holds it by default. Existing sites get it once per environment through `PERMISSION_FIXUPS` (`2026-10-ai-permission`), so an administrator who later removes it does not see it come back.
- Song Leader, Musician, Member and visitors do not, and cannot make an AI request: the action refuses, and so does the service.

It is a permission, like everything else on the site, rather than a check of role names. So an administrator can deliberately give it to another role or person under Admin → Roles. `use_ai` also opens the Admin area, where the AI tab lives.

## Provider and Gateway

- **Vercel AI SDK** (`ai`, version 7) calling **Vercel AI Gateway**. Models are plain `provider/model` strings, so no provider package is installed and nothing is tied to OpenAI.
- **Model:** `AI_MODEL`, default `openai/gpt-5.6-terra` (`src/lib/ai/settings.ts`). Changing model or provider is that one variable. Current IDs: <https://ai-gateway.vercel.sh/v1/models>.
- **Credentials:** `AI_GATEWAY_API_KEY`, read by the SDK from the environment. On Vercel a deployment's own `VERCEL_OIDC_TOKEN` works when no key is set; the key wins when both are. Server-side only, never in `NEXT_PUBLIC_*`, never logged.
- **Each request** is tagged for the Gateway's own reports with `feature:<key>` and `env:<development|production>`, and carries the person's Clerk user ID as the Gateway `user`.
- **Limits per request:** 60 seconds (`AI_TIMEOUT_MS`) and one retry.

## Budget

- **Vercel AI Gateway enforces the budget.** Once it is spent the Gateway answers `402`, which the site reports as "This month's AI budget has been used up".
- The site never tries to enforce a limit itself. `AI_MONTHLY_BUDGET_USD` (default `10`) is only the figure shown beside the site's own totals on Admin → AI; keep it equal to the Gateway's. `0` shows no budget.
- The month is the UTC calendar month, the clock the Gateway's monthly budgets reset on.

## Database

One table, created on first use like the planner's and tagged `clerk_env` like every account table (there is no migration step):

**`ai_usage`** - one row per request, successful or not.

| Column | Holds |
|---|---|
| `id`, `clerk_env`, `created_at` | Identity, environment, when |
| `feature`, `action` | Which feature (`AI_FEATURES`), and what it was doing |
| `model`, `response_model` | The model asked for, and the one that answered |
| `clerk_user_id` | Who asked |
| `status`, `error_code`, `error_detail` | `success` or `error`; the failure code; a short credential-free detail |
| `input_tokens`, `output_tokens`, `reasoning_tokens`, `cached_input_tokens`, `total_tokens` | Tokens, each null when the provider did not report it |
| `cost_usd` | The Gateway's cost. Null until known |
| `duration_ms` | How long the request took |
| `generation_id`, `finish_reason` | The Gateway's ID for the request, and why the model stopped |

Indexes: `(clerk_env, created_at DESC)` and `(clerk_env, feature, created_at)`.

**Cost** is the Gateway's own figure. It is taken from the response when the response carries it; otherwise the row is logged with its `generation_id` and the cost is filled in from `gateway.getGenerationInfo()` the next time Admin → AI is opened.

## Failures

`generateAiText()` never throws. Every failure is sorted into a code, logged as `[ai] <feature> failed (<code>): <detail>`, recorded in `ai_usage`, and returned with wording from `src/content/ai.ts`:

| Code | When |
|---|---|
| `forbidden` | The person lacks `use_ai` (not logged to the table) |
| `not-configured` | No Gateway credentials reach the server |
| `auth` | The Gateway refused the credentials (401, 403) |
| `budget` | The Gateway budget or credits are spent (402, also when the SDK reports it as an internal error) |
| `rate-limited` | 429 |
| `model-unavailable` | `AI_MODEL` names a model the Gateway does not have |
| `timeout` | No answer within 60 seconds |
| `invalid-response` | An empty or unparseable answer |
| `provider` | Any other Gateway or provider failure |
| `unknown` | Anything else |

A failure to write the usage row is logged and swallowed, so it never turns an answer into an error. Admin → AI still shows its status and test button when the usage log cannot be read.

## Conventions followed

- **Permissions, not role names**, checked on the server with `withPermission` / `requireAnyPermission` (`src/lib/auth/session.ts`).
- **Pure logic apart from I/O**, as in `lib/service-planner/` and `lib/availability/`: pure modules with Vitest tests, and a `server-only` store.
- **Tables created on first use**, tagged `clerk_env`, with raw SQL through `getSql()` (`src/lib/db.ts`).
- **Server actions return `ActionResult`**; buttons use `useAction`, `Button state` and `ActionMessage`.
- **Copy in `src/content/`**, design tokens only (no hex, no `dark:`), `Card` / `StatTile` / `Pill` / `SectionLabel` / `Notice`, grids from `grid-cols-1`.
- **A missing key never breaks a page:** the feature says it is not set up.
- **New to the codebase:** the ESLint `no-restricted-imports` rule that keeps the AI SDK inside `src/lib/ai/`. Nothing existing enforced a boundary like this; a rule was the lightest way to make "one shared layer" hold.

## Manual setup

1. **Vercel → AI Gateway:** open it for the team, and add credits or a payment method (a budget limits spending; it does not provide it).
2. **Create an API key** (AI Gateway → API Keys → Create key) with a **$10 monthly budget** on it. Copy it once.
3. **Add `AI_GATEWAY_API_KEY`** in Vercel → Settings → Environment Variables for Production, Preview and Development, and in `.env.local`. Optionally `AI_MODEL` and `AI_MONTHLY_BUDGET_USD`.
4. **Redeploy**, then open **Admin → AI** and press **Run test request**.

## Known limitations

- **Text generation only.** No streaming, tool calling, structured output or embeddings yet.
- **Usage is per environment, the budget is not.** Rows are tagged `clerk_env`, so Admin → AI on Production does not count requests made locally or on Preview, while the Gateway's budget covers all three when they share a key.
- **Cost can arrive late.** The Gateway normally returns the cost with the answer (as it did in the first live test). Should it not, the request shows "Cost pending" and is filled in when Admin → AI is next opened; that fallback has not been seen in practice yet.
- **A request that fails before reaching the Gateway has no tokens or cost**, by nature.
- **No rate limit of the site's own.** Only two roles can make requests and the Gateway caps spending; a per-person limit belongs with the Assistant.
- **Admin → AI is a starting point**, not the finished usage page: no history beyond the current month, no charts, no error or latency breakdown.
