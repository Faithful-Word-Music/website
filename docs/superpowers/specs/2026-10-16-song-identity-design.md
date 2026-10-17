# Faithful Word Music — Complete Song Identity Architecture Migration

## Role and objective

You are working in the `Faithful-Word-Music/website` GitHub repository, a production Next.js 16 / React 19 / TypeScript application deployed to Vercel with Neon PostgreSQL.

Your task is to **completely resolve the application's song identity problems** by transitioning from title-based identification to a reliable identity system centered on the existing Sheet Music Index Song IDs.

This is a production-sensitive architectural correction. It must be implemented comprehensively, efficiently, and conservatively.

**Do not merely fix the visible bug. Fix the underlying identity system and every affected dependency.**

### Git and deployment restrictions

- Work **exclusively on the `dev` branch**.
- Confirm the current branch and working tree before modifying anything.
- Do not modify, commit to, merge into, or push to `master`.
- Do not create or merge a pull request.
- Do not deploy manually.
- Do not alter Vercel production configuration or production environment variables.
- You are authorized to create a commit containing your completed, verified changes on `dev`.
- If the working tree contains unrelated changes, preserve them. Do not include them in your commit.
- Do not force-push or rewrite history.
- If the current branch is not `dev`, switch safely to `dev` without discarding existing changes.
- If you cannot safely work on `dev`, stop and explain why.

The developer will test the resulting Vercel preview deployment and decide whether to merge the changes into `master`.

## Background: the actual bug

Our hymnal, *Soul-Stirring Songs & Hymns (1989)*, contains two different musical arrangements sharing the same title:

| Property | Arrangement 1 | Arrangement 2 |
|---|---|---|
| Title | All Hail the Power of Jesus' Name | All Hail the Power of Jesus' Name |
| Hymn number | 167 | 168 |
| Song ID | `SSSH1989-167` | `SSSH1989-168` |
| Key | G | A♭ |
| Tune | Different | Different |
| Sheet music | Separate files | Separate files |

The Sheet Music Index and Google Drive already recognize these as distinct songs.

However, the website historically identifies songs by normalized title in multiple places.

Consequences include:

- Different arrangements are collapsed into one entry.
- The wrong Library page opens when a song is clicked.
- Sheet music from one arrangement may appear for another.
- Historical performance counts are combined.
- Rotation statistics and previous-performance information can be inaccurate.
- Conductor and other song intelligence may conflate arrangements.
- The catalog prevents some distinct songs with identical titles from being stored separately.

### Existing partial fix

A previous commit on `dev`:

`4c61c34769fe0c34135b4acc1a458392415176d1`

Introduced partial duplicate-number handling in the Service Planner candidate builder.

That commit allows both #167 and #168 to appear as candidates, but **does not solve the complete song identity problem**.

Inspect the existing implementation and replace or improve the temporary logic where appropriate.

Do not blindly stack new identity mechanisms on top of the previous workaround.

## Required architectural design

### 1. Establish canonical song identity

Use the existing Sheet Music Index's **Song ID** as the authoritative identifier for songs represented in that index.

Examples:

- `SSSH1989-167`
- `SSSH1989-168`

The Song ID distinguishes the collection and entry, unlike a hymn number or title.

Inspect the existing Sheet Music Index parser and its Song ID semantics before implementation.

Important distinction:

A song entry, arrangement, musical work, and occurrence in a hymnal are not necessarily the same conceptual entity. Do not automatically merge or separate songs solely because they share lyrics, titles, or hymn numbers.

For this application, indexed entries with distinct Song IDs must remain independently addressable. Existing deliberate associations of identical musical works across collections must continue functioning where appropriate.

The canonical identity mechanism must:

- Distinguish songs with identical titles.
- Distinguish hymn numbers across collections.
- Preserve original capitalization and display titles.
- Support unnumbered songs.
- Support catalog-only songs that have no Sheet Music Index entry.
- Support songs appearing in historical records.
- Avoid losing identities when titles or numbers are edited.
- Avoid mismatching songs when the index is temporarily unavailable.
- Remain compatible with existing published services and archived records.

Prefer a central identity module with well-defined pure functions and types rather than repeating identity-comparison logic throughout the application.

For catalog-only songs, establish a durable, stable identity that does not change when the title changes. If schema changes are necessary, design a safe migration of existing records.

Do not use title-derived identifiers as the authoritative identity for newly created catalog records.

### 2. Establish unambiguous matching rules

Implement a consistent, documented song-resolution policy.

Recommended priority for indexed songs:

1. Explicit canonical Song ID.
2. Unambiguous existing association to the indexed song.
3. Collection plus normalized hymn number.
4. Unique normalized title match, only when genuinely unambiguous.
5. Safe fallback or unresolved identity.

