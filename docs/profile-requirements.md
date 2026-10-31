# Profile requirements, onboarding and the profile gate

What every member is asked for, by when, and what happens if it is missing. The rules live in one pure module, `src/lib/auth/profile-requirements.ts`. The session gate, onboarding (`/welcome`), the Profile, the Dashboard and Admin all use it.

## Who is asked what

What someone is asked depends on what they do in the ministry, never on administering the site.

| Person | How it is decided | Required |
|---|---|---|
| Everyone | — | First and last name |
| Musician | holds the **Musician** role | at least one instrument, a proficiency for each, exactly one primary, how they play (by ear ↔ sheet music) |
| Song leader | holds `lead_songs` **on purpose**: a role or an individual grant, not denied, and never the Administrator role's blanket permissions. This is the same test as being offered as a leader. | song-leading skill level (Beginner, Low Intermediate, High Intermediate, Advanced), comfort with unfamiliar hymns, comfort leading without accompaniment |
| Musician **or** song leader | — | whether they read sheet music (asked once) |
| Musician or song leader who holds `view_availability` on purpose | — | normal services reviewed |

- **Never required:** photo, middle name, preferred name, phone, biography, voice part, music theory.
- **Answers:** `null` means not answered. `false`, "None" and an empty availability that was confirmed are all answers. Nothing is ever filled in for the person; for example, a new instrument starts with no proficiency chosen.
- **Shared questions:** someone who both plays and leads is asked each shared question once.
- **Administrators:** an administrator is never a musician or song leader just for being one.
- **Custom roles:** a custom role that grants `lead_songs` does make someone a song leader, because they can be assigned to lead. A deny of `lead_songs` removes the song-leading questions.
- **Availability:** the availability question is only asked of people who can set it. Without `view_availability` they couldn't reach the form.
- **Music Directors:** a Music Director holds `lead_songs` by default, so they are asked the song-leading questions.
- **Song-leading answers are informational.** Scheduling never reads them, and they never stop anyone being assigned. They are visible only to the person and to staff with `view_profiles` (`profile-visibility.ts`).
- **Removing a role** hides that role's section but deletes nothing.

## Normal services: "reviewed"

`user_profiles.availability_reviewed_at` (and `_by`) records the last time normal services were saved on purpose through the one existing write path (`changeNormalAvailability` → `setNormalAvailability`). An empty pattern counts only with **"I am not regularly available for any of these services"** ticked. The server refuses an empty list without it (`normalAvailabilitySchema`).

When the column was added, every non-empty pattern was marked reviewed, because someone chose it. An empty pattern stays unreviewed until it is confirmed. A leader saving someone's pattern on their behalf also counts as a review, and `availability_reviewed_by` records who did it.

## Deadlines

Deadlines are stored in the database, one per person per requirement (`profile_requirement_deadlines`). Each person also gets a baseline (`profile_requirement_baselines`): the first time they were accounted for. Nothing the person does moves a deadline. Saving, revisiting or signing in on another device changes nothing. Only an administrator's **Give 7 more days** moves one.

Whether an account is new depends on **when Clerk created it** compared with the policy's activation. It never depends on what happens to be stored.

| Account | First seen under the policy | A requirement gained later (new role) |
|---|---|---|
| Created before activation | due **activation + 7 days**, however late they first sign in | due **then + 7 days** |
| Created at or after activation | due **immediately**: finished in onboarding | due **then + 7 days** |

If Clerk can't be reached and the account's age is unknown, nothing is recorded and the person is not blocked on that request.

**States** (`profileStatus()`):
- **complete:** nothing is missing.
- **advisory:** something is missing but no policy is active. A notice only.
- **grace:** something is missing and its deadline hasn't passed, or the policy can't block yet.
- **blocked:** a missing answer is past its deadline.
- **unknown:** the status couldn't be worked out. It blocks nothing.

Every request works the status out afresh, so a saved answer lifts the block immediately, on every device and session.

## Activation (per environment, explicit)

Deploying never starts enforcement. Activation is a `site_settings` row, `profile_requirements`, scoped to the Clerk environment like everything else. Production and Development are activated separately.

**Admin → Configuration → Profile requirements → Activate** (`manage_site_settings`) runs `src/lib/auth/activation-run.ts`:

1. **Write the policy.** It is written once (`ON CONFLICT DO NOTHING`) and read back. Its `activatedAt` is the single start date, however many times Activate is pressed or by how many people.
2. **Snapshot existing accounts.** It visits every Clerk account oldest first, 100 per page, so accounts created meanwhile only join the end. Each account that existed before `activatedAt` gets its baseline, plus a deadline of `activatedAt + 7 days` for each requirement that applies to it. Every write is `ON CONFLICT DO NOTHING`.
3. **Verify the snapshot.** Every account Clerk reports must have been counted, and every pre-activation account must have its baseline.
4. **Enable blocking.** Only now is the snapshot marked `complete`, and only a complete snapshot that isn't paused can block anyone.

