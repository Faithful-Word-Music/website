# Notifications

The authoritative description of the notification system, and the handoff between its phases. The README carries a summary.

## Status

| Phase | What | State |
|---|---|---|
| 1 | Notification core and configuration: domain, tables, policies, preferences, the bell, the history page, settings, admin policies | **Built** |
| 2 | Product notification events (Service Planner, Availability, account access, the library index), folding, the best-effort rule, settings relevance | **Built** |
| 3 | PWA Web Push and the app-icon unread badge | Next |
| 4 | Manual notification centre: composer, audiences, templates, send history | Later |
| 5 | Reliability, scheduling, reminders, AI budget alerts, advanced preferences | Later |
| 6 | Email through Resend | Later |

**Not built yet:** Web Push, push subscriptions, VAPID, the browser permission flow, app-icon badging, the custom composer, saved templates, scheduling and reminders, digests, AI budget alerts, notification email, and sheet-music report events (the report feature itself does not exist yet; its category is ready). Everything a notification does today is in the app.

## The idea

A notification is a durable record of something a person should know about. It is not a push message: push and email are only ways of delivering one.

```
something happens
  -> notify()                      the feature names the event and the audience
  -> notification_events           what happened, once
  -> recipients resolved           audience.ts, from roles and permissions
  -> effective setting per channel the category's policy + the person's own choice
  -> notifications                 one row per person told, title and body as sent
  -> channels that deliver         in the app now; push and email later
```

A feature never inserts a row, reads a policy or knows which channels exist. What it does is one line, after its own change is saved:

```ts
await notifyBestEffort(viewer.env, servicePlanPublished({ actorId, publicationId, services, now }));
```

- **The builder** (`src/lib/notifications/events/`) is pure. It turns plain facts into what to hand `notify()`, or `null` when the change deserves no notification. Every "should this notify at all?" rule lives there, so it is unit tested.
- **`notifyBestEffort()`** (`send.ts`) supplies the database for the Clerk environment and guarantees the rule below.

### The best-effort rule

**A notification that cannot be made never fails the change it is about.** `notifySafely()` in `service.ts` does nothing for `null`, logs a refused notification (`console.warn`) and any thrown error (`console.error`), and never throws. Features call it after their write and their `revalidatePath`, and need no `try/catch` of their own. Where a feature reads something only for the sake of the notification (availability's exceptions as they stood, a person's name from Clerk), that read is guarded the same way: if it fails, nobody is told and the change still stands.

## Files

| File | Job |
|---|---|
| `src/lib/notifications/model.ts` | Channels, policies, priorities, the starting categories, settings relevance, the folding window, limits, and `effectiveSetting()`, the one rule (pure) |
| `src/lib/notifications/audience.ts` | The `Audience` type, the named `AUDIENCES`, and `resolveAudience()` (pure) |
| `src/lib/notifications/catalog.ts` | The event catalog: event key to category, priority, default link and folding family (pure) |
| `src/lib/notifications/events/` | One file per feature: what its notifications say, who hears them, and when to say nothing (pure) |
| `src/lib/notifications/service.ts` | Every rule: `notify`, `notifySafely`, listing and reading, preferences, policies. Takes `deps`, so it is tested without a database |
| `src/lib/notifications/send.ts` | `notifyBestEffort(env, input)`: what features call (server-only) |
| `src/lib/notifications/store.ts` | The tables, the seed and the real `deps` (server-only) |
| `src/lib/notifications/format.ts` | Relative times (pure) |
| `src/app/api/account/notifications/` | `GET` a page, `POST` read / unread / read-all; `unread/` for the bell's count |
| `src/app/notifications/` | The history page, the settings page, and the preference action |
| `src/app/admin/notifications/` | The policy page. Its actions are in `src/app/admin/actions.ts` |
| `src/components/notifications/` | `notification-store.ts` (the one browser store), the bell, the list, the history, the settings |
| `src/components/admin/NotificationPolicyEditor.tsx` | The policy editor and the development test button |
| `src/content/notifications.ts` | All wording |