Never silently select the first match when multiple arrangements share a title.

Do not treat the hymnal number alone as globally unique.

Do not assume that all identical titles represent the same tune.

Do not assign ambiguous historical records to arbitrary indexed entries.

Ensure failures in external Google Sheets or Google Drive access do not cause existing identities to change unexpectedly.

## 3. Fix all song URLs and routing

Use readable URLs with the canonical identifier at the end.

For example:

`/library/songs/all-hail-the-power-of-jesus-name-sssh1989-167`

`/library/songs/all-hail-the-power-of-jesus-name-sssh1989-168`

These are the preferred URL shapes. Implement robust encoding and parsing rather than naïvely splitting the last hyphen.

The title portion should be human-readable, while the identity portion determines which song is actually loaded.

Requirements:

- Both arrangements must have distinct pages.
- Each URL must resolve to exactly the intended song.
- Sheet music links must remain associated with the correct entry.
- Canonical metadata and sharing links must use the correct URL.
- Slugs must be stable and deterministic.
- Song ID parsing must accommodate the actual formats supported by the Sheet Music Index.
- Catalog-only songs must also receive unique URLs.
- Unnumbered songs must work.
- Titles containing numbers or unusual punctuation must not break routing.

### Backward compatibility

Existing title-only links must continue functioning whenever an unambiguous legacy destination can be established.

For example:

`/library/songs/amazing-grace`

Legacy links for ambiguous duplicate titles require a deliberate compatibility strategy.

Do not silently redirect an ambiguous title to an arbitrary arrangement.

Consider how existing bookmarks, external links, historical archive links, and search-engine indexing will behave.

Use appropriate canonical URLs and redirects where safe.

Do not implement a solution that results in widespread broken links.

## 4. Fix the public Library

Relevant starting points:

- `src/lib/library.ts`
- `src/lib/song-archive.ts`
- `src/components/library/SongIndex.tsx`
- `src/app/library/page.tsx`
- `src/app/library/songs/[song]/page.tsx`

Currently, the Library uses a title-derived slug as the map key.

That causes multiple arrangements with identical titles to collapse into one listing.

Replace this with canonical identity-based deduplication.

Requirements:

- Show #167 and #168 independently.
- Show the appropriate hymn number for each.
- Link each entry to its correct page.
- Keep alphabetical sorting.
- Preserve existing Library search by title and hymn number.
- Preserve sheet music availability indicators.
- Preserve public and authenticated permission boundaries.
- Avoid duplicate entries for genuinely identical identities arriving from multiple data sources.
- Support indexed songs and catalog-only songs.
- Handle songs missing from the Sheet Music Index.
- Preserve sensible behavior when the index cannot be loaded.

Review whether the Library should continue sourcing its visible entries from historical records, upcoming services, and catalog records, or should directly include all indexed entries.

The desired result is that **a legitimate song in the Sheet Music Index should be discoverable in the Library without first needing to appear in a service or be manually re-created in the catalog**, subject to existing visibility and rights policies.

Do not accidentally expose copyrighted sheet music, private source metadata, or restricted information.

## 5. Fix song pages and sheet music

Relevant starting points:

- `src/lib/song-archive.ts`
- `src/lib/sheet-music.ts`
- `src/lib/sheet-music-index.ts`
- `src/app/library/songs/[song]/page.tsx`
- `src/app/library/songs/[song]/sheet-music/[file]/route.ts`

Each song page must resolve by its canonical identity.

For hymn #168:

- Display hymn #168.
- Display its proper key, A♭.
- Show its own sheet music.
- Show only its associated performance history.
- Show its own usage statistics.
- Show its correct upcoming service appearances.
- Apply its own capo-sheet-music rules where applicable.

Hymn #167 must remain independent.

Never allow a title-based fallback to override an explicit Song ID.

Keep the current sheet music permission and copyright logic intact.

Preserve cache freshness, file-version handling, and refresh functionality.

Avoid changing the existing Google Drive folder structure or Sheet Music Index schema unless genuinely necessary.

## 6. Fix Service Planner song identification

Relevant starting points:

- `src/lib/service-planner/intelligence.ts`
- `src/lib/service-planner/picker.ts`
- `src/lib/service-planner/model.ts`
- `src/lib/service-planner/load.ts`
- `src/lib/service-planner/store.ts`
- `src/components/service-planner/SongPicker.tsx`
- `src/components/service-planner/Workspace.tsx`

The Service Planner must use canonical identities consistently.

Most importantly, **ordinary hymn-number search must continue working**.

Required behavior:

Typing `168` should return the appropriate hymn #168.

Typing `167` should return hymn #167.

Typing `all hail` should display both arrangements separately.