If any step fails, nothing is blocked (the snapshot stays `pending`) and the panel says so. Pressing **Finish activating** repeats steps 1–4. That changes nothing already done and never moves a deadline.

**Pause** stops all blocking at once while the notices still show. **Resume** turns blocking back on. Deadlines stand either way.

## Where the gate applies

The gate is in `requireViewer()` (pages) and `withPermission()` (server actions) in `src/lib/auth/session.ts`. It is **on by default**. A blocked person who opens a gated page is sent to `/welcome?next=<page>`. A gated action refuses with "Please finish your profile first". Routes that read the session themselves call `isProfileBlocked()` and answer 403 `profile-incomplete`, or their members-only answer is withheld.

**Gated:**
- Dashboard (and its sheet-music packets), Availability (calendar and changes), Service Planner (pages, actions, export, Generate with AI), Conductor (page and APIs).
- Members-only sheet-music files, the signed-in song-list PDF, song leaders on the song list, the capo setting, the palette's availability command.
- The planner audit on archived services, and managing support requests.

**Exempt** (`PROFILE_GATE_EXEMPT` / `withPermissionExempt()`):
- `/welcome`, `/profile`, `/profile/edit` and their actions: where the profile is finished.
- `setNormalPattern`: the availability requirement is met through it.
- `/account`: signing in, password, devices. Log out is Clerk's and is never gated.
- `/notifications`, `/notifications/settings`, the bell, push: notices, including about access.
- The Support Center: `/contact`, a person's own requests, asking, replying and the context lookups. This is help.
- All of `/admin` and its actions, so administrators can always resolve account problems.
- `/api/account/me`, which reports the state to the menu.

**Never involved:** cron jobs, webhooks, notification delivery, the email outbox and public pages. They never read a viewer.

`src/lib/auth/profile-gate.test.ts` reads the code. It fails if an exemption appears anywhere not listed here, or if a route reads the session without checking the gate.

## Onboarding (`/welcome`)

New members land on `/welcome?new=1` after accepting their invitation (`signUpFallbackRedirectUrl`). The steps are About you, Your ministry, Availability, Notifications and Your Dashboard. The plan comes from `onboardingPlan()` in `src/lib/auth/onboarding.ts`:

- **full:** the walkthrough, from sign-up or **Replay the introduction** on `/profile`. It contains every step that applies.
- **focused:** an existing member with something missing sees only the steps holding it. Someone made a song leader later sees only Your ministry, and Availability if it hasn't been reviewed.
- **done:** nothing to do.

How the steps behave:
- **Required steps** are done only when their answers are saved. Pressing a button never counts.
- **Optional steps** (Notifications, Dashboard) record that they were seen or skipped in `onboarding_progress`. That table holds no profile data.
- **Resuming:** it picks up in the same place after a reload, on another device or a week later.
- **Prefilled:** every value comes from what is saved, and a step saves only what changed.
- **Notifications step:** it explains the channels, offers push on this device (permission is asked only when the button is pressed) and the opt-in email switch for song leading, and links to the full settings. Nothing is switched on for anyone, and no email is sent by onboarding or by saving a profile.

## Where it shows

- **Dashboard:** a notice above everything else, which can't be dismissed while something is missing. It lists what's needed and the date, with **Finish now**. Normal services that are a requirement appear there once, not again as an attention item.
- **Account menu:** a gold dot on the avatar and beside Profile, from `/api/account/me`. While the profile needs something, it is checked again on each page, so the dot goes as soon as the profile is finished.
- **Profile:** the status card ("complete", or what's missing and by when).
- **Admin → People → person** (`view_profiles` / `manage_users`): their status and deadline, read without recording anything, and **Give 7 more days** (`manage_users`, never for yourself).

## Data (all additive, created on first use by `schema.mjs`)

- `user_profiles.availability_reviewed_at`, `availability_reviewed_by`, plus a one-statement backfill: non-empty patterns count as reviewed.
- `user_song_leading`: `experience`, `unfamiliar_hymns`, `unaccompanied_leading`, each `NULL` when unanswered.
- `profile_requirement_baselines`, `profile_requirement_deadlines`, `onboarding_progress`.
- `site_settings` row `profile_requirements`.

Deleting an account removes the person's rows from all of them.

**Note:** Local, Preview and Production share one Neon database. The first time a build with this code touches the account tables, in any environment, it adds the columns and tables above and runs the backfill for every environment's rows. That is safe: it is additive and idempotent, and the code already in production ignores the new columns. Activation remains separate for each environment.

## Owner runbook

1. Deploy as usual. Nothing is enforced; the new tables create themselves.
2. Sign in to **Production** as an administrator and open **Admin → Configuration → Profile requirements**. Press **Activate** and confirm. The panel should read "Active since … N existing accounts were given until …". If it reads "Activating", press **Finish activating**.
3. Invite song leaders as usual (**Admin → Invitations**, ticking **Song Leader**). They go through `/welcome` straight after creating their account.
4. If something goes wrong: **Pause** stops all blocking at once, and **Give 7 more days** on a person's page unsticks one person.