## Tables

Created on first use, like the account tables, on top of them (`db()` in `src/lib/auth/store.ts`). Every row carries `clerk_env`. There is no migration to run.

| Table | Holds |
|---|---|
| `notification_categories` | `key` (stable, the primary key with `clerk_env`), `name`, `description`, `active`, `sort_order`. Never deleted: `active = false` retires one and keeps its history readable |
| `notification_channel_policies` | One row per category and channel: `policy`, `updated_by`, `updated_at` |
| `user_notification_preferences` | A person's explicit choice for a category and channel. **Only when they made one.** No row means "follow the policy" |
| `notification_events` | `category_key`, `event_key`, `actor_user_id`, `entity_type`, `entity_id`, `payload`, `group_key` (the folding family, or null; added in Phase 2 with `ADD COLUMN IF NOT EXISTS`) |
| `notifications` | `event_id`, `recipient_user_id`, `category_key`, `title`, `body`, `action_url`, `priority`, `in_app`, `read_at`, `created_at` |

- **Indexes:** `notifications (clerk_env, recipient_user_id, id DESC) WHERE in_app` for the list; `notifications (clerk_env, recipient_user_id) WHERE in_app AND read_at IS NULL` for the unread count, which is one `count(*)` over it.
- **History is durable.** Title and body are stored as sent. An event's entity is plain text with no foreign key, so deleting a service or a request never deletes the notifications about it. A person's rows go only with their account (`deleteNotificationData`, called from `deleteUserAction`).
- **The payload never reaches the browser** and is never used to decide access.
- **Seeding:** the starting categories and policies are inserted with `ON CONFLICT DO NOTHING`. A category added to `DEFAULT_CATEGORIES` later arrives by itself; nothing an administrator changed is put back.

## Channels and policies

Channels: `in_app`, `push`, `email`. `CHANNEL_STATUS` in `model.ts` says how far along each is:

| Channel | Status | Meaning |
|---|---|---|
| `in_app` | `live` | Delivered now |
| `push` | `planned` | Policies and people's choices are kept; nothing is pushed |
| `email` | `soon` | Not offered: no policy but `unavailable` can be chosen, and nothing can switch it on |

Policies, per category and channel, set under **Admin → Notifications**:

| Policy | Effect |
|---|---|
| `mandatory` | On. The person cannot turn it off in the site |
| `default_on` | On unless the person turned it off |
| `default_off` | Off unless the person turned it on |
| `unavailable` | Not offered on that channel |

Mandatory push will never override the browser or the operating system: if permission is denied there, the site cannot deliver.

Starting policies (data, changeable; nothing is mandatory in code):

| Category | In the app | Push | Email |
|---|---|---|---|
| `admin_announcement` | mandatory | mandatory | unavailable |
| `service_plan_published` | default on | default on | unavailable |
| `service_plan_updated` | default on | default on | unavailable |
| `availability_changed` | default on | default on | unavailable |
| `account_access` | mandatory | default on | unavailable |
| `sheet_music_report` | default on | default off | unavailable |
| `ai_system` | default on | default off | unavailable |

## The effective setting

`effectiveSetting(channel, policy, stored)` is the only place the two are combined:

| Policy | Stored choice | Effective |
|---|---|---|
| mandatory | anything | on, locked |
| default on | none | on |
| default on | off | off |
| default off | none | off |
| default off | on | on |
| unavailable | anything | off, not offered |

**Policy changes never touch `user_notification_preferences`.** John turns a default-on category off; it becomes mandatory; he receives it and his stored "off" is still there; it goes back to default on; his "off" counts again. While a setting is locked or not offered, `setPreference()` refuses and writes nothing, so the earlier choice cannot be overwritten either.

