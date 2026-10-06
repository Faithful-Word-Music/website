# Notifications

The authoritative description of the notification system, and the handoff between its phases. The README carries a summary.

## Status

| Phase | What | State |
|---|---|---|
| 1 | Notification core and configuration: domain, tables, policies, preferences, the bell, the history page, settings, admin policies | **Built** |
| 2 | Product notification events (Service Planner, Availability, account access, the library index), folding, the best-effort rule, settings relevance | **Built** |
| 3 | Web Push to every device a person switched it on for, delivery tracking, the service worker, and the app-icon unread badge | **Built** |
| 4 | Manual notification centre: composer, audiences, templates, send history and delivery results | **Built** |
| 5 | Reliability, scheduling, reminders, AI budget alerts, advanced preferences | Next |
| 6 | Email through Resend | Later |

**Not built yet:** scheduled and delayed sends, reminders, recurring sends, digests, retries of a failed push, AI budget alerts, notification email, offline use, and sheet-music report events (the report feature itself does not exist yet; its category is ready).

## The idea

A notification is a durable record of something a person should know about. It is not a push message: push and email are only ways of delivering one.

```
something happens
  -> notify()                      the feature names the event and the audience
  -> notification_events           what happened, once
  -> recipients resolved           audience.ts, from roles and permissions
  -> effective setting per channel the category's policy + the person's own choice
  -> notifications                 one row per person told, title and body as sent
  -> channels that deliver         in the app: the row itself
                                   push: every device the person registered
                                   email: later
```

A feature never inserts a row, reads a policy or knows which channels exist. What it does is one line, after its own change is saved:

```ts
await notifyBestEffort(viewer.env, servicePlanPublished({ actorId, publicationId, services, now }));
```

- **The builder** (`src/lib/notifications/events/`) is pure. It turns plain facts into what to hand `notify()`, or `null` when the change deserves no notification. Every "should this notify at all?" rule lives there, so it is unit tested.
- **`notifyBestEffort()`** (`send.ts`) supplies the database for the Clerk environment and guarantees the rule below.

### The best-effort rule

