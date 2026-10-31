# The Music Ministry Support Center

Where signed-in members report problems, request sheet music, suggest improvements and ask questions, and follow the answers. The Music Director (and anyone given the permission) looks after the requests on the same page. There is no separate admin section.

| Who | Sees at `/contact` |
|---|---|
| Signed out | The public contact form, exactly as before (`/api/contact`, BotID, honeypot, validation, Resend, the local draft) |
| Signed in, holding `submit_support_requests` or `manage_support_requests` | The Support Center: **New request**, **My requests**, and (managers) **Manage requests** |
| Signed in, holding neither | The public contact form |

Each request has its own page, `/contact/requests/R-XXXXXXXX`, for its submitter and for managers. Anyone else gets "not found".

## Permissions

Both are in `src/lib/auth/permissions.ts`:

| Permission | Default holders | Allows |
|---|---|---|
| `submit_support_requests` | Member (so every account) | Sending requests; reading your own requests, their public conversation and what became of them; replying; reopening one of your own resolved requests |
| `manage_support_requests` | Music Director (Administrator implicitly) | Every request; internal notes; status, priority, assignee and waiting-on; resolving, closing and reopening |

- Existing sites receive both once, through `PERMISSION_FIXUPS` (`2026-11-support-requests-permissions`). An administrator who later removes one from a role does not see it come back.
- **Delegation:** give a role, or one person, `manage_support_requests` under Admin → Roles / People. A deny on one person takes it away from them alone.
- **Taking it away takes effect at once.** Nothing remembers who could see what: every page, action and query asks `supportAccess()` (`src/lib/support/access.ts`) with the session's person.
- Buttons are never the protection. Every server action goes through `withPermission`, and every rule in `src/lib/support/service.ts` checks the permission and the person's relation to the request again. The author of a message, whether a note may be internal, and what a manager may change all come from the session. Nothing from the browser decides them.
- **Reading a request grants nothing else.** Its links lead to the song list, the library or the planner, and each of those checks access for itself.

## The request