**Email is opt-in only.** It is listed in `OPT_IN_ONLY`: even under a "default on" policy it is on only for someone who switched it on. When email launches, nobody is opted in.

## Recipients

`notify()` takes an `Audience`: specific users, everyone, a permission, a role, or any of several (`anyOf`), plus `except`. `AUDIENCES` names the common ones (`musicTeam`, `servicePlanViewers`, `availabilityManagers`, `musicians`, `songLeaders`, `planners`, `accountManagers`, `sheetMusicManagers`, `aiUsers`, `administrators`, `everyone`).

- `servicePlanViewers` is `view_service_plans`, explicit; `availabilityManagers` is `manage_availability`, explicit. An administrator who holds those only through the Administrator role is not told about song lists or availability; give them the Music Director role (or a grant) if they should be.

- Prefer a permission; a role is for Musician and Song Leader.
- `explicit: true` on a permission audience leaves out people who hold it only through the Administrator role (as the availability board does).
- The list of every account comes from Clerk and is fetched only when an audience can include a Member-only account (`needsEveryAccount`).
- An audience decides who is told, never who may see.

## Authorization

- A notification's link grants nothing. Every destination checks its own permissions.
- Links are internal paths only (`safeActionUrl`, built on `isSitePath`).
- Reading and marking: any signed-in person, their own only. The recipient comes from the session and every query matches on it, so someone else's id is "not found".
- Preferences: the caller's own, from the session.
- Policies: `manage_notifications` (Administrator always; Music Director by default, granted once to existing sites through `PERMISSION_FIXUPS`).

## Read and unread

`read_at` on the row. Opening a notification marks it read; the dot at the end of a row marks it read or unread; **Mark all as read** does the rest. Reading again keeps the first time.

`components/notifications/notification-store.ts` is the one browser store. The bell, its panel and the history page all show it, and its `unread` is THE count. It is refreshed when a page opens, when the tab is looked at again, and once a minute while visible. Changes show at once and are put back if the server refuses.

## Interface

| Where | What |
|---|---|
| Header | The bell, for signed-in people, at every width. A panel from `sm` up; a dialog on a phone |
| `/notifications` | The history, twenty at a time with **Load more** |
| `/notifications/settings` | A person's own choices, for the categories that concern them. Linked from `/account` |
| **Admin → Setup → Notifications** | The policies, and in development a test button |

## Development test

**Admin → Notifications → Send me a test notification** shows only on the Clerk development instance. The action refuses anywhere else, needs `manage_notifications`, and only ever sends to the person pressing it. It goes through `notify()`, so the chosen category's policy and your own choice apply.

## Events

The principle: **notify about consequences, not clicks.** One real-world action is one notification, the person who did it is not told, and draft or internal work is silent.

| Event | When | Who is told | Priority | Entity |
|---|---|---|---|---|
| `service_plan.published` | Services are published: one from its page, or several together. **One event per publication** | `servicePlanViewers` | normal | `service_publication:<publication uuid>` |
| `service_plan.updated` | A **published** service is saved and a song was added, removed or replaced, a key changed, or its start time moved | `servicePlanViewers` | normal | `service:<anchor>` |
| `service_plan.withdrawn` | A published service is returned to draft, by hand or because its week's insert changed | `servicePlanViewers` | important | `service:<anchor>`, or `service_week:<Sunday>` when the insert returned several |
| `service_plan.cancelled` | A service still to come is cancelled | `servicePlanViewers` + `musicTeam` | important | `service:<anchor>` |
| `service_plan.restored` | A cancelled service still to come is restored (as a draft; the wording says its songs are not published) | `servicePlanViewers` + `musicTeam` | important | `service:<anchor>` |
| `availability.service_changed` | Someone's availability for one service really changes | see below | normal | `availability:<userId>:<anchor>` |
| `availability.range_changed` | A date range is entered. **One event**, counting the services it changed | see below | normal | `availability-range:<userId>:<from>_<to>` |
| `availability.normal_changed` | Someone's normal services change | see below | normal | `availability-user:<userId>` |
| `account.request_created` | A request for an account is recorded | `accountManagers` | important | `account-request:<id>` |
| `account.access_changed` | Someone else changes a person's roles or individual permissions. One per save | that person | important | `account:<userId>` |
| `ai.library_index_problem` | A refresh of the library index leaves song files that **newly** failed | `aiUsers` | important | `library-index:failures` |
| `system.test` | The development test button | the person pressing it | normal | none |

