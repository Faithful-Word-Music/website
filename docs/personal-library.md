# Personal Library

Each member's private favorites, recent history and song notes. **Favorites are live as of P2.2** ([Favorites](#favorites-p22)). Notes and recent history remain storage only, with no page, button or view tracking. The code is in `src/lib/personal-library/`.

| File | Purpose |
|---|---|
| `schema.mjs` | The additive tables |
| `identity.ts` | Which song a record belongs to (pure) |
| `favorites.ts` | One logical Favorite per song; search, sort, cursors, batched membership (pure) |
| `store.ts` | Owner-scoped reads and writes |
| `erasure.ts` | The order of an account erasure (pure) |
| `authorize.ts` | `withPersonalLibrary`, the boundary for every Personal Library operation |
| `server.ts` | Server-only client, strict song directory, erasure wiring |

## Who may use it

An approved member is anyone with a valid session in this Clerk environment whose profile is not overdue. `withPersonalLibrary` is `withPermission(null, ...)` with the normal profile gate, so it adds no parallel approval system and is no looser than the rest of the site.

- It needs no church affiliation, musician or Song Leader role, sheet music access, or admin permission.
- The owner comes only from the session. No caller can name another user or environment.
- Administrators, Music Directors and profile managers have no access to anyone else's records. No code path exists for it.
- A favorite, note or history entry never grants sheet music.
- Personal Library data is not used by AI, embeddings, analytics, reports, notifications or shared caches, and `invariants.test.ts` checks this against the source.

### Clerk settings this relies on

These are Clerk dashboard settings, which source code cannot show. **The owner has confirmed both in Development and Production.** They were not verified by automated inspection, and must stay on:

1. **Access mode is Invite-only.** The approved-member definition relies on it: anyone able to create a Clerk account would count as a Member.
2. **Users cannot delete their own accounts.** `/account` embeds Clerk's profile screen and the site has no Clerk webhook. A self-deletion would remove the Clerk user but leave all of that person's site data, including private notes.

### Disabled accounts

`getViewer` verifies the session token and does not ask Clerk about ban state on each request. Disabling an account revokes its sessions, but a token already issued can keep working until it expires, normally within about a minute. This limit already applies across the site. The Personal Library inherits it unchanged and does not widen it.

## Tables

All are keyed by `clerk_env` and `clerk_user_id`. There are no foreign keys, so an incomplete song catalog can never remove a record.

| Table | Primary key | Ordered index |
|---|---|---|
| `user_song_favorites` | env, user, song | `created_at DESC, song_id` |
| `user_library_recent` | env, user, kind, key | `last_viewed_at DESC, kind, key` |
| `user_song_notes` | env, user, song | Reads by primary key |
| `personal_library_erasures` | env, user | Partial index on pending rows |

The fourth table is an owner-approved addition to the three-table design. It holds no names or content.

Tables install on first use through `applySchema`: one transaction, under the site's schema lock, skipped once ready. A failed install leaves nothing behind and is retried, and it does not affect the rest of the site.

**Environments.** Local and Preview share Clerk Development, so they intentionally share Development records. Production is separate. The environment comes from the Clerk keys.

## Song identity

`resolvePersonalSong` is stricter than `songIdentity`:

| Input | New record |
|---|---|
| Current index ID | Accepted |
| Persisted catalog ID or alias | Accepted, stored under the canonical ID |
| Title, fabricated ID | `unknown` |
| `legacy-n-*`, `legacy-t-*` | `not-durable` |
| Alias claimed by two songs | `ambiguous` |
| Index or catalog unreadable | `directory-unavailable` |

Stored keys are never rewritten. Reads and writes pass the song's safe spellings (`storedIds`), so an old alias still finds its record. `describeStoredSong` reports a stored record as `available`, `unavailable`, `ambiguous`, or `unknown` during an outage. **No directory result ever deletes a record.**

**Alias and case safety (P2.2):**

- `storedIds` holds the canonical ID plus only the aliases no other song claims, so a change to one song cannot reach another's record.
- A song whose own ID is also claimed by another song is `ambiguous` under every spelling.
- IDs compare through one fold, `foldSongId`, matched in SQL by `FOLDED_SONG_ID`. It lowercases **ASCII only**, because JavaScript and PostgreSQL lowercase other characters differently. A non-ASCII lookalike is a different song.
- Two index IDs differing only by case stay two entries and resolve as `ambiguous`. They are never merged.
- Favorites match case-insensitively, so a case variant cannot create a duplicate. Notes still match their exact stored spellings.
- Removing an unresolvable entry (`removeExactFavorite`) is **case-sensitive with no alias expansion**.

