# Song leaders

Who leads the congregational singing at each service: set in the Service Planner, shown on the Dashboard and the song list, and announced in the notifications. There is no separate scheduling page.

## The model

A service may have a **default leader**, who leads every song unless that song says otherwise. A song may have an **override**:

| Override | Meaning |
|---|---|
| none | follows the default, or no one when there is no default |
| `assigned` | this person leads it |
| `unassigned` | no one is set to lead it, whatever the default |

Nothing assumes a day, a number of songs, a person or "the last song". A typical Sunday is one default plus one override. A typical Wednesday is five overrides and no default. Both are just data.

The rules live in `src/lib/leadership/model.ts`, and they are pure:

- `effectiveLeaders` works out who leads each song.
- `diffAssignments` works out what changed for each person.
- `leaderConflicts` and `summarize` count what needs attention.
- The editing helpers apply the planner's controls.

## Places, not songs

Overrides belong to a song's **place** in the service, never to the song itself. The same hymn can appear twice in a service, and moving a song must not carry someone's assignment to another song.

Each place has an ID (`src/lib/service-planner/places.ts`). The IDs are kept beside the service's `slots` array, in `service_plans.place_ids`. They are never stored inside a song, because songs are rebuilt from their title, number and key in many places and an ID inside one would be lost.

| Edit | The place's ID | Its leader |
|---|---|---|
| move a song | kept | stays with it |
| replace a song (hymn or insert) | kept | stays |
| change a key | kept | stays |
| take a song out (the place stays empty) | kept | stays: an empty place can be led |
| remove a place | removed | removed, in the same transaction |
| add a place | new | follows the default |
| week's insert changes (`placeInsertsWithPlaces`) | kept, plus a new ID only when a place has to be made | stay |
| AI generates songs | kept (same places) | stay |

**Older rows.** A service stored before places had IDs reads as `p1`, `p2`, …. Its first save stores those IDs. A service nobody has saved yet uses the same `p1` … `p5`, so it can be given leaders without being made a draft.

**IDs that no longer match.** If the stored IDs stop matching the songs (an older deployment in the same Clerk environment changed the songs), they are replaced with `r<revision>-<n>`. No old assignment can then point at the wrong song, and the planner asks for the leaders to be checked.

## Storage

The tables are created by the planner's store (`src/lib/service-planner/store.ts`). Every one carries `clerk_env`, and every change is additive.

| Table | What it holds |
|---|---|
| `service_leadership` | One row per service, keyed by date and AM/PM rather than by the plan row: `default_user_id` and its own `revision`. |
| `service_leader_overrides` | One row per place that does not follow the default. |
| `service_leadership_changes` | Who led what before and after each change, and `notified_at`. It is the audit record, and the proof that the people affected are still owed a notification. |
| `fwm_require(ok, code)` | A small function that aborts the transaction it runs in. This keeps a Neon HTTP transaction all-or-nothing when a revision has moved. |

### Writes

Every write is one transaction and is checked against revisions:

- **`saveServiceLeaders`** (`src/app/service-planner/actions.ts`) saves the leaders on their own. It is refused if the leaders' revision or the songs' revision moved since the page was opened, because which places exist is the songs' to say. It never touches the songs, status or publication. It never republishes or withdraws the song list, and never sends a song-list notification. A save that changes nothing records nothing.

  For a stored service it also **stores the place IDs it was checked against** (`service_plans.place_ids`), in the same transaction and without moving the songs' revision. Without this, a service saved before places had IDs, or one whose IDs were given afresh (`r<revision>-<n>`, which depend on the revision), would keep IDs that were only ever worked out. Publishing or a status change moves the revision, and the leaders would silently detach. A service not stored yet keeps `p1` to `p5`, which never change.
- **`saveService`** saves the songs, and the leaders too when they changed. It is one transaction: removed places lose their overrides, the leaders' revision moves, and a change row is written when anyone's part changed. **Removing any place is always checked against the leaders' revision**, even when the place had no leader when the page read it. Someone may have just assigned one, and that leader must not be left pointing at a place that is gone, or never told.
- **Cancel and restore** record a status change row in the same transaction as the status.
- **Deleting a never-published special service** deletes its leaders in the same statement.

### Guest leaders

"Guest" can be chosen as the default leader or for any song, for a visiting song leader with no account. It is stored as the leader ID `guest` (`GUEST_LEADER` in `src/lib/leadership/model.ts`), so no table changes for it.

- Cards show it as "LED BY A GUEST".
- A guest is never notified or emailed, has no availability to conflict with, and is never flagged as "can no longer lead".

### Who can lead

People who can lead hold the `lead_songs` permission on purpose: through a role or an individual grant, minus any individual deny. The Administrator role's implicit "every permission" does not count, which matches how the availability board works.

- The permission is given to Song Leader and Music Director.
- Existing sites receive it once, through `PERMISSION_FIXUPS` (`2026-10-lead-songs-permission`).
- Their account must exist and must not be banned or locked in Clerk.