An anchor is a service's address, `2026-10-11-am`. In every row the actor is left out (`except`). Nothing is `critical`: that is kept for the exceptional.

**Availability's recipients.** Someone changing their own: `availabilityManagers`. A leader changing someone else's: that person ("Your availability was changed") and the other `availabilityManagers` ("John's availability changed"), as two events about the same entity, because the two are worded differently. The whole music team is never told. The note written with an exception is never put in a notification.

**Entities.** Every real event names one (a test enforces it). The type says what kind of thing, the id is stable for that thing, and together they are what folding keys on and what push replacement and an activity view will key on later. The payload beside it holds detail (the services of a publication, the changes of an edit); it stays on the server and never decides access.

**Where each is sent from**

| Feature | Place |
|---|---|
| Service Planner | `src/app/service-planner/actions.ts`: `saveService`, `publishServices`, `setServiceStatus`, and `passInsertOn` for all three insert actions |
| Availability | `src/lib/availability/change.ts`, the one write path, shared by the page's actions and the search's quick action |
| Account requests | `src/app/api/account-requests/route.ts`, after the request is recorded and beside the Resend email, which is unchanged |
| Account access | `setUserRolesAction`, `setOverrideAction`, `removeOverrideAction` in `src/app/admin/actions.ts` |
| Library index | `refreshLibraryIndexAction` in `src/app/admin/actions.ts` |

### What does not notify

- **Service Planner:** saving a draft, however often; songs only put in a different order; a save that changed nothing; creating or deleting a special service; changing the week's insert when only drafts follow it; publishing again a service that was already published; anything about a service already under way or over; AI suggestions and generated plans that were not saved.
- **Availability:** choosing what already stood ("Unavailable" twice, "Normal" with nothing to undo); a range that changed no service; a normal-services save with the same set.
- **Accounts:** titles, sheet-music types, invitations sent or revoked, disabling and deleting, role and list configuration, a duplicate account request, a change someone makes to their own access, and saving the roles a person already holds. Approving or declining a request is answered by Clerk's email: the person has no account to be notified in.
- **AI and system:** Conductor answers, Suggest and Generate, ordinary AI errors, successful index refreshes, a refresh whose only failures had already failed, and AI budget levels (Phase 5).
- **Sheet music reports:** the feature is not built; nothing invents events for it.

## Folding

Quick repeats about the same thing become one notification.

- An event folds when its catalog entry has `coalesce: { family, windowMinutes }` and it names an entity.
- For each recipient, an **unread** in-app notification from the same family, about the same entity, created within the window, is **replaced** by the new one. It is a new row, so it is newest in their list and their unread count does not rise.
- A notification already **read** is never matched. A later change is a new notification: nothing a person has read is altered behind them.
- Every `notification_events` row is kept. Folding only changes what people are shown.
- The window is 15 minutes (`COALESCE_MINUTES`), measured from the unread notification, so a run of edits keeps folding. The library index uses 24 hours.
- `whenCoalesced` on `notify()` gives the wording for a recipient whose earlier notification was replaced. The planner uses it ("Several changes were made to the published song list."). Without it the latest wording is shown, which is right where only the latest state matters (availability).

