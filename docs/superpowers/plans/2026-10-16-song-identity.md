# Canonical Song Identity Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the bounded persistence, planner and AI tasks; the coordinator owns the shared resolver, public read layer and link audit.

**Goal:** Keep every indexed arrangement independently addressable throughout the application, with safe legacy compatibility.

**Architecture:** A pure resolver uses explicit Song ID, then collection/number, then a unique title. An optional `songId` and `collection` travel with song references; immutable catalog UUIDs and deterministic unresolved legacy evidence complete the identity space. Indexed entries remain separate even when titles match. Public URLs end in the full canonical ID, resolved against known identities rather than splitting on a hyphen.

**Tech Stack:** Existing Next.js 16.3.5, React 19, TypeScript, Vitest, Neon SQL.

**Spec:** ../specs/2026-10-16-song-identity-design.md

## Global Constraints

- Work and commit exclusively on `dev`; no PR, push, merge or manual deployment.
- Preserve real records, production configuration, authentication, permissions and notification behavior.
- No dependency upgrades or unrelated UI work.
- Keep the existing archive freeze/freshness rules and weekly insert counting.
- Run tests before implementing changed behavior; commit once after all essential verification.

## Review Focus

- Explicit IDs with stale titles/numbers or a temporarily unavailable index must never match a different entry.
- Duplicate titles and collection-local numbers must remain ambiguous without enough evidence.
- Preview initialization must not change the tables or rows production code currently writes.
- Legacy bookmarks and old titles must resolve safely, including disambiguation for duplicate titles.
- Every song URL, AI association, capo rule and history statistic must carry arrangement identity.

### Task 1: Shared identity and URL policy

- [x] Add failing regression tests for explicit index IDs, collection/number resolution, ambiguous titles, punctuation, catalog UUIDs, unnumbered entries, ID suffixes and index outages.
- [x] Create `src/lib/song-identity.ts`: `SongReference`, `IdentityEntry`, `resolveSong`, `songIdentity`, `identifySong`, `indexEntries`, `songUrlSlug`, `songsForSlug`, `sameSong`.
- [x] Route `matchIndexSong` through the resolver. Keep display spelling and rights unchanged.
- [x] Run focused identity and sheet music tests.

### Task 2: Non-destructive persistence

- [x] Extend Song, PlanSong, InsertWeek references with optional songId/collection and preserve them through serialization.
- [x] Add catalog identity storage with environment-scoped, transactional, repeatable copying from the old title-key catalog; retain old rows and tables for production compatibility.
- [x] Carry optional identity into newly written archive rows; leave historical stored rows untouched.
- [x] Test catalog migration idempotency/concurrency and read/write identity round trips without live production commands.

### Task 3: Planner and AI

- [x] Test both All Hail candidates, number/partial-title searches, duplicate detection, independent usage and AI links.
- [x] Replace temporary title~number candidate IDs; preserve identity in picker, locks, insertion and server actions.
- [x] Use the shared resolver throughout Conductor and AI planning, preserving ambiguity and model safeguards.
- [x] Run planner and AI suites.

### Task 4: Library, history and all links

- [x] Test identity grouping, independent stats/pairings, canonical/legacy URLs, and file authorization.
- [x] Include all indexed songs plus catalog/history/upcoming entries, deduplicated by resolved identity.
- [x] Resolve song pages/files by ID; redirect safe legacy pages and offer choices for ambiguous legacy titles.
- [x] Carry identity through schedule, archive, recap, dashboard, share/search/report and capo links.
- [x] Run focused history/library/link suites.

### Task 5: Audit and verification

- [x] Search all remaining title comparisons and song URL construction; review the complete diff and migration safety.
- [x] Run `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` and relevant available integration checks.
- [x] Obtain fresh review, fix important findings, verify `dev` and clean scope.
- [ ] Create one coherent commit. Blocked: sandbox Git staging permission was declined after `.git/index.lock` creation failed.
- [x] Report actual verification, the commit blocker, unresolved environment checks, and the manual Preview checklist.

## Completion evidence

- `npm test` with isolated PostgreSQL enabled: 1,301 passed, one opt-in live MuseScore survey skipped.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed without warnings.
- `npm run build`: passed with live database/Google access disabled in the build process; 128 static pages generated.
- Fresh independent review found link, nullable-metadata and outage evidence gaps. All reported findings were fixed with regressions; scoped recheck passed 47 tests and reported no remaining blocker.
- No dependency, production configuration, authentication/notification policy or frozen historical data changes.
- Live Neon/Google/model/publication behavior and distributed PostgreSQL lock contention remain Preview checks.
- Changes remain uncommitted on dev because elevated Git staging permission was declined. No push, PR, merge or manual deployment occurred.