The server checks every newly named leader before saving. Someone already assigned who can no longer lead is never silently dropped. They are flagged "Can no longer lead" in the planner and on the Dashboard, and they are never notified: when a change is told, its recipients are checked again, fresh from the database and Clerk (`tellChange` in `src/lib/leadership/notify.ts`). If accounts cannot be read, nobody is told yet, and the next drain tries again.

If the leaders cannot be loaded at all, the planner says so in place of the leader controls, rather than showing an empty roster. Saving songs then keeps the stored leaders, except the leader of any place that is removed.

## Who sees what

The rules are in `src/lib/leadership/access.ts`. Every reader goes through it, and redaction happens on the server before anything is serialized.

| Viewer | Draft or not-started service | Published service | Cancelled service |
|---|---|---|---|
| `manage_service_plans` | everything | everything | everything (in the planner) |
| `view_service_plans` (Musician, Song Leader) | **only the positions they lead themselves** | every song's leader, by name | nothing |
| anyone else signed in | only the positions they lead themselves | only the positions they lead themselves | nothing |
| signed out | nothing | nothing | nothing |

Before publication, a leader is never shown the songs, the keys, the inserts or the other leaders. The board that feeds the Dashboard and the song list never holds a draft's songs at all: only a published service carries `songs`.

Leader data never appears in:

- the public `getSchedule()` contract or its cache
- the public PDF
- share images
- metadata

The song list's leaders come from `GET /api/account/song-leaders` (`private, no-store`, names only, no account or place IDs). They are kept in memory in the browser, never in its storage. A card shows them only while its rows still match the answer, so a page built from an older copy shows no leaders rather than wrong ones.

## Where it shows

### Service Planner (`/service-planner/[service]`)

- Under the Songs heading:
  - the "Leads by default" selector, with a one-line summary such as "5 songs led · 1 without a leader · 1 unavailable"
  - "Use the default for every song"
- Under every song or empty place: its leader selector. The choices are Default (name), each person who can lead, and No one. It shows "Unavailable" or "Can no longer lead" where that applies.
- The action bar reads "Save leaders" when only the leaders changed. It warns when removing a place will clear an assignment.
- The side panel lists who is unavailable, with a link to Availability, and anyone who can no longer lead.
- The History panel includes leader changes.

### Dashboard

- **Coming up cards**, for a published service (`cardLeaderView` in `src/lib/leadership/board.ts`):
  - **One person leads every song:** a single line under the service time, "Led by Alex Ball", or "Led by you" in gold. Nothing appears on the songs.
  - **Anything else:** each song has a short line of its own under its title, "Led by Brian", "Led by a guest" or "No leader yet". It sits on a separate line from "Last sung…" and the sheet music, because those describe the song, not the leader. No song ever looks as if it is led by someone it is not.
  - **The viewer's own songs** say "Led by you" in gold, which makes them easy to find without highlighting the whole row.
  - A service not posted yet shows only the viewer's own part: "You're leading songs 2 and 5". That includes a scheduler, who sees the rest in the planner.
- **Your song leading:** the viewer's next assignments beyond the cards.
- **Needs your attention:**
  - For schedulers: songs without a leader (one item for all such services in the next two weeks), leaders who are away, and leaders who can no longer lead.
  - For a leader: "you're leading … but are marked unavailable".

### Song list

The same layout on each card and on the large "Next" card, for signed-in people with `view_service_plans` or `manage_service_plans`, once the service is published. Before publication, leaders are never on the song list.

**PDF.** For those same people, the PDF button opens `/api/account/song-list-pdf/[month]` (`private, no-store`) instead of the public `/song-list/pdf/[month]`. The public PDF is cached at the CDN for everyone, so it never shows leaders.

- One person leading every song is printed once, beside the date: "· Led by Alex Ball".
- Otherwise each song's leader is printed in small grey type, right-aligned in a column just before the key, so the names line up. The column is exactly as wide as the longest name and borrows the key column's spare room first (`leaderColumn` in `src/lib/song-list-pdf.ts`). Titles lose very little width, and the page fitting measures them with the column in place.
- Names print short, to keep titles on one line: the first name in full and the last as an initial, "Alex B." (`shortLeaderName`). A guest prints as "Guest", and a printout always uses names, never "you".

The share images do not show leaders yet.

## Availability

Conflicts use the existing rules (`effectiveAvailability`): normal services plus service exceptions. One conflict is reported per person per service, listing the songs affected. Nobody is reassigned, and nobody's availability is changed.

When someone's availability change makes them unavailable for a service where they lead songs, the schedulers are told (`song_leading.leader_unavailable`, from `src/lib/availability/change.ts`).

## Notifications

There is a category of its own, `song_leading`. In-app and push are on by default. **Email is offered but off until the person switches it on.** The notices come from `src/lib/notifications/events/leadership.ts`:

| Event | Who is told | When |
|---|---|---|
| `song_leading.assigned` | the leader | they now lead songs in a service where they led none |
| `song_leading.changed` | the leader | the songs they lead changed |
| `song_leading.removed` | the former leader | they no longer lead anything in that service |
| `song_leading.service_cancelled` / `service_restored` | that service's leaders | the service was cancelled or restored. These leaders are left out of the general cancellation notice, so each person hears once. |
| `song_leading.leader_unavailable` | `manage_service_plans` holders | an assigned leader became unavailable. It folds into the availability notice the same change sends (same family and entity), so a director, who gets both, is shown one notice that names the songs. |