| Family | Events | Effect |
|---|---|---|
| `service_plan.change` | updated, withdrawn | Five quick edits are one notification; an edit and then a return to draft shows the withdrawal |
| `service_plan.status` | cancelled, restored | Cancelled and restored within minutes shows the latest |
| `availability.service` / `.range` / `.normal` | one each | Available, unavailable, normal in a row shows the latest, per person and service |
| `account.access` | access_changed | A roles save and an exception soon after are one |
| `ai.library_index` | library_index_problem | The passes of one refresh are one |

`service_plan.published` and `account.request_created` never fold: each publication and each request is its own.

## Settings relevance

`/notifications/settings` shows a category only when it could concern the person: `CATEGORY_RELEVANCE` in `model.ts` lists, per category, permissions of which holding any one is enough.

| Category | Shown to someone holding |
|---|---|
| `service_plan_published`, `service_plan_updated` | `view_service_plans` or `manage_service_plans` |
| `availability_changed` | `view_availability` or `manage_availability` |
| `ai_system` | `use_ai` |
| `admin_announcement`, `account_access`, `sheet_music_report`, and any category with no entry | everyone |

Three things that are not each other:

- **Audience:** who receives one event (`audience.ts`).
- **Settings relevance:** whether a category is worth asking a person about. It only filters `preferencesFor()`. `setPreference()` and `notify()` ignore it, so a hidden category can still be chosen and still delivers.
- **Authorization:** whether a person may open the page a notification leads to. Decided by that page, never by either of the above.

Admin → Notifications still lists every category.

## Decisions that differ from the Phase 2 brief

- **Folding replaces a row rather than editing it**, so the folded notification moves to the top with a fresh time, and the store stays one statement.
- **A leader changing someone else's availability is two events**, one worded for the person and one for the other leaders.
- **Settings relevance is in code** (`CATEGORY_RELEVANCE`), beside the permissions it names, not a column on the category.
- **Cancelled and restored reach the availability board too**, not only people who read song lists: they are about whether to come.
- **A service that has started is never notified about**, including a publication that only records what was sung.
- **The library index notifies on newly failed files only**, which is what keeps an unresolved problem from repeating without storing any state.
- **Titles use the planner's own names** ("Sunday Morning", capitalised) so a service reads the same in a notification as on its page.

## Adding an event

1. Add its key to `NOTIFICATION_EVENTS` in `catalog.ts`: category, priority, default link, and `coalesce` if repeats should fold.
2. Write a builder in `events/` that returns the `NotifyInput`, or `null` when there is nothing worth saying. Use a named audience, `except: [actor]`, and always an `entity`. Put the wording in `src/content/notifications.ts` under `events`.
3. `await notifyBestEffort(env, builder(...))` after the feature's write.
4. Add it to the samples in `events/events.test.ts` (the test fails until every catalog event is there) and test its rules.
5. Add it to the table above.

## Later phases

- **Phase 3 (push and badge):** set `CHANNEL_STATUS.push` to `live`; add `push_subscriptions` (several per person) and `notification_deliveries (notification_id, channel, status, attempted_at, delivered_at, error)`; send from the marked place at the end of `notify()`. The app-icon badge subscribes to `unread` in `notification-store.ts` and is cleared at zero. `notifications.in_app` already allows a push to someone whose in-app setting is off.
  Push can use an event's entity and folding family as its replacement tag, so a folded notification replaces its push too.
- **Phase 4 (composer):** calls `notify()` with the `admin_announcement` category. It needs its own "send" permission or reuses `manage_notifications`.
- **Phase 5 (scheduling and reliability):** upcoming-service reminders, digests, and AI budget alerts at 75%, 90% and 100%, which need stored threshold-crossing state per billing month. Sheet-music report events (`created`, `replied`, `resolved`) arrive with that feature, under the `sheet_music_report` category that already exists.
- **Phase 6 (email):** set `CHANNEL_STATUS.email` to `planned` then `live`. `allowedPolicies("email")` then offers mandatory, default off and unavailable; "default on" is never offered for email.
