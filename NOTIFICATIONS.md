# Notifications

The authoritative description of the notification system, and the handoff between its phases. The README carries a summary.

## Status

| Phase | What | State |
|---|---|---|
| 1 | Notification core and configuration: domain, tables, policies, preferences, the bell, the history page, settings, admin policies | **Built** |
| 2 | Product notification events (Service Planner, Availability, accounts, sheet music, AI) and the full event catalog | Next |
| 3 | PWA Web Push and the app-icon unread badge | Later |
| 4 | Manual notification centre: composer, audiences, templates, send history | Later |
| 5 | Reliability, scheduling, advanced preferences | Later |
| 6 | Email through Resend | Later |

**Not built yet:** Web Push, push subscriptions, VAPID, the browser permission flow, app-icon badging, the custom composer, saved templates, scheduling, email delivery, and every automated product event. Nothing in the site sends a notification today except the development-only test button.

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

A feature calls `notify()` and nothing else. It never inserts a row, reads a policy or knows which channels exist.

## Files

| File | Job |
|---|---|
| `src/lib/notifications/model.ts` | Channels, policies, priorities, the starting categories, limits, and `effectiveSetting()`, the one rule (pure) |
| `src/lib/notifications/audience.ts` | The `Audience` type, the named `AUDIENCES`, and `resolveAudience()` (pure) |
| `src/lib/notifications/catalog.ts` | The event catalog: event key to category, priority and default link (pure) |
| `src/lib/notifications/service.ts` | Every rule: `notify`, listing and reading, preferences, policies. Takes `deps`, so it is tested without a database |
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
| `notification_events` | `category_key`, `event_key`, `actor_user_id`, `entity_type`, `entity_id`, `payload` |
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

`notify()` takes an `Audience`: specific users, everyone, a permission, a role, or any of several, plus `except`. `AUDIENCES` names the common ones (`musicTeam`, `musicians`, `songLeaders`, `planners`, `accountManagers`, `sheetMusicManagers`, `aiUsers`, `administrators`, `everyone`).

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
| `/notifications/settings` | A person's own choices. Linked from `/account` |
| **Admin → Setup → Notifications** | The policies, and in development a test button |

## Development test

**Admin → Notifications → Send me a test notification** shows only on the Clerk development instance. The action refuses anywhere else, needs `manage_notifications`, and only ever sends to the person pressing it. It goes through `notify()`, so the chosen category's policy and your own choice apply.

## Phase 2 handoff

1. Add each event to `NOTIFICATION_EVENTS` in `catalog.ts` (key, category, priority, default link). Add grouping metadata there when an event needs it.
2. Call `notify()` from the feature's server action after the change has been saved, with a named audience and `except: [actor]` where the actor should not be told. Wrap it so a failed notification never fails the action.
3. Publishing a service group is **one** `notify()` for the group, not one per service.
4. Be selective for availability: the planners, not every musician.
5. AI events use `AUDIENCES.aiUsers` or narrower.
6. Consider giving a category a permission that decides who sees it in settings (a musician currently sees "AI and system" there though nothing in it will reach them).
7. Use `entity` on every event: it is what later grouping and deduplication will key on.

## Later phases

- **Phase 3 (push and badge):** set `CHANNEL_STATUS.push` to `live`; add `push_subscriptions` (several per person) and `notification_deliveries (notification_id, channel, status, attempted_at, delivered_at, error)`; send from the marked place at the end of `notify()`. The app-icon badge subscribes to `unread` in `notification-store.ts` and is cleared at zero. `notifications.in_app` already allows a push to someone whose in-app setting is off.
- **Phase 4 (composer):** calls `notify()` with the `admin_announcement` category. It needs its own "send" permission or reuses `manage_notifications`.
- **Phase 6 (email):** set `CHANNEL_STATUS.email` to `planned` then `live`. `allowedPolicies("email")` then offers mandatory, default off and unavailable; "default on" is never offered for email.