How the notices behave:

- **Content:** a notice never contains a song's title or key. Its link is `/dashboard`, which checks access again when opened.
- **Batching:** one notice goes to each person for each saved change, however many positions it covers. Songs that only moved notify no one. Nobody is told about their own change.
- **Durability:**
  1. The change row is written in the same transaction as the change.
  2. Straight after the response, it is told (`tellChange` in `src/lib/leadership/notify.ts`) and marked `notified_at`.
  3. A change never marked is told by the next drain: after any later save, and from the daily `/api/cron/notifications` job.
  4. Every notice carries the dedupe key `leadership:<change>:<user>`, so telling a change twice tells nobody twice.

## Lifecycle

| What happens | Effect on leaders |
|---|---|
| Publish | Nothing changes. Leaders become visible to `view_service_plans` holders, and no extra announcement is sent. |
| Return to draft | Assignments stay. Visibility goes back to own-positions-only. |
| Cancel | Assignments stay stored. Leaders are told, and the service leaves every upcoming list. |
| Restore | The stored assignments are shown again, checked against the current places and availability. |
| Locked (history) | Leaders are read-only, and every write is refused on the server. |

## Deploying

Every schema change is additive and applied on first use, like the rest of the site:

- a new nullable column, `service_plans.place_ids`
- new tables
- a new nullable `notification_events.dedupe_key`, with a partial unique index
- the `notification_email_outbox` table
- the `fwm_require(boolean, text)` function

Nothing is altered, dropped or backfilled.

### Code already deployed (before this change)

- It names its columns, so it never reads `place_ids`.
- Its inserts leave `place_ids` and `dedupe_key` NULL. NULL place IDs read as `p1`…; NULL dedupe keys never collide.
- It ignores the new tables.
- Its notification code still treats email as not offered.

**Limit.** An older deployment in the *same* Clerk environment that edits a service's songs does not update `place_ids`.

- If the number of places changed, the IDs are given afresh and the planner asks for the leaders to be checked.
- If the songs were only reordered within the same places, the leaders follow the old order.

This can only happen in `development` (Local and Preview share it) while older Preview branches are still in use. Production runs one version at a time.

### Starting up

Each store's statements are applied once per server, in one transaction (`applySchema` in `src/lib/db.ts`).

- **Nothing runs once the schema is complete.** The planner and notification stores first ask whether the last object their list makes already exists (`SCHEMA_READY`). If it does, no statement runs.
- **Why this matters.** "IF NOT EXISTS" still takes locks. `ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS` locks the whole table even when the column is there. Every new server, and in development every route, used to run it, and several at once **deadlocked** with each other and with ordinary reads ("deadlock detected" on the home page and the planner).
- **One at a time.** When statements do run, any store's, they hold one database-wide advisory lock, so two never apply at the same moment.
- **Adding a statement.** It goes at the **end** of its list, and the store's `SCHEMA_READY` then names what it makes.
- `fwm_require` is created only when `to_regprocedure('fwm_require(boolean, text)')` finds none. A concurrent "already exists" is caught inside the statement, so it never undoes the rest. It is never replaced, so no deployment changes it under another.

### Rolling back

Redeploy the previous code. It ignores everything new, and nothing needs undoing. Leaders and outbox rows stay stored for when the feature returns.

### Sequence

1. Deploy to **Preview** (Clerk `development`). Its first planner, notification and account requests create the tables in the shared database.
2. In Preview, check the planner, Dashboard and Song List. Leave `NOTIFICATION_EMAIL_ENABLED` unset there.
3. Deploy **Production**. The tables already exist. Production's own categories, including `song_leading`, and the `lead_songs` fix-up are applied for the `production` environment on its first requests.
4. Only then set `NOTIFICATION_EMAIL_ENABLED=1` for Production and redeploy. Confirm `/api/cron/notifications` appears under Vercel → Cron Jobs.

## Testing

The pure tests:

- `src/lib/service-planner/places.test.ts`
- `src/lib/leadership/model.test.ts`
- `src/lib/leadership/board.test.ts`, which covers access per role, grant and deny, and redaction
- `src/lib/dashboard/leadership.test.ts`
- `src/lib/notifications/events/leadership.test.ts`
- `src/lib/notifications/email-delivery.test.ts`
- `src/lib/schedule-months.test.ts`, which checks the public contract

`src/lib/leadership/leadership.integration.test.ts` runs the real SQL on an isolated in-memory PostgreSQL (PGlite) that never reads `DATABASE_URL`. To run it, set `LEADERSHIP_PGLITE`, or `SONG_IDENTITY_PGLITE`, to the file URL of PGlite's `dist/index.js`. It covers:

- repeated schema creation
- legacy rows
- revision conflicts that undo the whole transaction
- removed places
- deleting a special service
- environment isolation
- outbox dedupe, supersede and claiming