**Known limitation:** a song known only from history, with no index or catalog identity, cannot be newly favorited or noted. Its `legacy-*` identity is derived from a title or number and is not proven durable.

## Favorites (P2.2)

Part of the one Library. There is no separate My Library page or navbar item.

| Route | Access | Rendering |
|---|---|---|
| `/library` (All Songs) | Public | Cached, hourly |
| `/library/songs/[song]` | Public | Cached on first visit, hourly |
| `/library/favorites` | Approved members; checked on the page, not only by the proxy | Dynamic, `noindex`, holds no Favorites in its HTML |

`app/library/layout.tsx` only mounts a client provider and reads no session, so the public pages stay cached. Hearts, section links and membership load in the browser, and a visitor sends no Favorites request. Future sections stay hidden until they work.

### API

All in `app/api/account/favorites/handlers.ts`, through `withPersonalLibrary`, answered `private, no-store`.

| Endpoint | Purpose |
|---|---|
| `GET /api/account/favorites` | `sort` (`recent`, `title`, `number`), `q`, `cursor`, `limit` (default 50, maximum 100) |
| `POST /api/account/favorites/membership` | Up to 200 IDs in one set-based query |
| `PUT /api/account/favorites/[songId]` | `{ favorite, expectedAccount, exact? }`. An explicit state; there is no toggle |

- State-changing and membership requests must be same-origin.
- `expectedAccount` grants nothing. It refuses a request queued for one account and sent after the session became another's.
- `exact: true` removes one stored key and can never add.
- Errors are controlled codes (`FavoriteErrorCode`). A directory failure is never reported as a missing song.
- Idempotent is not the same as ordered: a delayed older request can still overwrite a newer one.

### Listing

Every stored row is read, spellings collapse into one logical Favorite dated by its **earliest** row, and only then does search, sorting and paging happen. Page size is not a collection limit.

- **Recently Added** (default): newest first to the microsecond.
- **Alphabetical:** normalized title, then collection and number.
- **Hymn Number:** collection, then natural number. Unnumbered songs follow.
- Entries without details sort last in the last two. The identity breaks every tie.
- The cursor is a position in the order, bound to the sort and search. It does not freeze the collection across requests. An invalid cursor is refused and the list reloads from the top.
- In a directory outage, entries still list by date, marked as details unavailable. Search is refused rather than showing a false empty result.

### Browser state

`FavoritesController` holds one account's state in memory: no browser storage, no third-party library, one instance per account.

- **One request per song**, with later clicks collapsed into the latest intent. An older answer never overwrites a newer intent.
- **Uncertain outcomes.** A timeout, lost response or generic server failure may still have been applied. The song becomes **uncertain**:
  - One read updates what was last *observed* and does not clear the uncertainty.
  - An ordinary click, in either direction, sends nothing. Nothing retries automatically.
  - The member chooses **Add** or **Remove** explicitly, which sends one request.
  - It ends when the original request gets a definite answer, or the explicit request does. If the original answers after that choice, the song is read again.
- **Other tabs** get a `BroadcastChannel` signal with no song data. **Focus and navigation** refresh only when stale. There is no polling.
- **Across devices** the database's execution order decides. Exact last-click-wins is not promised.
- **Account change** discards the controller: queued intents are dropped, late answers are ignored, and the server refuses a mismatched `expectedAccount`.

**Remaining limit of the approved model:** after an explicit choice, a still-travelling earlier request can land later and change the saved state. The tab corrects itself on that request's answer or the next refresh, but if its answer never arrives, the change appears only at the next read.

**Offline and PWA.** `public/sw.js` has no fetch handler and caches nothing, so no Favorites response can persist. An offline click says it was not saved. There is no offline queue.

## Recent history

- Kinds: `song` and `sheet_file`.
- A repeat view under 5 minutes changes nothing. Exactly 5 minutes is a new view.
- Reads hide entries at 90 days and return at most 100, across kinds.
- Each write prunes that owner's expired and excess rows, up to 200 at a time, under the account lock. An inactive account's expired rows stay hidden and are removed at its next write or erasure.