Users should **never need to type or memorize the full Song ID**.

Additional requirements:

- Preserve title search.
- Preserve partial title search.
- Preserve insert filtering.
- Preserve seasonal suggestions.
- Preserve suggested song keys.
- Preserve musician sheet music checks.
- Preserve song locks and AI regeneration workflows.
- Preserve per-service key changes.
- Preserve the weekly insert workflow.
- Preserve existing service-plan editing and publication behavior.
- Prevent accidental collisions between identically titled arrangements.
- Permit two arrangements with the same title to be recognized as different songs.
- Ensure usage history and upcoming-service information are arrangement-specific.

Review duplicate-song prevention.

Two entries with the same Song ID should be considered the same song even if their titles differ slightly.

Two entries with different Song IDs should not automatically be considered the same song merely because their titles match.

### Existing partial implementation

The previous commit introduced temporary IDs such as a normalized title plus `~168`.

Replace those with canonical Song IDs wherever available.

Preserve existing functionality while doing so.

## 7. Fix the song catalog and database constraints

The current planner catalog is defined in:

`src/lib/service-planner/store.ts`

Its existing table uses:

`PRIMARY KEY (clerk_env, title_key)`

This prevents storing two catalog-only songs with the same normalized title.

Correct the model so that stable song identity, rather than title alone, controls uniqueness.

Requirements:

- Existing catalog rows must survive migration.
- Existing service plans must survive migration.
- Existing users' data must survive migration.
- Separate development and production data must remain isolated.
- Migrations must be repeatable and safe.
- Do not silently overwrite records.
- Do not drop or truncate user data.
- Do not make destructive assumptions about existing duplicate data.
- Preserve concurrency safety.
- Ensure the application's existing schema-initialization approach still works.
- Avoid unnecessary new infrastructure.

Inspect the actual schema-management strategy before deciding whether to use a SQL migration, versioned fixup, or another mechanism consistent with the repository.

Do not manually run destructive database commands against production.

If a migration requires human approval or cannot be verified safely, stop before performing the risky operation and explain the dependency.

## 8. Fix historical statistics and archival identity

Relevant starting points:

- `src/lib/song-history.ts`
- `src/lib/song-stats.ts`
- `src/lib/song-archive.ts`
- `src/lib/year-recap.ts`
- `src/lib/archive-view.ts`
- `src/lib/archive-store.ts`

The existing `buildSongRecords()` groups songs by normalized title.

This incorrectly combines performances of different arrangements.

Correct all applicable history and statistics calculations.

These should distinguish:

- Total times sung.
- Most recent performance.
- Historical performance dates.
- Performance frequency.
- Yearly statistics.
- Key usage.
- Song pairings.
- Rotation recommendations.
- Upcoming performances.
- Song-specific recap calculations.

Keep the existing distinction between numbered hymns and inserts, including insert weekly-counting behavior.

### Critical historical-data rule

Do not rewrite, delete, or fabricate historical service records.

Previously saved records may only contain title, hymn number, and performed key.

Where title plus hymn number and other existing evidence resolve an arrangement unambiguously, use that information.

When historical information is insufficient, preserve the record and represent its identity as unresolved or legacy-compatible.

Do not merge an ambiguous historical performance into #167 or #168 simply because they share a title.

Do not infer the identity from the performed key alone.

Any migration must preserve existing archive freezing and freshness semantics.

## 9. Fix Conductor and AI-assisted planning

Relevant starting points:

- `src/lib/ai/conductor/`
- `src/lib/ai/service-planner/`
- `src/lib/library-content/`

Review every AI tool and helper that identifies, searches, recommends, or describes songs.

Requirements:

- Conductor must distinguish #167 from #168.
- Recommendations must use the correct song's history.
- Sheet music metadata must come from the correct arrangement.
- AI-generated plans must reference the correct canonical identity.
- AI plan validation must not collapse different arrangements.
- Existing model-facing display data should include enough context to distinguish duplicate titles.
- Do not change the AI's existing permissions or budget safeguards.
- Do not alter the AI's established planning philosophy.
- Do not introduce additional AI requests merely to resolve song identity.
- Do not unnecessarily increase token usage.

Preserve existing AI workflows and their current behavior outside this bug.

## 10. Audit every song-page link

Do not assume `SongLink.tsx` is the only place generating song URLs.

Search the complete repository for:

- `SongLink`
- `songSlug`
- `songPath`
- Title-based song URL construction.
- Historical archive links.
- Service Planner links.
- Dashboard links.
- Search links.
- Share links.
- AI-generated links.
- Sitemap and canonical metadata.
- Sheet music routes.

Update affected call sites so the correct identity is carried into the generated link.

A user clicking hymn #168 anywhere in the application must open hymn #168's page.

