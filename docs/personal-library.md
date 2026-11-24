# Personal Library

Each member's private favorites, recent history and song notes. **P2.1 is the data foundation only.** No page, button, route or view tracking uses it yet. The code is in `src/lib/personal-library/`.

| File | Purpose |
|---|---|
| `schema.mjs` | The additive tables |
| `identity.ts` | Which song a record belongs to (pure) |
| `store.ts` | Owner-scoped reads and writes |
| `erasure.ts` | The order of an account erasure (pure) |
| `authorize.ts` | `withPersonalLibrary`, the boundary for future server actions |
| `server.ts` | Server-only client, strict song directory, erasure wiring |

## Who may use it

An approved member is anyone with a valid session in this Clerk environment whose profile is not overdue. `withPersonalLibrary` is `withPermission(null, ...)` with the normal profile gate, so it adds no parallel approval system and is no looser than the rest of the site.

- It needs no church affiliation, musician or Song Leader role, sheet music access, or admin permission.
- The owner comes only from the session. No caller can name another user or environment.
- Administrators, Music Directors and profile managers have no access to anyone else's records. No code path exists for it.
- A favorite, note or history entry never grants sheet music.
- Personal Library data is not used by AI, embeddings, analytics, reports, notifications or shared caches, and `invariants.test.ts` checks this against the source.

### Operational requirements the owner must verify

These are Clerk dashboard settings. **They have not been independently verified**, because source code cannot show them. Check both in **Development and Production**:

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

Stored keys are never rewritten. Reads and writes pass every spelling of the song (`storedIds`), so an old alias still finds its record. `describeStoredSong` reports a stored record as `available`, `unavailable`, `ambiguous`, or `unknown` during an outage. **No directory result ever deletes a record.**

**Known limitation:** a song known only from history, with no index or catalog identity, cannot be newly favorited or noted. Its `legacy-*` identity is derived from a title or number and is not proven durable.

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

Every write and erasure step takes the same per-account advisory lock, so a write is strictly before the purge (and removed) or after the marker (and refused).

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

## Future server-action contracts

Each wraps `withPersonalLibrary`, validates input, and takes no owner from the client.

| Checkpoint | Action | Uses |
|---|---|---|
| Favorites | add, remove, list | `resolvePersonalSong`, `addFavorite`, `removeFavorite`, `listFavorites` |
| Recent | record song view, clear, list | `recordRecent`, `clearRecent`, `listRecent` |
| Notes | load, create, update, delete | `loadNote`, `createNote`, `updateNote`, `deleteNote`. The server generates `noteId`, the client generates one `mutationId` per intended save, and a create after a deletion sends the `deletedNoteId` it loaded |
| P2.4 | record sheet open | Only after `decideSheetAccess` allows the file |

## Testing

`store.integration.test.ts` runs on isolated in-memory PGlite and never reads `DATABASE_URL`. Set `PERSONAL_LIBRARY_PGLITE` to the file URL of PGlite's `dist/index.js`.

PGlite has one backend, so its concurrency tests prove overlapping requests behave correctly when queued. **They do not reproduce lock contention between separate connections.** Check that on Preview against real PostgreSQL: overlapping note creates, including from one tombstone, 100-entry pruning, and a write racing an erasure.

## Required follow-up before P2.2 acceptance: catalog copy

`store-identity.integration.test.ts` ("copies idempotently...") fails, and it fails identically on a clean export of `0f0bfa3`, so P2.1 did not cause it.

- **Cause:** `copyCatalogSongs` copies the old `catalog_songs` table once per environment per server. The test and `docs/song-identity.md` expect a row added to the old table later to be picked up on the next read. The code comment says nothing writes that table any more.
- **Newly added songs:** the Service Planner writes new songs straight to `catalog_songs_v2`, so they are **not** affected. Only a row written to the old table by an older deployment still running is missed, until a new server instance starts.
- **Personal Library:** such a song resolves as `unknown`, so it cannot be newly favorited or noted until it is copied. Existing records are never changed or deleted.
- **To decide:** either restore repeated copying or, if no old deployment can still write, update the test and the documentation to match.