## Note concurrency

One note per song per account, plain text, up to 20,000 characters counted as PostgreSQL counts them. Blank content is a note, not a deletion.

- `revision` rejects stale writes.
- `note_id` is new on every creation, so a request about a deleted note cannot apply to a later note at the same revision (ABA).
- `last_mutation_id` records **only the latest successful write**. It is not a history of past requests.
- **Deleting leaves a tombstone** in the same row: `deleted_at` is set and `content` is emptied, enforced by a database constraint. Reads never show it.
- **A create states what it follows:** nothing, or the exact deleted note (`afterDeletedNoteId`) that `loadNote` reported. A create whose statement is out of date gets `deleted-since` and writes nothing. This is how a genuinely new note is told apart from a stale retry.

To write a new note after a deletion, call `loadNote`, then `createNote` with its `deletedNoteId`. That reuses the tombstone's row with a new `note_id`.

| Retry of | Current state | Result |
|---|---|---|
| Create | It is still the latest write | `replayed` |
| Create | Note changed, or a newer note exists | `conflict`, nothing written |
| Create | Note was deleted since | `deleted-since`, nothing written |
| Update | It is still the latest write | `replayed`, no new revision |
| Update | Any newer write | `conflict` with current text, nothing written |
| Update | Note deleted | `not-found` |
| Delete | Note gone | `already-absent` |
| Delete | Note changed or recreated | `conflict`, the note stays |

Tombstones hold no text and are kept until the account is erased, at most one per song per account, because removing one would let an old retry succeed again. Deleted text leaves the row immediately, but PostgreSQL and Neon can retain old row versions until vacuum and within their history-retention window, as with any database delete.

If two notes come to belong to one song because a catalog entry was linked to the index, `loadNote` returns `conflict` with **both** texts. Nothing merges or overwrites them. The interface for resolving this is out of scope for P2.1.

## Account deletion

`deleteUserAction` calls `eraseUserAccount`:

1. **Mark.** A `pending` marker with a unique attempt token closes the library to writes. If it cannot be written while the tables exist, deletion stops before Clerk is touched.
2. **Delete in Clerk.**
   - Success or 404: continue.
   - Definitive refusal (400, 401, 403, 422, 429): release only this attempt's token. The marker is removed only when no other token remains.
   - Anything else (network failure, timeout, 5xx, crash): the token stays and the marker stays pending. **Finding the account still present does not release it**, because an earlier request with an unknown result could still take effect.
3. **Clean up.** Personal Library, then `deleteUserData`, then `deleteNotificationData`. All can be repeated.
4. **Complete.** Only after all three succeed, one transaction purges the library again and sets `complete`. The marker stays afterward, so a late request cannot recreate data.

Every write and erasure step takes the same per-account advisory lock, so a write is strictly before the purge (and removed) or after the marker (and refused). As of P2.2 that includes every removal (`removeFavorite`, `removeExactFavorite`, `clearRecent`, `deleteNote`) and the pruning inside `recordRecent`: each checks the marker in its own locked statement. Only the privileged erasure steps change an account once it is marked.

Favorites reads check the marker in the same statement and expose nothing for a marked account. `loadNote` and `listRecent` still return stored data under a marker, which the recovery tests rely on. Neither is reachable from any route yet, so **P2.3 and P2.4 must refuse a marked account before exposing them.**

**Recovery.** The nightly `sync-archive` cron calls `recoverAccountErasures`. It looks at up to 25 pending accounts, least recently tried first, and reruns the full cleanup only when Clerk confirms the account is gone. Overlapping runs are safe.

### Administrator recovery after an uncertain deletion

The admin sees "Clerk did not confirm the deletion." The person's library is closed to new writes, and their data is intact. Nothing releases this automatically.

1. **Look for the account** in Admin -> People, or in the Clerk dashboard for that environment.
2. **If it is gone,** do nothing. The nightly job finishes the cleanup and marks it `complete`.
3. **If it is still there and should be deleted,** press Delete again. On success the cleanup runs and the erasure completes. A refusal leaves the marker in place, because the earlier attempt is still unresolved.
4. **If it is still there and should be kept,** only the owner can reopen it, directly in Neon, after all of these are true:
   - The account still exists in Clerk.
   - At least 24 hours have passed since the marker's `updated_at`, so the earlier request cannot still be in progress.
   - Nobody is currently trying to delete this account.