Avoid breaking unrelated routes.

## 11. Backward compatibility and safety

This is a production application with real data.

Non-negotiable requirements:

- No loss of archived history.
- No loss of service plans.
- No loss of song catalog entries.
- No loss of sheet music associations.
- No changes to existing permission boundaries.
- No accidental exposure of copyrighted files.
- No unrelated UI redesigns.
- No unrelated dependency upgrades.
- No changes to notification behavior.
- No changes to authentication or account management.
- No modifications to production infrastructure.
- No unnecessary changes to public APIs.

Preserve the existing look and feel.

Only change UI where necessary to distinguish songs clearly.

Prefer a small, coherent implementation over an expansive redesign.

## 12. Required tests

Before committing, run the project's existing validation commands, using the scripts actually defined in `package.json`.

At minimum, where supported:

- TypeScript type checking.
- ESLint.
- Full unit test suite.
- Production build.
- Relevant existing integration tests.

Add targeted regression tests for:

1. Same title, different hymn numbers.
2. Same title, different collections.
3. Distinct Song IDs.
4. Same song with harmless title punctuation differences.
5. Catalog-only songs without an index entry.
6. Unnumbered songs and inserts.
7. Search by hymn number.
8. Search by partial title.
9. Canonical URL generation.
10. Canonical URL resolution.
11. Legacy URL compatibility.
12. Ambiguous legacy URLs.
13. Correct sheet music association.
14. Historical performances counted separately.
15. Existing historical records without explicit IDs.
16. Planner duplicate detection.
17. AI candidate identity resolution.
18. Index temporarily unavailable.
19. No unauthorized file access.
20. Migration idempotency, if a database migration is needed.

Specifically test:

- `SSSH1989-167`, G.
- `SSSH1989-168`, A♭.

Both must remain completely independent in all identity-sensitive features.

Do not claim tests passed unless they actually ran and passed.

## 13. Required pre-commit audit

After implementation, before committing:

1. Review the complete diff.
2. Check for missing call-site updates.
3. Search for remaining title-only identity comparisons.
4. Confirm that all new URL paths resolve consistently.
5. Confirm the catalog migration is safe.
6. Confirm no unrelated files were changed.
7. Confirm existing historical records remain untouched.
8. Confirm `dev` is the active branch.
9. Run all available verification.
10. Fix any failures introduced by the implementation.

Do not commit a known broken or incomplete identity migration.

If validation is blocked by missing secrets, external integrations, or infrastructure, distinguish those blockers from actual test failures. Do not invent successful verification.

If essential verification cannot be completed, report the blocker before committing.

## 14. Commit instructions

Once the implementation and audits are complete:

- Commit the full fix to `dev`.
- Use a descriptive commit message, such as:

`fix: migrate song identity to canonical index IDs`

- Do not merge to `master`.
- Do not manually deploy.
- Do not create a pull request unless explicitly requested.
- Do not include unrelated changes.

Prefer one coherent commit. Multiple commits are acceptable only if necessary to keep the implementation safely organized.

## 15. Final report

When finished, provide:

**Implementation summary**
- What was changed.
- How canonical identity now works.
- How catalog-only songs are identified.
- How legacy URLs behave.
- How historical ambiguity is handled.

**Verification**
- Tests run and results.
- Type-check result.
- Lint result.
- Build result.
- Any environment-dependent checks that remain unverified.

**Git**
- Branch.
- Commit SHA.
- GitHub commit URL.
- Confirmation that `master` was untouched.

**Manual Vercel Preview checklist**
- Search `168` in Service Planner.
- Search `all hail` and verify both arrangements.
- Click #167 and confirm its Library page and sheet music.
- Click #168 and confirm its Library page and sheet music.
- Verify both arrangements have independent history.
- Verify Library searches.
- Verify existing song links still work.
- Verify adding and publishing a service still works.
- Verify Conductor recognizes both arrangements correctly.

## 16. Execution and efficiency requirements

Do not waste time or tokens exploring unrelated parts of the repository.

Start with the identified modules and follow their actual dependencies.

Read existing implementation and tests before editing.

Prefer existing utilities and architectural patterns.

Avoid broad refactors unrelated to song identity.

Do not stop after only fixing the Service Planner or Library URL.

Do not leave the repository in a state where some pages use canonical IDs while other identity-sensitive systems incorrectly collapse arrangements by title.

Do not ask for routine implementation decisions already covered by this specification.

Use sound engineering judgment for internal naming, helper organization, and migration details.

If an ambiguity could cause data loss or incorrect attribution, choose the conservative, non-destructive behavior.

**The final deliverable is a complete, verified Song ID architecture correction committed exclusively to `dev`, ready for Vercel Preview testing and subsequent review before any production merge.**