**A notification that cannot be made never fails the change it is about.** `notifySafely()` in `service.ts` does nothing for `null`, logs a refused notification (`console.warn`) and any thrown error (`console.error`), and never throws. Push is held to the same rule twice over: it is sent after the response has gone, and `dispatchPush()` and `deliverPush()` catch everything of their own before `notifySafely()` would have to (see [Push](#push)). Features call it after their write and their `revalidatePath`, and need no `try/catch` of their own. Where a feature reads something only for the sake of the notification (availability's exceptions as they stood, a person's name from Clerk), that read is guarded the same way: if it fails, nobody is told and the change still stands.

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
| `src/lib/notifications/push.ts` | The push payload, the folding tag, subscription and endpoint checks, what a push service's answer means, the app-badge rule, this device's push state (pure) |
| `src/lib/notifications/delivery.ts` | `dispatchPush` / `deliverPush` (one attempt per device, recorded, never throws) and a person's own devices: register, status, remove. Takes `PushDeps`, so it is tested without a push service |
| `src/lib/notifications/push-store.ts` | VAPID config, the `web-push` sender, and the real `PushDeps` (server-only) |
| `public/sw.js` | The service worker: push and notification taps only. No fetch handler, no cache |
| `src/app/api/account/notifications/` | `GET` a page, `POST` read / unread / read-all; `unread/` for the bell's count |
| `src/app/api/account/push/` | `POST` register / status / remove for the browser asking |
| `src/app/notifications/` | The history page, the settings page, and the preference action |
| `src/app/notifications/open/[id]/` | Where a tapped push lands: marks it read as the session's person, then redirects to its stored link |
| `src/lib/notifications/manual.ts` | Manual notifications without a server: the draft, the audience selection, the send's snapshot, the delivery summary (pure) |
| `src/lib/notifications/events/announcement.ts` | The `admin.announcement` builder (pure) |
| `src/lib/notifications/manual-service.ts` | Preview, send, history and templates, each checking `send_notifications`. Takes `ManualDeps`, so it is tested without a database |
| `src/lib/notifications/manual-store.ts` | The real `ManualDeps`: roles, instruments and who plays them, names from Clerk, the history queries, the templates (server-only) |
| `src/app/admin/notifications/` | The notification centre: Send (`page.tsx`), `history/`, `history/[id]/`, `templates/`, `policies/`. Send, history and template actions are in its own `actions.ts`; the policy actions are in `src/app/admin/actions.ts` |
| `src/components/admin/notifications/` | The composer, the message fields, the audience picker, the template manager, the history list |
| `src/components/notifications/` | `notification-store.ts` (the one browser store), the bell, the list, the history, the settings; `push-device.ts` (this device's push state and its three actions), `PushSync.tsx` (service-worker messages and the app badge), `PushDevice.tsx` (the settings section and the Dashboard card) |
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
| `notifications` | `event_id`, `recipient_user_id`, `category_key`, `title`, `body`, `action_url`, `priority`, `in_app`, `read_at`, `created_at`. `in_app = false` is someone told by push alone: the row is what their push is about, and stays out of the list and the unread count |
| `push_subscriptions` | One row per browser or installed app: `clerk_user_id`, `endpoint` (**unique on its own**), `p256dh`, `auth`, `device` ("Chrome on Windows"), `user_agent`, `created_at`, `updated_at`, `last_seen_at`, `last_success_at`, `failure_count` |
| `notification_deliveries` | One row per attempt to reach one device: `event_id`, `notification_id`, `recipient_user_id`, `channel`, `push_subscription_id`, `device`, `status` (`sent`, `failed`, `expired`), `status_code`, `error`, `attempted_at`, `delivered_at` |
| `notification_templates` | A manual notification kept to start from: `name`, `title`, `body`, `action_url`, `priority`, `audience` (jsonb, an `AudienceSelection`), `created_by`, `updated_by`, `created_at`, `updated_at`. Added in Phase 4. What was **sent** is not here: a send is its `notification_events` row |

- **Delivery history has no foreign key to a notification or a device.** A notification is replaced when a later one folds into it and a dead device is retired; neither takes the history with it. `device` is the device's name as it was. The endpoint and keys are never written there. `delivered_at` means the push service accepted it, which is all a server is ever told.
- **Phase 4 indexes:** `notification_events (clerk_env, event_key, id DESC)`, `notifications (event_id)` and `notification_deliveries (clerk_env, event_id)`, for the send history.
- **Indexes:** `notifications (clerk_env, recipient_user_id, id DESC) WHERE in_app` for the list; `notifications (clerk_env, recipient_user_id) WHERE in_app AND read_at IS NULL` for the unread count, which is one `count(*)` over it.
- **History is durable.** Title and body are stored as sent. An event's entity is plain text with no foreign key, so deleting a service or a request never deletes the notifications about it. A person's rows go only with their account (`deleteNotificationData`, called from `deleteUserAction`): their notifications, choices, **devices** and delivery rows.
- **The payload never reaches the browser** through anything a person's own notifications are read by (the bell, `/notifications`, the push payload), and is never used to decide access. The one reader is the send history, which shows an announcement's own snapshot to people holding `send_notifications`, and matches on the event's kind so no other event's payload can be read through it.
- **Seeding:** the starting categories and policies are inserted with `ON CONFLICT DO NOTHING`. A category added to `DEFAULT_CATEGORIES` later arrives by itself; nothing an administrator changed is put back.

## Channels and policies

Channels: `in_app`, `push`, `email`. `CHANNEL_STATUS` in `model.ts` says how far along each is:

| Channel | Status | Meaning |
|---|---|---|
| `in_app` | `live` | Delivered now |
| `push` | `live` | Delivered to every device the person switched push on for |
| `email` | `soon` | Not offered: no policy but `unavailable` can be chosen, and nothing can switch it on |

Policies, per category and channel, set under **Admin → Notifications → Policies**:

| Policy | Effect |
|---|---|
| `mandatory` | On. The person cannot turn it off in the site |
| `default_on` | On unless the person turned it off |
| `default_off` | Off unless the person turned it on |
| `unavailable` | Not offered on that channel |

**Mandatory push** means the person cannot switch that category's push off in the site. It never overrides the browser or the operating system: a push reaches only a device where the person switched push on and notifications are allowed. With no such device, a mandatory push is simply not sent, and the notification is still in the app. The settings page says so beneath the list.

A recipient is told when **any** live channel is on for them, and each channel is decided separately by `effectiveSetting()`: in the app only, push only, both, or neither (not told at all).

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
- Sending, templates and the send history: `send_notifications`, a separate permission with the same defaults and its own one-time fix-up (`2026-10-send-notifications-permission`). Someone may hold either without the other.

## Read and unread

`read_at` on the row. Opening a notification marks it read; the dot at the end of a row marks it read or unread; **Mark all as read** does the rest. Reading again keeps the first time.

`components/notifications/notification-store.ts` is the one browser store. The bell, its panel, the history page and the app-icon badge all show it, and its `unread` is THE count. It is refreshed when a page opens, when the tab is looked at again, once a minute while visible, and at once when the service worker says a push arrived or was tapped. Changes show at once and are put back if the server refuses. Push adds no second store: `push-device.ts` holds only how push stands on this device.

## Interface

| Where | What |
|---|---|
| Header | The bell, for signed-in people, at every width. A panel from `sm` up; a dialog on a phone |
| `/notifications` | The history, twenty at a time with **Load more** |
| `/notifications/settings` | **Push on this device** (the browser's side), then a person's own choices for the categories that concern them. Linked from `/account` |
| `/dashboard` | A dismissible card offering to switch push on, only where pressing it can work |
| **Admin → Setup → Notifications** | A group of four pages: Send, History, Templates (`send_notifications`) and Policies (`manage_notifications`, with a test button in development). See [Manual notifications](#manual-notifications) |

## Development test

**Admin → Notifications → Policies → Send me a test notification** shows only on the Clerk development instance. The action refuses anywhere else, needs `manage_notifications`, and only ever sends to the person pressing it. It goes through `notify()`, so the chosen category's policy and your own choice apply, and it is pushed to your devices like any other. It is the quickest way to test push.

## Push

Standard Web Push (VAPID) through the `web-push` package, straight to the browsers' own push services. No third party holds or decides anything.

```
notify()                         decides WHO is pushed to: policy + the person's choice
  -> dispatchPush()              hands over; runs after the response (after())
  -> deliverPush()               every device each person registered, all at once
       -> push service           one attempt per device
       -> notification_deliveries   one row per attempt
       -> a device answering 404/410 is retired
  -> public/sw.js on the device  shows it, sets the app badge, tells open pages
  -> tap                         marked read, the site opens at its page
```

Features never see any of this: they call `notifyBestEffort()` exactly as before.

### Two things that are not each other

| | Answers | Lives |
|---|---|---|
| **Preference** | Should this person hear about this category by push? | The site, one per person and category, the same on every device |
| **Subscription** | Where can a push physically be sent? | `push_subscriptions`, one per browser or installed app; a person may have up to 10 |

And a third that is neither: **the browser's permission**, which only the person and their browser decide. `/notifications/settings` shows the device first ("Push on this device") and the preferences beneath it ("What you hear about").

### Setting it up (VAPID)

```
npx web-push generate-vapid-keys
```

| Variable | |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Handed to browsers when they subscribe. Public. **Read at build time**, so redeploy after changing it |
| `VAPID_PRIVATE_KEY` | Signs every push. Server only; never `NEXT_PUBLIC_` |
| `VAPID_SUBJECT` | Optional: `mailto:…` or an `https://` address a push service may contact. Defaults to the site's address |

- Use **one pair for development and Preview and a different pair for Production**, as with the Clerk keys.
- Without them push is "not set up": nothing is sent, the settings page says so, and everything else works.
- Changing a pair disconnects every device subscribed with the old one. Each reconnects itself on its owner's next visit (the page sees the key no longer matches).

### A device's life

| Moment | What happens |
|---|---|
| **Enable** (a button press, on the settings page or the Dashboard card) | `Notification.requestPermission()`, then the service worker is registered, the browser subscribes, and `POST /api/account/push {action: "register"}` stores it under the **session's** user. The browser remembers who switched it on (`localStorage`, `fwm:push-owner`) |
| **Every visit, signed in** | `PushSync` asks the server whether this browser's subscription is still this person's. Lost (signed out and back, the browser rotated it, the key changed) and it is reconnected without asking, because permission is already theirs. Only if that fails does the page say "needs to be reconnected" |
| **Turn off on this device** | The server row is removed, the browser's subscription is ended, the owner mark is cleared. Other devices and the preferences are untouched |
| **Log out** | The server row is removed and the browser's subscription ended *before* Clerk signs out (never waited on for more than 2.5 seconds). The owner mark stays, so the same person is reconnected on signing in again |
| **Someone else signs in on the same browser** | Push is off for them until they press Enable. If the first person's subscription somehow survived, registering moves it: an endpoint is unique, so it belongs to one account at a time |
| **Signed out some other way** (session expired, signed out from another device) | The next time the site loads signed out, the browser's subscription is ended. The server's row is retired the next time it is tried |
| **Account disabled** | `setBannedAction` deletes the person's subscriptions |
| **Account deleted** | `deleteNotificationData` deletes their subscriptions and delivery rows |
| **Push service says 404 or 410** | The row is deleted and never tried again |

Permission is requested **only** from `enablePush()`, which is only ever called by a button's `onClick`. Nothing asks on load.

### What a device is sent

`buildPushPayload()` in `push.ts`:

```
{ v: 1, id, title, body, url, tag, unread, priority }
```

- `id` is the notification's id: what a tap marks read.
- `url` is checked by `safeActionUrl` when built, by the service worker when shown and again when tapped, and by the page before it navigates.
- `unread` is the person's in-app unread count after this notification, for the app badge.
- The event's `payload` is never in it, nor whose it is. A test checks the keys of every real event's push.
- If the service worker cannot read a payload it still shows a generic "You have a new notification" leading to `/notifications`: a push that shows nothing costs the site its permission.

Sent with a TTL of 72 hours, urgency `high` for `important` and `critical` (else `normal`), and a 5 second timeout per device.

### Folding

Push uses the same family and entity that fold a notification in the app (`pushTag()`):

| Event | Tag |
|---|---|
| Folds (`coalesce` in the catalog) and names an entity | `<family>\|<entityType>:<entityId>`, for example `service_plan.change\|service:2026-10-11-am` |
| Anything else | `n:<notificationId>`, so it never replaces anything |

A device shows one notification per tag, so five quick corrections are one notification on the phone. It is replaced quietly (`renotify: false`), and where the in-app notification was replaced the push carries the folded wording too. The tag, hashed, is also the Web Push `Topic`, so a phone that was switched off receives one message rather than five.

Unlike the app, a tag has no time window: a later change about the same service replaces what is still on screen however old it is.

### Tapping a push

The service worker closes the notification, then:

- **The site is open:** it focuses that window and hands it the tap (`fwm:push-click`). `PushSync` answers, marks the notification read through `/api/account/notifications` and goes to its page with `router.push`, asking first if there is unsaved work. If the page does not answer within 1.5 seconds, the next case applies.
- **The site is closed:** it opens `/notifications/open/<id>`. That route marks the notification read **as the session's person** and redirects to the link **stored** with it (or `/notifications` when it is not theirs, or was since folded into a later one). Signed out, the proxy sends the person to log in and back.

The service worker never calls the API itself. Clerk's session cookie lasts about a minute and is renewed by an open page, so a request from a worker with the site closed would arrive signed out. Opening a page lets Clerk restore the session, and needs no token of any kind.

### The app badge

- **Open:** `PushSync` mirrors the store's `unread` onto the icon with `navigator.setAppBadge()`, and clears it at zero. It waits for the count to come from the server first, so the zero the store starts from never wipes a badge. When the count falls to zero, notifications still on screen are closed as well.
- **Closed:** the service worker sets it from `unread` in the push.
- Unsupported: nothing happens, and nothing is said.

### Delivery tracking

One `notification_deliveries` row per device per notification:

| Status | Push service said | The device |
|---|---|---|
| `sent` | 2xx | `last_success_at` set, `failure_count` reset |
| `failed` | Anything else, or nothing | **Kept.** `failure_count + 1`. Includes 401 and 403, which can be this site's own keys |
| `expired` | 404 or 410 | Deleted |

Every device is attempted whatever happens to the others. Nothing is retried. The table is read by the send history ([Manual notifications](#manual-notifications)) and is there for Phase 5's retries. Someone with push on and no device registered produces no row, because nothing was attempted.

### Security

- A subscription's owner is always the session's user. `registerSubscription`, `subscriptionStatus` and `removeSubscription` take it from the actor, and a `userId` in the body goes nowhere.
- An endpoint must be `https` on a known push service (`PUSH_SERVICE_HOSTS`: FCM, Mozilla, Apple, Windows), so the server can never be made to call an address of someone's choosing.
- Endpoints and keys are never logged, never returned to a browser, and never written to the delivery history. The endpoint travels in a POST body, not a query string.
- `VAPID_PRIVATE_KEY` is read only in `push-store.ts` (`server-only`).
- Rows carry `clerk_env`, and a browser's subscription belongs to its origin, so a development device never receives a production event or the other way round.
- `/sw.js` is served `no-cache` with its own `Content-Security-Policy` (`next.config.ts`).

### Testing it

**Automated** (`npm test`): `push.test.ts`, `delivery.test.ts`, `sw.test.ts` (which runs the real `public/sw.js` against a pretend browser), and the push cases in `events/events.test.ts`.

**By hand.** `http://localhost:3000` is a secure context, so desktop Chrome, Edge and Firefox work against `npm run dev` with the development keys in `.env.local`. An iPhone or iPad needs HTTPS and the Home Screen app, so use a Preview deployment. In development, **Admin → Notifications → Send me a test notification** sends one through the whole path.

| # | Check | Expect |
|---|---|---|
| 1 | Desktop Chrome, `/notifications/settings` | "Push notifications are off on this device" and an Enable button. No permission prompt until it is pressed |
| 2 | Press Enable, allow | "on for this device". A row in `push_subscriptions` |
| 3 | Send a test notification with the tab open | An OS notification; the bell's count rises without a reload |
| 4 | Close every tab of the site, send another (from a second browser or device) | The OS notification still arrives |
| 5 | Click it with the site closed | The site opens at the notification's page; it is read; the bell agrees |
| 6 | Click one with the site open on another page | That window comes forward and goes to the page; nothing new opens |
| 7 | Installed app (Chrome or Edge: Install) | The icon shows the unread count; **Mark all as read** clears it, and clears notifications still on screen |
| 8 | Installed app closed, send one | The badge rises |
| 9 | Publish a service, then edit it five times quickly | One notification on the device, reading "Several changes…", not five |
| 10 | Block notifications for the site in the browser | "Notifications are blocked for this site", no button; in-app notifications still arrive |
| 11 | Enable on a second browser or device, same account | Both receive; **Turn off on this device** on one leaves the other working |
| 12 | Settings: turn "In the app" off and leave Push on for a category | The push arrives; nothing appears in the bell |
| 13 | Settings: turn Push off for a category | In the bell only |
| 14 | Log out, sign in as someone else in the same browser | Push is off for them; a notification to the first person does not appear |
| 15 | Sign back in as the first person | Push is on again without pressing anything |
| 16 | Dead subscription: Chrome site settings → reset permission, then send | `notification_deliveries.status = 'expired'` and the `push_subscriptions` row is gone |
| 17 | iPhone or iPad in Safari | "needs the installed app", no Enable button |
| 18 | iPhone or iPad, Home Screen app | Enable works; the push arrives with the app closed; tapping opens the app at the page; the icon shows the count |
| 19 | Remove the VAPID keys and restart | "not set up"; publishing and everything else works |

### Known limits

- **iPhone and iPad:** only the Home Screen app (iOS 16.4 or later), never a browser tab. Apple ignores `renotify`, and may show a replaced notification as new.
- **Firefox** has no app badge. **Safari on a Mac** badges the Dock icon only for a site added to the Dock.
- **Android** shows a badge dot rather than a number on most launchers; that is the launcher's choice.
- **A session that ends silently** (expired, or signed out from another device) leaves its device registered until that browser next opens the site signed out, or the push service retires the endpoint. In that gap a push can still reach it. Logging out with the button, disabling the account and deleting it all close the gap at once.
- **A push-only notification** (the app's off, push on) is not in the bell, so it does not count toward the badge.
- **`delivered_at` is acceptance by the push service.** Whether a device showed it is never reported.
- **A push is a few hundred milliseconds behind the action**, because it is sent after the response.
- **Clearing the browser's site data** drops the subscription and the owner mark: push is off there until enabled again, and the old row is retired on its next attempt.

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
| `admin.announcement` | Someone sends a notification from Admin → Notifications | the audience they chose, **themselves included** | whatever they chose (normal by default) | `admin_announcement:<uuid>` |
| `system.test` | The development test button | the person pressing it | normal | none |

An anchor is a service's address, `2026-10-11-am`. In every row but `admin.announcement` the actor is left out (`except`). Nothing is `critical`: that is kept for the exceptional.

**Availability's recipients.** Someone changing their own: `availabilityManagers`. A leader changing someone else's: that person ("Your availability was changed") and the other `availabilityManagers` ("John's availability changed"), as two events about the same entity, because the two are worded differently. The whole music team is never told. The note written with an exception is never put in a notification.

**Entities.** Every real event names one (a test enforces it). The type says what kind of thing, the id is stable for that thing, and together they are what folding keys on, what a push's replacement tag is made from, and what an activity view will key on later. The payload beside it holds detail (the services of a publication, the changes of an edit); it stays on the server and never decides access.

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

`service_plan.published`, `account.request_created` and `admin.announcement` never fold: each publication, each request and each announcement is its own.

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

Admin → Notifications → Policies still lists every category.

## Manual notifications

**Admin → Setup → Notifications** is where a person writes a notification and sends it. It is a caller of `notify()` and nothing more: there is no second push path, no second history, and no channel chosen in the composer.

```
compose                          title, message, link, priority, audience
  -> review                      the server says who it would reach now (planRecipients)
  -> Send                        sendAnnouncement(): validates, resolves the audience AGAIN
       -> notify()               event admin.announcement, category admin_announcement
            -> policy + choices  the Announcements policy and each person's own settings
            -> notifications     one row per person told, the sender among them
            -> dispatchPush()    every registered device, tracked as always
  -> History                     the event row itself, its payload the snapshot
```

### Pages and permissions

| Page | Address | Needs |
|---|---|---|
| Send | `/admin/notifications` | `send_notifications` |
| History | `/admin/notifications/history`, `/history/<event id>` | `send_notifications` |
| Templates | `/admin/notifications/templates` | `send_notifications` |
| Policies | `/admin/notifications/policies` | `manage_notifications` |

- `send_notifications` and `manage_notifications` are separate; either may be held alone. Both are in `ADMIN_PERMISSIONS`, and the sidebar shows only the pages a person may open (`admin-sections.ts`).
- `/admin/notifications` used to be the policy page. Someone who holds `manage_notifications` and not `send_notifications` is redirected from it to `/policies`.
- Every action goes through `withPermission("send_notifications")`, and every function in `manual-service.ts` checks the permission again.

### The composer

- **Title** and **message**: required, tidied and limited by the notification system's own `normalizeTitle` / `normalizeBody` (120 and 600 characters).
- **Open when tapped**: optional. A page on this site only, checked by `safeActionUrl`; common pages are suggested and any internal path may be typed. With none, the notification leads nowhere (the event has no default link).
- **Priority**: `NotificationPriority`, normal by default.
- **Three steps:** compose, review, sent. Only the review step has a Send button. The review shows the notification as the list will show it, the audience, how many people will be told and who, how many have push on for announcements, and how many in the audience switched announcements off (possible only if the policy is no longer mandatory).
- **After sending:** "Notification sent to N people." N is the number of people told, which is what `notify()` returns. It says nothing about devices.

### The audience

An `AudienceSelection` (`manual.ts`) is any mix of four parts; several means **anyone in any of them, each once**.

| Part | What it is | Resolved by |
|---|---|---|
| `named` | Everyone, Music Team, Musicians, Song Leaders, Music Director / planners, Administrators, Service Plan Viewers, Availability Managers, AI Users | `AUDIENCES` in `audience.ts`, unchanged |
| `roles` | Any role the site has, custom ones included | `{ kind: "role" }` |
| `userIds` | Particular people | `{ kind: "users" }` |
| `instrumentIds` | Everyone who lists the instrument on their profile | `user_instruments`, looked up in `manual-service.ts` and handed over as users |

- `toAudience()` turns a selection into one `anyOf(...)` audience, so deduplication is `resolveAudience()`'s, as for every event.
- Instruments are not part of the generic `Audience` type. The manual layer resolves them to people first.
- The role and instrument lists are the site's live ones (`listRoles`, `listOptions("instruments")`). The picker hides the Member role (Everyone already says it) and archived instruments unless one is already chosen.
- **The sender is not excluded.** No `except` is passed.
- **The preview is never trusted.** `previewAnnouncement()` and `notify()` both decide through `planRecipients()` (extracted from `notify()` in `service.ts`), so they cannot disagree about the rule. `sendAnnouncement()` takes only the draft, and resolves roles, instruments, accounts, policies and choices again at that moment. Anything else in the request is ignored.
- A send whose audience names a role, instrument or person that no longer exists is refused ("stale") rather than quietly narrowed. A send that would reach nobody is refused and leaves no event.

### Sending and failure

- `sendAnnouncement()` calls `notify()`, not `notifySafely()`: this is the one place where the notification is the action, so a refusal or a thrown error is reported to the sender as "nothing was sent".
- A push that fails after the notification is written does not fail the send. It is a row in `notification_deliveries`, as for any notification.
- The accounts are read from Clerk once per send, and that list is handed to `notify()` in place of a second request.

### Templates

- Optional. Compose, send, done needs none, and sending never creates one.
- A template keeps a name, the message, link, priority and audience. It needs a name and a title; the message and audience may be left for whoever uses it. At most 100.
- **Use** is a link to `/admin/notifications?template=<id>`: the composer starts with a copy. Editing that draft does not change the template; **Save as template** offers "Update template" explicitly.
- Create, edit, duplicate ("Copy of …") and delete are on the Templates page.
- A send records the template it was started from (`{ id, name }`, as it was called then) in its snapshot. Editing or deleting the template afterwards changes nothing already sent.

### History

There is no history table. A send is its `notification_events` row (`event_key = 'admin.announcement'`), and its `payload` is the snapshot:

```
{ v: 1, title, body, actionUrl, priority, audience, labels, recipients, senderName, template }
```

- `audience` is the selection as chosen; `labels` is the same in words as they read then (a role's label, an instrument's name, a person's name), so a later rename changes nothing.
- `recipients` is how many people were told. `NotifyInput.payload` may be a function of that count, which is how it gets into the snapshot.
- `senderName` is kept beside the event's `actor_user_id`, so the history still reads when the sender's account is gone.
- **The list** is newest first, 20 at a time with "Show older notifications" (cursor on the event id).
- **The detail page** shows the snapshot, the people who still have a notification from the send (read from `notifications`), and each push attempt to them by **device name and outcome only**. Someone whose account was deleted is no longer listed, because their notifications went with it; the snapshot's count still says how many were told. Names come from Clerk; if it cannot be reached the page still shows everything else.
- **Use again** is a link to `/admin/notifications?from=<event id>`: the composer starts with a copy of the message and audience. It sends nothing, changes nothing and makes no template. Whatever of the old audience no longer exists is left out, and the composer says so.

### Delivery reporting

`summarizeDeliveries()` adds up a send's `notification_deliveries` rows:

| Shown as | Meaning |
|---|---|
| Push attempts | One per device per person |
| Accepted by push service | `sent`. Not proof that a device displayed it or that anyone read it; the page says so |
| Failed | `failed` |
| Device no longer registered | `expired` |
| People with an accepted push | People with at least one `sent` |
| People with no push attempted | People told with no delivery row: push off for them, or no device registered, or push not set up. The tables cannot say which |

### Security

- Permission is checked on every page, in every action and again in every service function.
- Title, message, link, priority and every part of the audience are validated on the server (`parseDraft`, `parseSelection`), and roles, instruments and people are checked against what exists.
- Links are internal paths only (`safeActionUrl`).
- The history never returns a device's endpoint or keys: they are not in `notification_deliveries`, and a test checks nothing returned contains them.
- An announcement's snapshot is read only through the `send_notifications`-gated history. What recipients receive is the ordinary `NotificationItem` and push payload, with nothing of it.
- Every query carries `clerk_env`.

### Testing it by hand

| # | Check | Expect |
|---|---|---|
| 1 | Admin → Notifications → Send; write a message, choose Everyone, Review | The preview, the count and "Show who" |
| 2 | Send | "Notification sent to N people"; it is in your own bell; a push arrives on a device with push on |
| 3 | History | The send, newest first; its page shows who was told and each device's result |
| 4 | Use again | The composer filled in; nothing sent until you send |
| 5 | Save as template; then Templates: Use, Edit, Duplicate, Delete | Each works; history is unchanged |
| 6 | Musicians + one instrument a musician plays | That person is counted once |
| 7 | An account with only `manage_notifications` | Policies only; `/admin/notifications` redirects there |
| 8 | An account with only `send_notifications` | Send, History, Templates; no Policies |
| 9 | Policies: set Announcements push to Unavailable, send | In the app only; no push attempt |

## Decisions that differ from the Phase 4 brief

- **Two extra refusals.** A send to an audience that resolves to nobody is refused and leaves no event, and a send naming a role, instrument or person that no longer exists is refused rather than narrowed.
- **A template needs only a name and a title.** Its message and audience may be empty, so a template can be a reusable message without a fixed audience.
- **The recipient list on a send's page is read live from `notifications`,** not snapshotted; only the count is in the snapshot. A deleted account's rows go with the account, as decided in Phase 3.
- **`notify()` changed in two small ways:** the recipient rule moved into an exported `planRecipients()` so the preview uses the same code, and `payload` may be a function of the recipient count. Behaviour for existing events is unchanged.
- **Three new indexes** on existing tables, for the history queries.
- **"People with no push attempted" is one number.** The brief asked for recipients with no registered device; the tables cannot tell that apart from push being off for the person or not set up, so the page reports what it can prove and says what it may mean.
- **The Member role is not offered as a role** in the picker, and **archived instruments** are offered only when already chosen.
- **Named audiences are the nine the brief listed.** `accountManagers` and `sheetMusicManagers` exist in `AUDIENCES` and are not offered; adding one is a line in `MANUAL_AUDIENCES` and its wording.

## Decisions that differ from the Phase 2 brief

- **Folding replaces a row rather than editing it**, so the folded notification moves to the top with a fresh time, and the store stays one statement.
- **A leader changing someone else's availability is two events**, one worded for the person and one for the other leaders.
- **Settings relevance is in code** (`CATEGORY_RELEVANCE`), beside the permissions it names, not a column on the category.
- **Cancelled and restored reach the availability board too**, not only people who read song lists: they are about whether to come.
- **A service that has started is never notified about**, including a publication that only records what was sung.
- **The library index notifies on newly failed files only**, which is what keeps an unresolved problem from repeating without storing any state.
- **Titles use the planner's own names** ("Sunday Morning", capitalised) so a service reads the same in a notification as on its page.

## Decisions that differ from the Phase 3 brief

- **The service worker does not mark a notification read itself.** It has no dependable session with the site closed. It opens a page that does (`/notifications/open/<id>`), or hands the tap to a page already open.
- **The service worker is registered when push is switched on**, not for every signed-in visitor: someone who never enables push never has one.
- **Push is sent after the response** (`after()`), not inside the action, so nobody waits on Apple or Google.
- **Signing out ends the browser's subscription as well as the server's record**, and the same person is reconnected silently on return. "Repair" is therefore almost always automatic; the button appears only when it fails.
- **Endpoints are restricted to known push services**, which the brief did not ask for.
- **401 and 403 do not retire a device.** They usually mean this site's keys are wrong, and deleting every subscription for that would be worse than the failure.
- **A person's delivery rows are deleted with their account**, like their notifications; delivery history otherwise outlives the notification and the device it refers to.
- **`unread` in a push is the in-app count**, so a push-only notification does not raise the badge.
- **No `renotify` field in the payload:** replacement is always quiet, so the service worker sets it.

## Adding an event

1. Add its key to `NOTIFICATION_EVENTS` in `catalog.ts`: category, priority, default link, and `coalesce` if repeats should fold.
2. Write a builder in `events/` that returns the `NotifyInput`, or `null` when there is nothing worth saying. Use a named audience, `except: [actor]`, and always an `entity`. Put the wording in `src/content/notifications.ts` under `events`.
3. `await notifyBestEffort(env, builder(...))` after the feature's write.
4. Add it to the samples in `events/events.test.ts` (the test fails until every catalog event is there) and test its rules.
5. Add it to the table above.

## Later phases

- **Phase 5 (scheduling and reliability):** scheduled, delayed and recurring manual sends, which can reuse the composer as it is: a scheduled send is a stored `AnnouncementDraft` (the shape a template already keeps) handed to `sendAnnouncement()` when its time comes, so the audience is resolved then. Also retries for `failed` deliveries (the rows and `failure_count` are there to drive them; `deliverPush` makes exactly one attempt), retiring a device after many consecutive failures, pruning old delivery rows, upcoming-service reminders, digests, and AI budget alerts at 75%, 90% and 100%, which need stored threshold-crossing state per billing month. Sheet-music report events (`created`, `replied`, `resolved`) arrive with that feature, under the `sheet_music_report` category that already exists.
- **Phase 6 (email):** set `CHANNEL_STATUS.email` to `planned` then `live`. `allowedPolicies("email")` then offers mandatory, default off and unavailable; "default on" is never offered for email.