```sql
-- Inspect first. Expect one row, state 'pending'.
SELECT state, cardinality(open_attempts) AS open_attempts, requested_at, updated_at, last_recovery_at
  FROM personal_library_erasures
 WHERE clerk_env = '<development|production>' AND clerk_user_id = '<user id>';

-- Then reopen. Never remove a 'complete' row.
DELETE FROM personal_library_erasures
 WHERE clerk_env = '<development|production>' AND clerk_user_id = '<user id>' AND state = 'pending';
```

The app never runs this statement. To list everything waiting: `SELECT clerk_env, clerk_user_id, requested_at, last_recovery_at FROM personal_library_erasures WHERE state = 'pending';`

**Limitations:**

- An account left pending after an uncertain deletion, which still exists in Clerk, stays closed to library writes until one of the steps above resolves it. There is deliberately no automatic release and, in P2.1, no admin screen for it.
- Vercel Cron runs only on Production. A pending Development erasure is recovered only when the route is called manually with `CRON_SECRET`.
- If the tables could not be installed at all, the existing cleanup runs without a marker, so a failure there has no automatic retry, as before.

## Sheet-file identity (contract for P2.4)

Not implemented in P2.1, beyond validating the stored shape.

```
resource_key = "sf1_" + hex(sha256("faithful-word:sheet-file:v1:" + driveFileId))
```

- The Drive file ID is the only identifier that survives a rename or content replacement. File slugs are positional, and `?v=` changes with content.
- The key is one-way and server-only. It is matched only by exact comparison against keys computed from the current index, never by title or filename.
- It never grants access. Each use must still pass `currentFileResource` and `decideSheetAccess`.
- A file replaced under a new Drive ID is a new resource, and the old entry shows as unavailable.

## Verifying Phase 1 enforcement (owner)

Required before accepting the P2.4 Sheet Music experience. Do this separately in Development and Production.

1. **Activation:** Admin -> Sheet Access shows whether the environment is activated, with the impact report.
2. **File Rights:** check the tab in the Index, press Refresh sheet music, and review withheld files on Sheet Access.
3. **Roles and individuals:** on a person's page, confirm that the Member role alone gives no sheet music, and that a grant, a deny and a verified affiliation behave as in [membership-authorization.md](membership-authorization.md).
4. **Delivery:** open one public, one restricted and one withheld file signed out, as a Member, and as an entitled person.

## Future contracts

Favorites shipped as the API above. Each remaining one wraps `withPersonalLibrary`, validates input, and takes no owner from the client.

| Checkpoint | Action | Uses |
|---|---|---|
| Recent | record song view, clear, list | `recordRecent`, `clearRecent`, `listRecent` |
| Notes | load, create, update, delete | `loadNote`, `createNote`, `updateNote`, `deleteNote`. The server generates `noteId`, the client generates one `mutationId` per intended save, and a create after a deletion sends the `deletedNoteId` it loaded |
| P2.4 | record sheet open | Only after `decideSheetAccess` allows the file |

## Testing

`store.integration.test.ts` and `app/api/account/favorites/favorites.integration.test.ts` run on isolated in-memory PGlite and never read `DATABASE_URL`. Set `PERSONAL_LIBRARY_PGLITE` (or `MEMBERSHIP_PGLITE`) to the file URL of PGlite's `dist/index.js`. Set `FAVORITES_PERF=1` as well to print timings for 0 to 5,000 Favorites.

PGlite has one backend, so its concurrency tests prove overlapping requests behave correctly when queued. **They do not reproduce lock contention between separate connections.** Check that on Preview against real PostgreSQL: overlapping note creates, including from one tombstone, 100-entry pruning, and a write or removal racing an erasure.

## Catalog copy (resolved in P2.2)

Late rows in the old `catalog_songs` table are now found without a server restart. See [song-identity.md](song-identity.md). The Personal Library reads the catalog directly, so it sees them at once. The public pages' cached catalog can take up to its 24-hour revalidation, unless a planner change or Sheet Music refresh clears it first.