| Field | |
|---|---|
| ID | `R-` plus 8 characters of Crockford base 32 (no I, L, O or U). Given once and never changed |
| Type and kind | Four ways in, twelve kinds (below) |
| Summary, details | Up to 120 and 5,000 characters |
| Links | Up to 3, `http(s)` only, no credentials. Shown as plain links (`rel="noopener noreferrer nofollow ugc"`) and **never fetched by the site** |
| Context | What it is about, checked and snapshotted (see [Context](#context)) |
| Status | Open · In progress · Resolved · Closed |
| Waiting on | The music ministry · the sender · nobody. Kept separate, so there are only four statuses |
| Priority | Normal · High · Urgent. Set by managers only. Urgent does not make any notification louder |
| Assignee | Optional. Must hold `manage_support_requests` when assigned. Unassigned requests stay in the shared queue |

| Way in | Kinds |
|---|---|
| Report a problem | Wrong key · Wrong hymn number · Wrong or outdated sheet music · Wrong songs or song order · Service scheduling · Song leading assignment · Website problem · Something else |
| Request sheet music | Missing sheet music · New sheet music |
| Suggest an improvement | Suggestion |
| Ask a question | Question |

The form (`src/components/support/RequestForm.tsx`) shows only the questions a kind needs. For example, "Wrong key" asks which service and which song, "Missing sheet music" asks which song, and "Question" asks for neither.

## The lifecycle

The rules are pure and in `src/lib/support/model.ts`.

| From | A manager may move it to |
|---|---|
| Open | In progress, Resolved, Closed |
| In progress | Open, Resolved, Closed |
| Resolved | Open (reopened), Closed |
| Closed | Open (reopened) |

- Leaving the active statuses (Open, In progress) sets waiting-on to "nobody". Reopening waits on the music ministry unless the manager chooses otherwise.
- **The submitter's reply** puts the request back with the music ministry.
  - On a **resolved** request it stays resolved unless they tick "This still needs attention - reopen the request". That is an explicit, recorded `reopened`.
  - A **closed** request takes no replies from its submitter. Only a manager can reopen it.
- **A manager's public reply** comes with a choice: leave it as it is, ask for more information (it then waits on the sender), or mark it resolved.
- **An internal note** moves nothing. It is the only thing that may be added to a closed request.
- **Nothing is ever deleted.** There is no delete action, and messages are append-only.

## Storage

The tables are created on first use by `src/lib/support/store.ts`, on top of the account tables (`db()`). The change is additive only, and every row carries `clerk_env`.

| Table | Holds |
|---|---|
| `support_requests` | The request, its context snapshot, links, workflow, `revision`, and created / updated / last-activity / resolved / closed times. Unique on `(clerk_env, public_id)` and on `(clerk_env, submitter_id, submission_key)`. CHECKs tie `resolved_at` and `closed_at` to the status, and waiting-on to the active statuses |
| `support_messages` | Public replies and internal notes (`visibility`), each with the browser's `client_key` (unique per request) |
| `support_events` | `created`, `assigned`, `priority_changed`, `status_changed`, `waiting_changed`, `resolved`, `closed`, `reopened`, `replied`: actor, from and to, the message's ID (never its text), `visibility`, `notify`, `notified_at` |

- **Environments cannot mix.** Messages and events reach their request through the composite foreign key `(clerk_env, request_id) → support_requests (clerk_env, id)`. A row of one environment cannot point at a request of the other.
- **Indexes:**
  - one for a person's requests
  - a partial index for the active queue, by waiting-on
  - a partial index for assigned active requests
  - one for history by status
  - one each for a request's messages and its events
  - a partial index for events still owed a notification
- **Starting up** follows `applySchema()`: a `SCHEMA_READY` check means nothing runs once the schema exists, and the database-wide advisory lock means two servers never apply at once. The schema also creates `fwm_require()` when missing (guarded exactly as in the planner), so support never depends on which store ran first.

### Writes

Each write is one statement or one transaction.

- **Sending** inserts the request and its `created` event in one statement, `ON CONFLICT (clerk_env, submitter_id, submission_key) DO NOTHING`. The browser makes the key when the form opens and keeps it until the request is sent. A retried or doubled submission therefore records one request and returns that same request. A collision of request IDs is retried with a new one.
- **Replying** runs as one transaction:
  1. Lock the request.
  2. `fwm_require` that its revision is the one the reply was worked out from, and that it is not closed (unless this is a manager's note).
  3. Insert the message (`ON CONFLICT (client_key) DO NOTHING`).
  4. Only if it was inserted: move the workflow and write the events.

  When two people reply at once, the second finds the revision moved. The rule works its reply out again from a fresh read and retries (up to 4 times), so **neither reply is lost**. A repeated `client_key` returns the message already there.
- **Managing** is checked against the revision the page was read at. Someone else's change in between means nothing is written, and the page says so and refreshes. One event is recorded per field that changed.

### Reads

- Internal notes and housekeeping events are filtered **in the query** for submitters, and again in `readRequest()`.
- Lists are 25 at a time, active views with urgent and high first.
- The Dashboard's counts are **one `count(*) FILTER (…)` query over the active requests only**, never the history.

## Context

The browser only ever sends **references** (`ContextInput` in `src/lib/support/context.ts`). `resolveContext()` (`context-load.ts`) checks each one the way the page it comes from would, and stores a **snapshot**:

| Reference | Checked | Kept |
|---|---|---|
| A service (anchor) | Published or past: anyone. Draft, not started or cancelled: only `manage_service_plans` | Anchor, date, slot, name, state, the songs' revision |
| One song's place | By **place ID** (the planner), or by position plus song ID (the song list). The song shown must still be the one there, compared by identity and never by title. Otherwise it is "the song list has changed, reload" | Place ID, position, and the song as it was: identity, title, number, key |
| A song | Must be one the site knows (library + catalog) | Its canonical ID, title, number, collection |
| A sheet music file | Must exist for that song **and** be one the person could open (`canAccessFile`) | The file's slug, type label and format (never a Drive ID) |
| Song leading | Only a service the person leads songs in (or a planner) | The leaders' revision and **the person's own positions only** |
| A page | An internal path only (`isSitePath`) | The path |

- **A place ID names a place, not a song.** The song in it is snapshotted beside it, so replacing that song, moving it or removing the place later never changes what was reported. A request is never retargeted at whatever song occupies the place now.
- **Older records** whose song identity cannot be settled are kept as written and marked `unresolved`. They are shown, never used to look anything up.
- **Unpublished context is restricted.** A snapshot taken from a service not published is marked `restricted`. `redactContext()` removes its songs, places, leaders and name for any reader who is not its submitter and does not hold `manage_service_plans`, so a delegated support manager never sees a draft through a request. A song leader reporting a draft assignment stores their positions and never its songs.
- Links shown from a context are built only by `contextLinks()`, to `/song-list#<anchor>`, `/library/songs/<slug>`, `/service-planner/<anchor>` (planners only) or the reported page.

### Where reports start

Each starting point is a link to `/contact?new=…&category=…&<references>`. It appears only for someone signed in holding `submit_support_requests`, and that is decided in the browser (`ReportLink`), so cached pages stay the same for everyone.

| Page | Link | Carries |
|---|---|---|
| Song list, each service card | Report a problem | The service. The song is chosen in the form, from that service's songs |
| Library song page | Report a problem · Request sheet music | The song |
| Service Planner, the service's side panel | Report a problem | The service. Its places are offered by place ID |
| Dashboard, your song leading (cards and "Your song leading") | Problem with this assignment | The service, as song leading |

## Notifications

The Phase 1 category key `sheet_music_report` is kept. It is now presented as **Support requests**.

- New sites start with in the app on, push off, and email offered but off.
- Existing sites are moved over once (`SUPPORT_CATEGORY_FIXUP`, `2026-11-support-category`):
  - The name and description change only while they are still the Phase 1 wording.
  - Email changes from `unavailable` to `default_off` only where nobody ever saved that policy (`updated_by IS NULL`).
  - The fix-up is one statement that claims itself and makes its changes together. A failure is logged and never stops notifications.
- The category is shown in a person's settings when they hold either permission.

| Event | Who is told | When |
|---|---|---|
| `support.request_created` | Everyone holding `manage_support_requests` | A request is sent |
| `support.request_assigned` | The new assignee | Someone else assigns it to them (claiming it yourself is silent) |
| `support.manager_replied` | The submitter | A manager's public reply |
| `support.info_requested` (important) | The submitter | A manager's reply asking for more information |
| `support.request_resolved` | The submitter | Resolved by a manager, with or without a reply |
| `support.status_changed` | The submitter | Reopened by a manager, or closed without first being resolved |
| `support.submitter_replied` | The assignee, or every manager when nobody has it (or the assignee no longer manages requests) | The submitter replies (or reopens) |
| `support.request_received` | The submitter, by email only | A request is sent (see [The acknowledgment](#the-acknowledgment)) |

- **Silent:** internal notes, priority, waiting-on, "in progress", closing a request that was already resolved, and anything someone did themselves.
- **Nothing anyone wrote is ever in a notification**, push or email: no summary, message or link. Only "R-7K3F9Q2M · Missing sheet music". The link is the request's page, which checks access again.
- **All fold** (family `support.request`, entity `support_request:<id>`, 15 minutes). A reply and a resolution a minute apart are one notice.
- **Durable intent, without a queue of its own.** It is the song-leading pattern (`src/lib/support/notify.ts`):
  1. Every event someone should hear about is a `support_events` row with `notify`, written in the same statement or transaction as the change.
  2. After the response (`after()`), it is told through `notify()`, which writes the notification and the email outbox row together, and then `notified_at` is set.
  3. Anything still owed is told by the next drain: after any later support change, and by the daily `/api/cron/notifications`.
  4. Each notice carries the dedupe key `support:<event id>`, so telling an event twice tells nobody twice.
- **Recipients are checked again when told** (`currentAudience`, from the permission tables). A submitter who can no longer use the Support Center is not told. A reply meant for an assignee who no longer manages requests goes to the managers.
- **A notification that fails never fails the request.** The request is saved first, and every notification step is logged rather than thrown.
- **Email** is opt-in per person and is sent only where `NOTIFICATION_EMAIL_ENABLED=1` (Production), exactly as before. Local and Preview never send.

### The acknowledgment

Whoever sends a request is emailed **"We received your support request"**:

```
Thank you. Your request has reached the Faithful Word Music ministry, and we will look into it as soon as possible.

Request: <their title>
Reference: R-7K3F9Q2M
Status: Open

You can follow it and reply on its page. Replies to this email also reach the music ministry.

Open: https://faithfulwordmusic.com/contact/requests/R-7K3F9Q2M
```

- **Its own notification.** It is filed under **"Support request confirmations"** (`support_confirmation`). That category is email only, with no bell and no push, since the page already said the request was sent. Email is **on by default**, and anyone can turn it off in Notification settings. It is the one category in `EMAIL_ON_BY_DEFAULT` (`src/lib/notifications/model.ts`); email stays opt-in everywhere else.
- **Once per request.** `supportAcknowledgment()` (`events/support.ts`) builds it only from the request's `created` event, which `insertRequest` writes in the same statement as the request.
  - A resent submission (the same `submission_key`) records no new event.
  - Replies, reopenings and workflow changes are other kinds of event, so a conversation never acknowledges itself again.
  - Its dedupe key, `support:<event id>:ack`, is separate from the managers' `support:<event id>`. `tellSupportEvent` marks the event told only once both are recorded. Telling it again (the next drain, the daily cron) records nothing twice.
  - It never folds, so a manager's reply a minute later cannot supersede it.
- **Delivered like any notification email.** It goes through the durable outbox (`email-delivery.ts`):
  - the outbox row's ID is Resend's idempotency key
  - retries at 1, 5, 30, 120 and 720 minutes for failures that may pass; a permanent refusal is `failed`
  - no verified address is `skipped`
  - an answer lost for more than 23 hours is `unknown`, never sent again
  - The request is saved before any of this, so a failed acknowledgment never fails the request.
- **From and Reply-To.** It comes from `siteConfig.mail.from` ("Faithful Word Music"), with Reply-To set to the ministry inbox, as for every notification email.
- **The exception to "nothing anyone wrote".** It carries the request's title, but only the title the submitter wrote themself, and only to their own verified address. It never includes the details. With no in-app or push copy, it is never on a lock screen or in anyone else's bell.
- **Checked again when told:** someone who can no longer use the Support Center is not sent one (`currentAudience`).
- **No response time is promised:** it says "as soon as possible".

## Dashboard

`supportAttention()` (`src/lib/dashboard/providers.ts`), fed by `loadSupportCounts()` (`src/lib/dashboard/load.ts`), adds one item for each of these, and none at zero:

- **Members:** "N of your support requests need your reply"
- **Managers:** "N support requests nobody has taken", and "N support requests are waiting on the ministry". The second notes how many are assigned to you and links to your own queue.

## Files

| File | Job |
|---|---|
| `src/lib/support/model.ts` | Kinds, statuses, transitions, reply effects, limits, links, keys, request IDs (pure) |
| `src/lib/support/access.ts` | Who may do what, and which messages and events each reader sees (pure) |
| `src/lib/support/context.ts` | References, snapshots, redaction, links (pure) |
| `src/lib/support/display.ts` | How services, songs and context read (pure) |
| `src/lib/support/service.ts` | Every rule, over `deps` |
| `src/lib/support/store.ts` | Tables, transactions, reads (server-only) |
| `src/lib/support/context-load.ts` | Checking references; the form's choices (server-only) |
| `src/lib/support/notify.ts` | Telling, draining (server-only) |
| `src/lib/support/deps.ts`, `people.ts` | The real deps; names and managers from Clerk (server-only) |
| `src/lib/notifications/events/support.ts` | What each event says and to whom; the recheck (pure) |
| `src/app/contact/page.tsx`, `actions.ts`, `requests/[id]/` | The pages and the server actions |
| `src/components/support/` | The form, lists, badges, reply box, manager panel, report links |
| `src/content/support.ts` | All wording (notification wording: `notifications.ts` → `events.support`) |

## Testing

- `src/lib/support/model.test.ts`: kinds, transitions, reply effects, validation, link schemes, request IDs, context references, redaction, links.
- `src/lib/support/service.test.ts`:
  - authorization: own requests only, other members told "not found", delegated managers, revoked permissions
  - internal notes never shown to submitters, and no author spoofing
  - idempotent sending and replying, and concurrent replies both kept
  - revision conflicts, assignment rules, explicit reopen, and a closed request refusing replies
  - which events are owed a notification
- `src/lib/support/context-load.test.ts`:
  - duplicate occurrences told apart by place ID, and duplicate titles by identity
  - songs reordered, replaced or removed
  - unresolved legacy identity
  - unknown songs
  - drafts hidden, and a leader's draft assignment kept to positions only
  - sheet music limited to files the person may open
- `src/lib/notifications/events/support.test.ts`:
  - recipients, with no self-notification and nothing for notes or housekeeping
  - nothing written by a person in titles, bodies, push payloads or emails
  - dedupe, email only for people who opted in, and the recipient recheck
- `src/lib/dashboard/support-attention.test.ts`.
- `src/lib/support/support.integration.test.ts` runs the real SQL on an isolated in-memory PostgreSQL (PGlite) that never reads `DATABASE_URL` and can send no email. Set `SUPPORT_PGLITE` (or `LEADERSHIP_PGLITE`) to the file URL of PGlite's `dist/index.js`. It covers:
  - schema twice
  - idempotent sending and environment isolation
  - foreign keys refusing the other environment
  - concurrent replies kept
  - a stale workflow change undone whole, and the audit trail
  - notes filtered in SQL
  - the Dashboard counts
  - notifications told once, email outbox rows only for opted-in people, and owed events drained after an "interrupted" server
  - the acknowledgment: one per request, to the submitter by email only, never again for a retry, a resent submission, a reply or a re-drain, and none for someone who turned it off
  - its delivery through the real outbox: sent once with the row's ID as the idempotency key, a 5xx retried later with the same key, a 422 failed for good, no verified address skipped, and every request saved whatever became of its email
  - These pass on PGlite 0.2.x. PGlite 0.3.5 fails the concurrent-reply and stale-workflow cases with "cannot drop active portal", an engine issue that has nothing to do with the code under test.

## Deploying and rolling back

- Everything is additive: three new tables, their indexes, two permissions with a one-time grant, and the category fix-up. Nothing is altered or dropped. The first signed-in visit to `/contact`, the first support write, or the daily cron creates the tables.
- **Local and Preview share the Production database** (rows are kept apart by `clerk_env`), so the tables appear there on the first Preview use. This is the same as every earlier phase.
- **Rolling back:** redeploy the previous code. It ignores the new tables. The renamed category and the permission grants stay, and are harmless to older code.
- **Accounts deleted:** a person's requests and messages are kept as the ministry's record. The pages show "A former member".

## Manual checks

| # | Check | Expect |
|---|---|---|
| 1 | `/contact` signed out | The public form, unchanged; sending still works |
| 2 | `/contact` as a member | Support Center: four ways in, My requests |
| 3 | Send a "Missing sheet music" request; press Send twice quickly | One request; its page opens; it is in My requests |
| 4 | As the Music Director, Dashboard | "1 new support request to review"; a notification in the bell |
| 5 | Manage requests → open it → Take it; reply "Which hymnal?" with "Ask them for more information" | The member gets a notice; their Dashboard says it needs a reply |
| 6 | Add an internal note | Gold-tinted, "Internal note"; the member never sees it, and gets no notice |
| 7 | Member replies; manager resolves | Badges and history update; the member is told it was resolved |
| 8 | Member replies to the resolved request without ticking reopen, then with it | Stays resolved, then reopens ("reopened" in the history) |
| 9 | Close it; as the member, open it | No reply box; "Start a new request" |
| 10 | Song list → Report a problem on a card → Wrong key | The service is chosen; its songs are listed |
| 11 | A library song page, signed in, then signed out | Report links only when signed in |
| 12 | Planner → a draft service → Report a problem | Its places are offered; the request shows them only to planners |
| 13 | Give a Musician `manage_support_requests` as an individual grant | They see Manage requests; take it away and they lose it at once |
| 14 | Open another member's request URL | "Not found" |
| 15 | Two windows, the manager and the member, reply at the same moment | Both replies are there |
| 16 | Phone width (375 px) | Tabs wrap, cards stack, every control reachable |
