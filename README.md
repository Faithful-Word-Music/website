<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/banner-dark.png">
    <img src=".github/assets/banner-light.png" alt="Faithful Word Music: The Music Ministry of Faithful Word Baptist Church" width="100%">
  </picture>
</p>

# Faithful Word Music

The website of **Faithful Word Music**, the music ministry of
[Faithful Word Baptist Church](https://www.faithfulwordbaptist.org/) in Phoenix, Arizona.

- **Live site:** https://faithfulwordmusic.com
- **Contact inbox:** contact@faithfulwordmusic.com
- **Editing words, links or the song list?** See **[CONTENT-GUIDE.md](./CONTENT-GUIDE.md)**, which needs no coding. This file is for developers.

---

## Contents

1. [At a glance](#at-a-glance)
2. [Quick start](#quick-start)
3. [Environment variables](#environment-variables)
4. [Project structure](#project-structure)
5. [How it works](#how-it-works)
   - [The song list](#the-song-list) · [Next and Now](#next-and-now) · [Song history and the archive](#song-history-and-the-archive)
   - [The year in song](#the-year-in-song)
   - [The printable PDF](#the-printable-pdf) · [Sharing services](#sharing-services) · [The contact form](#the-contact-form)
   - [Sheet music](#sheet-music) · [Member accounts](#member-accounts) · [The signed-in experience](#the-signed-in-experience) · [Availability](#availability)
6. [Design conventions](#design-conventions)
7. [Testing](#testing)
8. [Deploying to Vercel](#deploying-to-vercel)
9. [Setup guides](#setup-guides): [Google Sheets](#google-sheets) · [Song archive](#song-archive) · [Sheet music (service account)](#sheet-music-service-account) · [Resend](#resend) · [Accounts (Clerk)](#accounts-clerk)
10. [Gotchas](#gotchas)
11. [Accessibility and SEO](#accessibility-and-seo)

---

## At a glance

One Next.js app on Vercel. There's no separate backend or CMS. The song list is read live from a public Google Sheet, and nothing about it is baked into the build. The public site needs no login; invite-only [member accounts](#member-accounts) sit alongside it.

| Address | What it is |
|---|---|
| `/` | Home: what the ministry is, with links to the song list and contact page. Signed-in members are sent to `/dashboard` instead |
| `/song-list` | The congregational song list, live from Google Sheets: next-service spotlight, month tabs, search, key filter, PDF and sharing |
| `/song-list/archive` | Every song ever sung, searchable, with counts and dates |
| `/library` | The Library: every song with a page, A-Z (audio and other resources to follow). Old `/song-list/archive/<song>` links redirect to `/library/songs/<song>` |
| `/library/songs/<song>` | One song's history: times sung, keys used, upcoming services, plus its sheet music and details from the Sheet Music Index |
| `/library/songs/<song>/sheet-music/<file>` | One sheet-music file (PDF or `.mscz`) from private Drive, served only if the song's rights allow it |
| `/song-list/year/<year>` | A year of singing: most sung hymns, songs per month, keys, favourites (`/song-list/year` goes to the latest) |
| `/song-list/pdf/<month>` | A month as a one-page printable PDF |
| `/song-list/image/<month>?s=<ids>` | One to three services as a PNG picture, for sharing |
| `/contact` | Contact form, emailed to the ministry through Resend |
| `POST /api/contact` | The contact form's endpoint |
| `GET /api/cron/sync-archive` | Nightly job that saves past services to the archive database |
| `GET /api/cron/quarterly-report` | Emails the music director a report on the quarter just ended |
| `/login` | Member log in (Clerk). Linked only from the footer, never the main navigation |
| `/request-access` | Ask for an account. Creates a request for an administrator to review, never an account |
| `/accept-invite` | Where Clerk invitation emails land; the only place an account can be created |
| `/dashboard` | The signed-in home: what needs the member's attention and what is coming up for them |
| `/availability` | The music ministry's shared availability board: normal services, and dated exceptions for whole services. Musicians, song leaders and the music director only (`view_availability`) |
| `/profile`, `/profile/edit` | A member's own profile (who they are in the ministry) and its editor |
| `/account` | Account settings: Clerk's screen for sign-in email, password and devices. Old `/account/edit` and `/account/security` links redirect |
| `/admin/...` | Requests, invitations, people, roles, and the title and instrument lists. Each section needs its own permission |
| `POST /api/account-requests` | The request form's endpoint |
| `/manifest.webmanifest`, `/app-icon/<variant>`, `/apple-icon` | What makes the site installable as the Faithful Word Music app, and its icons. See [Installing the app](#installing-the-app) |

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Google Sheets API ·
Neon Postgres (song archive) · Resend (email) · Vercel BotID · `@react-pdf/renderer` (PDF) ·
`next/og` (pictures and link previews) · Clerk (member sign-in) · Zod · Vitest.

> **Heads-up for contributors:** this is Next.js 16, which has breaking changes from older versions.
> Before writing Next-specific code, read the relevant guide in `node_modules/next/dist/docs/`
> (see [AGENTS.md](./AGENTS.md)).

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill in real values (see below)
npm run dev                    # http://localhost:3000
```

The site runs without any keys. The song list shows a "not connected" message and the contact form returns a clear error until the keys are added.

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Serve the production build locally |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type check |
| `npx next typegen` | Regenerate route types (needed after adding a route; see [Gotchas](#gotchas)) |

**Handy in development:** add `?now=2026-09-27T10:29:00-07:00` to `/song-list` to pretend it's that moment, which lets you check the Next/Now markers.

---

## Environment variables

All of these are **server-only secrets** except `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. Secrets never start with `NEXT_PUBLIC_`, because that prefix puts a value into the browser's JavaScript, where anyone can read it.

| Variable | Powers | Where it's read | Needed in |
|---|---|---|---|
| `GOOGLE_SHEETS_API_KEY` | The song list | `src/lib/google-sheets.ts` | Development, Preview, Production |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Sheet music on song pages (optional) | `src/lib/google-auth.ts` | Development, Preview, Production |
| `GOOGLE_PRIVATE_KEY` | Sheet music on song pages (optional) | `src/lib/google-auth.ts` | Development, Preview, Production |
| `RESEND_API_KEY` | The contact form and archive alerts | `src/lib/resend.ts` | Development, Preview, Production |
| `DATABASE_URL` | The permanent song archive (optional) | `src/lib/db.ts` | All, and added automatically by the Neon integration |
| `CRON_SECRET` | Protects the nightly archive sync | `src/app/api/cron/sync-archive/route.ts` | Production, and locally if you run the sync by hand |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Member accounts (optional). **Public**, and a **different value per environment** | Clerk SDK, `src/lib/auth/clerk-env.ts` | Local + Preview: `pk_test_…` · Production: `pk_live_…` |
| `CLERK_SECRET_KEY` | Member accounts (optional). **Different value per environment** | Clerk SDK, `src/lib/auth/clerk.ts` | Local + Preview: `sk_test_…` · Production: `sk_live_…` |

The two Clerk keys are the exception to "tick every environment": see [Accounts (Clerk)](#accounts-clerk).

- **`.env.local`** holds the real values for your machine. It's git-ignored.
- **`.env.example`** holds placeholders and documents what exists. It's committed.
- **Production values** are set in **Vercel → Settings → Environment Variables**, never in a committed file. Changing one requires a redeploy.
- To pull them down locally: `npx vercel env pull .env.local`.

The files that read secrets import `server-only`, so accidentally importing one into browser code fails the build instead of leaking a key. A missing key never crashes a page; the feature just shows a friendly error.

Anything **public** (the contact address, links, the spreadsheet ID, service times) lives in `src/config/site.ts`, not in environment variables.

---

## Project structure

```
assets/fonts/                 TTF/WOFF fonts for the PDF, pictures and link previews
scripts/bootstrap-admin.mjs   Makes the first administrator, once per Clerk instance
src/
├── proxy.ts                          Signed-out visitors on the member pages → /login; signed-in visitors on / → /dashboard
├── app/
│   ├── page.tsx                      Home
│   ├── song-list/
│   │   ├── page.tsx                  Song list (server: fetch + parse, then the interactive view)
│   │   ├── archive/                  Archive and per-song pages
│   │   ├── pdf/[month]/route.tsx     Printable PDF of a month
│   │   └── image/[month]/route.ts    Shareable PNG of 1–3 services
│   ├── contact/page.tsx
│   ├── api/contact/route.ts          Contact form endpoint
│   ├── api/cron/sync-archive/        Nightly archive sync
│   ├── login/  request-access/  accept-invite/   Member log in, account requests, invitations (Clerk)
│   ├── dashboard/                    The signed-in home
│   ├── availability/                 The availability board and its server actions
│   ├── profile/                      A member's own profile and profile editor
│   ├── account/                      Account settings (Clerk: email, password, devices)
│   ├── admin/                        Requests, invitations, people, roles, titles & instruments
│   ├── api/account-requests/         Account request endpoint
│   ├── layout.tsx                    Fonts, header, footer, base metadata
│   ├── globals.css                   Design tokens (@theme), motion, print
│   └── opengraph-image.tsx, sitemap.ts, robots.ts, icon.svg, not-found.tsx
├── components/
│   ├── song-list/                    Everything on /song-list (see below)
│   ├── account/  admin/              Account pages' forms, the account context and menu, and the admin editors
│   ├── dashboard/                    The Dashboard's sections
│   ├── availability/                 The availability calendar, dialogs and editors
│   ├── ui/                           Shared pieces: Button, Card, Reveal, BackToTop…
│   └── layout/  home/  contact/
├── config/site.ts                    Every public setting, in one place
├── content/                          All page wording (edit without touching components)
├── lib/                              Logic, kept free of UI (see below)
│   └── auth/                         Accounts: Clerk wrapper, session and permission checks, the account tables
└── types/song-list.ts                The song list's data shapes
```

**`src/lib`, the logic:**

| File | Job |
|---|---|
| `google-sheets.ts` | Fetches the spreadsheet (server-only) |
| `song-list.ts` | Turns the sheet's grid into services and songs (pure, no I/O) |
| `service-time.ts` | Service times, Next/Now timeline, date formatting (Arizona time) |
| `song-history.ts`, `song-archive.ts`, `archive-store.ts`, `archive-view.ts`, `db.ts` | Song history and the archive database |
| `song-list-pdf.ts` | Fits a month onto one PDF page (row height, column split) |
| `share-services.ts` | The shared text format, and the three-service limit |
| `year-recap.ts` | The year in song: totals, most sung, months, keys, favourites |
| `service-picture.tsx` | Draws the shareable picture |
| `text-measure.ts` | Predicts where Inter text wraps (used by the PDF and the picture) |
| `og.tsx` | Link-preview cards, plus the fonts, logo and colours the picture reuses |
| `resend.ts`, `validation.ts` | Email sending and the shared form schema |
| `google-auth.ts` | The service account's access token (server-only) |
| `sheet-music-index.ts` | Reads the Sheet Music Index and streams files from Drive (server-only) |
| `sheet-music.ts` | Reads Drive folders and file names, joins them to the Songs tab, matches song-list songs, builds the browser-safe view (pure, no I/O) |
| `sheet-music-access.ts` | `canAccessFile()`: the one rule for who may open which file |
| `auth/session.ts` | Who is asking and what they may do: the one gate for account pages and actions (server-only) |
| `auth/permissions.ts` | The permission list, the starting roles, and how roles and exceptions combine (pure) |
| `auth/store.ts`, `auth/schema.mjs` | The account tables in Neon, each row tagged with its Clerk instance (server-only) |
| `auth/clerk.ts`, `auth/clerk-env.ts` | Every Clerk Backend API call, and which Clerk instance may be used where |
| `auth/profile-visibility.ts` | Which profile fields each audience (self, staff, later other members) may see (pure) |
| `navigation.ts` | Which links the header, mobile menu, footer and account menu show, for visitors and per permission (pure) |
| `dashboard/` | The Dashboard's logic: `focus` (what is relevant to this person), `attention` + `providers` ("Needs your attention"), `coming-up`, `repertoire`, `sheet-gaps`, `new-sheet-music` and `people` (pure); `load.ts` does the reads (server-only) |
| `availability/` | Availability: `occurrences` (which services happen), `effective` (normal + exception = effective, the one rule), `board`, `summary`, `range`, `access` (who is on the board, whose records someone may change), `forms`, `format` (pure); `store.ts` and `load.ts` (server-only) |

**`src/components/song-list`, the main pieces:** `SongListView` (the interactive page),
`NextServiceSpotlight`, `ServiceCard`, `MonthTabs`, `SongSearch`/`KeySearch`, `PdfLink`,
`ShareButton`/`ShareBar`/`share-actions` (sharing), `SongListPdf` (the PDF layout), and
`active-month` (keeps the PDF button in step with the open tab).

Content, configuration, presentation and integrations are kept apart. Most pages are Server Components. Only the interactive parts run in the browser: the header's mobile menu, the song list, the archive and the contact form.

---

## How it works

### The song list

```
Google Sheet  ──►  lib/google-sheets.ts  ──►  lib/song-list.ts  ──►  the page
                   (read-only fetch)          (grid → services)
```

- **Two requests**, both cached for 10 seconds (`siteConfig.songList.revalidateSeconds`):
  1. **Sheet metadata** (`fields=sheets.properties(title,index,hidden)`). Tabs are sorted by position. The **first two visible tabs** are the schedule (`maxMonths`). Hidden tabs are read only for song history.
  2. **Cell values** (`values:batchGet`, `FORMATTED_VALUE`), so formulas like `IMPORTRANGE` arrive already worked out.
- **Why the API and not a CSV export:** the workbook holds all twelve months, and only the current ones are visible. CSV and `gviz` exports include hidden tabs and don't say which are hidden. Only the Sheets API does.
- **The sheet's layout:** row 1 is a heading, then repeating groups of a date row followed by its songs, in two side-by-side blocks (columns `A–C` and `E–G`). A date row has `AM` or `PM` in the number column, which names the service and, with `siteConfig.songList.serviceTimes`, gives its start time.
  - If the layout ever stops matching, the page shows the sheet as a plain table rather than nothing.
- **Freshness:** a sheet edit reaches the site within about 10–20 seconds, with no rebuild or redeploy.
- **Failure:** `getSongList()` never throws. An outage or missing key shows an error message that still links to the spreadsheet.

### Next and Now

Every service is an exact moment in Arizona time (UTC−7 all year), so the markers are right for visitors anywhere. The browser keeps its own clock (`components/song-list/use-now.ts`):
- A service is **Next** right up to its start time.
- It's then **Now** for 90 minutes, while Next moves on to the following service.

No reload is needed. The page opens on whichever month tab holds the next service.

### Song history and the archive

The sheet only keeps a rolling twelve months, so every past service is also saved to a **Neon Postgres** database by a nightly Vercel Cron job (`vercel.json` → `/api/cron/sync-archive`, 3 AM Arizona time).

- **Fresh for 30 days:** a recent service can still be corrected in the sheet, and the sheet's version wins.
- **Frozen after that:** reusing a tab for next year never changes last year's record.
- **Always up to date:** pages combine the database with the sheet, so the history is current even before the nightly run. Without a database, the site falls back to the sheet's twelve months.
- **Where it's used:** `/song-list/archive` is the searchable archive, and every song has a page at `/library/songs/<song>` (address from `songSlug()`). The hints under upcoming songs ("Last sung 3 weeks ago") come from the same history.
  - "First time ever / this year" hints are switched off (`showFirstTimeHints: false`) until the records, which start in October 2025, go back far enough to be trustworthy.
- **"Often sung with":** a song's page lists up to three songs it is habitually paired with (`buildCompanions()` in `lib/song-history.ts`). A pair only counts when it was sung together at least 3 times, and in at least a third of the services where either song was sung, so a hymn that's simply sung a lot doesn't look paired with everything. Most songs have no such partner and show no section at all. Tune the rule with `siteConfig.songList.pairings`.
- **Quarterly report:** on January 1, April 1, July 1 and October 1 at 7 AM Arizona time, a Vercel Cron job (`/api/cron/quarterly-report`) emails a report on the quarter just ended to `siteConfig.mail.to` only. It is kept short. First come four totals compared with the quarter before. Next is **Before you plan**: close repeats already scheduled, songs due to come back, forgotten favourites, and songs sung this time last year but not since. Last is a brief **Looking back**: a chart of variety by quarter, most sung, new songs, habitual pairs, and a bar chart of keys. Charts are HTML tables, since mail apps strip scripts and SVG, and every bar carries its value. Lists are capped at five songs (eight for the season ahead), sections with nothing to say are left out, and it uses the site's fonts and colours, including its dark theme where the mail app allows. The figures are in `lib/quarterly-report.ts`, the email layout in `lib/quarterly-report-email.ts`, and its thresholds are constants at the top of the first.
  - Christmas songs follow the church rule: sung only from the first service after Thanksgiving to Christmas Day (`lib/church-calendar.ts`). A Christmas song is detected from the records as one only ever sung in that season. Christmas songs are never called due, forgotten or overused, get their own list when the coming quarter holds Christmas, and are flagged if scheduled before the season.
  - It is sent at most once per quarter (recorded in a `report_log` table), and only from production.
  - To see it without sending, run `curl -H "Authorization: Bearer <CRON_SECRET>" "http://localhost:3000/api/cron/quarterly-report?preview=1&at=2026-10-01" > report.html`. `at` shows it as it would be sent that day. `?force=1` (with `&at=` if wanted) sends a test copy now, subject marked "[Test]". It is never recorded as sent, so the scheduled email still goes out.
- **Links:** every song title, on the schedule, in the archive and on the year pages, links to its song page, with a faint dotted gold underline so it reads as a link (`SongLink` / `songLinkClasses`). The song page also shows the song's sheet music (see [Sheet music](#sheet-music)).
- **Alerts:** if a nightly run fails, or finds no past services (usually a sheet layout change), an email goes to `siteConfig.songList.alertEmail`. That happens in production only.

### The year in song

`/song-list/year/<year>` sums up one year from the same history as the archive (`getYearRecapData()` in `lib/song-archive.ts` → `buildYearRecap()` in `lib/year-recap.ts`, which is pure and tested). `/song-list/year` redirects to the latest year with songs.

- **What it shows:** the year in one sentence, the ten most sung songs, songs per month, keys by use, morning and evening favourites, the song that came back after the longest gap (measured across years), the year's first song, the busiest month(s), and the songs sung only once.
- **Partial years:** the current year reads "So far in 2026". 2025 reads "Since our records began in October 2025". Months before the records or still to come show a dashed stub, not a zero.
- **Charts** are plain HTML and CSS in the site's gold, with hover tooltips and a screen-reader table for the monthly figures. There's no chart library.
- Linked from the archive page and the bottom of the song list. The current year is in the sitemap.

### The printable PDF

The **PDF** button opens the open month as a PDF in a new tab (`/song-list/pdf/september`). The browser's own PDF viewer then handles printing and downloading, so it comes out the same on every device, phones included. That's why it replaced printing the web page directly.

- **Layout** (`components/song-list/SongListPdf.tsx`) mirrors the spreadsheet's own printout: the whole month, two columns reading down, on **one Letter page**.
- **Fitting** (`lib/song-list-pdf.ts`): it measures real title widths to predict wrapping, picks the tallest rows that still fit, and balances the columns.
  - A service is never split. An unusually long month moves whole services onto a second page rather than cutting any off.
- **Nothing live** is printed: no Next/Now, no hints, no search filter.
- Built on request from the sheet, so it's as fresh as the page.

### Sharing services

Each service card has a **share** button. **Select** (just above the cards) lets you tick **up to three** services and share them together from a bar at the bottom of the screen.
- At three, the other cards grey out, and tapping one explains the limit.
- The limit is `MAX_SHARED_SERVICES` in `lib/share-services.ts`, used by both the page and the picture.

**Two formats:**

| As text (`lib/share-services.ts`) | As a picture (`lib/service-picture.tsx`) |
|---|---|
| Readable right in the message, with nothing to open. | The site's look: gold rule, serif date, hymn numbers and key badges. |
| `Sunday Morning · Sept 27 · 10:30 AM`, then one line per song (`#114  The Great Physician – Eb`, or `–` for songs without a number), then the link to the song list. | Always one column, phone-shaped. One service is roomy (1080 × ~1190). Two or three use a compact version, so three still fit one phone screen (≤ 1080 × 2340). Sent together with the link to the song list. |

**What each device offers:**
- **Phone:** *Send as picture* or *Send as text*, each opening the phone's share sheet.
- **Computer:** *Copy picture*, *Save picture*, *Copy text*, *Email*, and *More options…* (the system share panel). The picture comes first because it's what people share most.

Phones only allow a share right after a tap, so the picture is fetched as soon as the menu opens and is ready by the time it's chosen.

> The share sheet and clipboard only work on **HTTPS** (or `localhost`). Opening the dev server from a phone at `http://192.168.x.x:3000` shows the Copy/Email fallback instead, which is expected.

### The contact form

```
visitor → /contact → POST /api/contact → BotID → honeypot → Zod validation → Resend → contact@faithfulwordmusic.com
```

- **Validation:** the same Zod schema checks the form in the browser and again on the server.
- **Addressing:** email is sent **from** the site's verified address, **to** the ministry inbox, with **Reply-To** set to the visitor, so pressing Reply answers them directly.
- **Status codes:** `200` sent · `400` invalid · `403` blocked by BotID · `502` Resend rejected it · `503` not configured. Responses never include stack traces, and message contents are never logged.

**Spam protection:** three layers, none of which asks the visitor to do anything.
1. **Vercel BotID:** an invisible browser challenge, checked on the server with `checkBotId()`.
   - The protected routes are listed in `src/instrumentation-client.ts` and must match the API route.
   - `withBotId()` in `next.config.ts` serves the challenge from this domain, so ad-blockers can't drop it.
   - A blocked visitor is shown the email address, so a false positive still has a way through.
   - Under `next dev` it always passes. To test the rejection path, temporarily pass `developmentOptions: { bypass: "BAD-BOT" }`.
2. **A honeypot field:** if a bot fills it in, the form returns `200` and sends nothing, so the bot can't tell it was caught.
3. **A firewall rate limit,** set in the Vercel dashboard rather than in code (an in-memory limit wouldn't hold across serverless instances):
   - **Firewall → Configure → New Rule:** Request Path equals `/api/contact` **and** Method equals `POST` → **Rate Limit**, Fixed Window, `600s`, `10` requests, keyed on IP.
   - Leave the exceeded-action on **Log** for the first week, then switch it to **Deny**.

### Sheet music

Song pages show what the private **Sheet Music Index** (a Google Sheet, ID in `siteConfig.sheetMusic`) knows about a song, and its sheet music when it may be shared. The files themselves stay in private Google Drive.

```
Sheet Music Index (private) ─┐                          ┌─> song page: details + sheet-music buttons
                             ├─ service account ─> server ┤
Google Drive (private) ──────┘   (read-only)             └─> /library/songs/<song>/sheet-music/<file>
                                                             after canAccessFile() says yes
```

- **The Drive folders are the file index.** The server lists everything shared with the service account, in about 5 requests at most every 10 seconds, and only when someone visits (never per page view), and reads each file's folder and name. Adding sheet music means dropping a file into a folder one of the sheet music types uses. Nobody types file IDs anywhere.
- **Which type a file is** comes only from the types' **source folders**, set under Admin → Configuration (see "Sheet music types" below). No folder layout is assumed. The defaults point at today's layout:

  ```
  Standard            each hymnal's (and Psalms', Other Songs') Standard folder,   and 03 - Ensemble & Classical
  Standard (Chords)   each Chords › Standard folder in 01 - Congregational
  Capo (Chords)       each Chords › Capo folder in 01 - Congregational
  ```

  Anything no source holds (`90 - Reference/…`, say) never appears. A file's **collection** is the nearest folder above it named like a Collection on the Songs tab, at any depth.

  Filenames work like this:
  - **Numbered:** `121 - Like a River Glorious.pdf`. `121 Title` and `014 - Title` also work.
  - **Unnumbered:** `Psalm 54.mscz`.
  - **Versions:** a trailing ` (2)` marks version 2; no number means version 1.
  - **Notes:** other bracketed notes such as `(Stedfast Baptist Church)` are ignored.
  - **Drafts:** anything containing `IN PROGRESS` is skipped.
  - **Duplicates:** when the same file exists twice, the most recently changed copy wins.
  - **Where it lives:** `readSheetMusic()` and `classify()` in `lib/sheet-music.ts`, and `listDrive()` in `lib/sheet-music-index.ts`.
- **The Index (Sheet Music Index sheet):**
  - **Songs** has one row per song, keyed by **Song ID** (`SSSH1989-233`). It holds the details and the rights. A file joins its song by Collection (the folder name) + Hymn Number, or, without a number, by a title only one song in that collection has. Bracketed notes and punctuation are ignored when matching titles.
  - A file whose song has no Songs row is left out, since there's no rights decision for it.
  - **Versions** (older name: **Editions**) is optional. A row only adds a key or capo fret to one version of one type; its **Variant** column takes the type's name (e.g. `Capo (Chords)`; the older `Standard`, `Chords` and `Capo` still work). It never has to exist.
  - Columns are found by header name, and blank or placeholder cells (`?`) are ignored.
  - The Files tab is no longer read. **Notes**, **Migration** and **References** never are.
- **Matching a page to the Index:** a numbered song is looked up by its number in `siteConfig.sheetMusic.hymnalCollection` (Soul-Stirring Songs and Hymns 1989). An unnumbered song (a Psalm or an insert) is matched by title, but only when exactly one Index song has that title; an ambiguous title shows nothing rather than the wrong music. Pages still only exist for songs that have been sung or scheduled. Once a song gets a page, its Index entry appears automatically.
- **Public details vs. protected files:** every matched song shows its details (composer, words, key, collection…), leaving out blank fields. The files are a separate question, answered by `canAccessFile()` in `lib/sheet-music-access.ts`.
- **Rights:** a song's files are **public only when `Copyrighted?` is exactly `No`**. `Yes`, `Needs Review`, a blank or any other value keeps them from the public. **Signed-in members can open every file**, copyrighted or not, if their roles include **View member sheet music** (the Member role has it by default, so that means every account; change it under Admin → Roles).
- **Enforced on the server:** the file route runs `canAccessFile()` itself before touching Drive. A restricted file returns `403` even if someone types its address.
- **PDF first, MuseScore second:** a PDF gets the main **View PDF** button and, on larger screens, an inline preview. It is served `inline`. A MuseScore file gets a secondary **Download MuseScore** button and is sent as the untouched original `.mscz`.
  - The format comes from the file's `.pdf` / `.mscz` extension. Drive's MIME type is ignored, because Drive often reports `.mscz` files (zip containers) as zip archives.
- **What reaches the browser:** file addresses use a slug (`standard-1.pdf`, `capo-2-guitar.mscz`), never a Drive File ID. The Drive IDs, notes and paths stay on the server.
- **Freshness:** the Drive listing and the Index are cached together for `siteConfig.sheetMusic.revalidateSeconds` (10 seconds), so a new file shows up within about 10-20 seconds. Served files are cached at the CDN for the same time, so making a song private again takes effect about as quickly.
- **Without credentials:** the song pages work as before with no sheet-music section, and the file route returns `503 {"reason":"not-configured"}`.
- **Members-only files:** song pages stay cached and identical for everyone. Copyrighted files are listed with "Members only · Log in"; in the browser, `MemberSheetMusic` asks `/api/account/me` whether the visitor may see them and unlocks the buttons and the preview. The file route decides for itself: a public file needs no session; any other needs a signed-in member with the permission (`401` signed out, `403` without access), and is sent `Cache-Control: private, no-store` so no shared cache ever keeps it.

### Member accounts

Invite-only accounts for the musicians and song leaders. The public site doesn't change: nothing public needs a login, and **Log In** isn't in the main navigation. It lives in the footer ("Have an account? **Log in!**").

**Who owns what:**
- **Clerk** owns *who someone is*: sign-in, sessions, passwords, email verification, invitations, bans, names, email addresses and profile photos.
- **This site** owns *what they may do*, plus their music profile. That's roles, permissions, account requests, titles, instruments and profile answers, all in the existing Neon database. Rows are keyed by Clerk user ID. Clerk data is read from Clerk, never copied.

```
request:  /request-access → POST /api/account-requests → BotID → honeypot → Zod → row (pending) → Resend email to the ministry
approve:  /admin/requests/<id> → claim row (pending→invited) → Clerk invitation email → /accept-invite?__clerk_ticket=… → account
          (if Clerk refuses, the claim is released: the request is pending again and nothing was sent)
invite:   /admin/invitations → Clerk invitation directly (no request needed)
```

**Roles at invitation time:** when inviting someone, or approving their request, you can tick the roles they should have (Musician, Song Leader…). They're stored with the invitation (`invitation_roles`) and given automatically the first time the new account is used, matched on the verified email the invitation went to. Choosing roles follows the same rules as assigning them on a person's page: it needs Manage roles, and only administrators can hand out Administrator. Revoking the invitation discards them.

**Request lifecycle:**
- **pending:** waiting for review. It can stay pending indefinitely.
- **invited:** approved, and the invitation has been sent.
- **active:** the invitation was accepted.
- **rejected:** declined by an administrator.
- **revoked / expired:** the invitation was withdrawn, or ran out before it was used.

"Invited" is brought up to date from Clerk whenever the requests are viewed, so no webhook is needed.

**Privacy of the request form:** the reply is identical whether the address is new, already has an account, already has an invitation, or already has a pending request. Nobody can use the form to find out who has an account. Duplicates are dropped silently (a unique index backs this up), and no email goes out for them. The notification email only links to the review page. It can't approve, decline or change anything.

**Roles and permissions** (`src/lib/auth/permissions.ts`):
- **Permissions are defined in code**, because each one guards a piece of code. For example, `manage_users` guards requests, invitations, disabling and deleting.
- **Roles are data.** The site starts with Administrator, Music Director, Song Leader, Musician and Member. In `/admin/roles` you can change what each role allows or create new roles. Administrator is locked to every permission. Member is held by everyone signed in.
- **People can hold several roles**, and their permissions add up. The actual music director should hold *both* Administrator (accounts and site) and Music Director (music).
- **Per-person exceptions** grant or deny one permission on top of someone's roles, from their page under **People**.
- **Effective permissions** = every role's permissions + grants − denies. An administrator can never be denied `manage_users` or `manage_roles`, so nobody can be locked out by mistake.
- **Escalation guards:**
  - Nobody can change their own exceptions. Only administrators can change their own roles (they already hold every permission), and nobody can remove their own Administrator role.
  - Only administrators can give, remove or disable the Administrator role.
  - Nobody can grant a permission they don't hold.
  - The last administrator can't be removed.

**Profiles:**
- **Owners:** Clerk holds the first name, last name and photo. The site holds the middle name, preferred name, bio, phone, voice part, usual services and instruments (each with a skill level and a primary).
- **Questions:** everyone answers "Can you read sheet music?" and gives a music-theory level. **Musicians** also answer **How do you play?** (a five-stop By ear ↔ Sheet music scale).
- **Titles** (Pianist, Organist…) are assigned by administrators. The title and instrument lists are edited under **Admin → Configuration**. An item still in use is archived, not deleted.
- **Visibility:** a profile is visible to its owner and to anyone with `view_profiles`, which by default is only Administrator. (Normal services are also seen by the music team on the [availability board](#availability).)
- **Usual services** are shown on the profile but edited on `/availability`. The profile form never writes them, so saving it can't wipe them.

**Security model:**
- **Every protected page and every server action checks, on the server:**
  - the Clerk session is verified;
  - the user ID is resolved to this site's roles for this Clerk instance;
  - the permission is checked;
  - the input is validated;
  - and only then does the action run.
  This all goes through `src/lib/auth/session.ts`.
- **Things that are never trusted:** hidden buttons, the header menu, the proxy and the admin layout. The header's "Admin" link is only a convenience.
- **The proxy** (`src/proxy.ts`) only sends signed-out visitors on `/dashboard`, `/availability`, `/profile`, `/account` and `/admin` to `/login?redirect_url=…`, so they come back afterwards, and sends signed-in visitors on `/` to `/dashboard`. It doesn't run on any other public page, so they stay static and cached.

**One database, two Clerk instances:**
- Local, Preview and Production share one Neon database, but Clerk Development and Production have separate users.
- Every account row therefore carries `clerk_env` (`development`/`production`), derived from the key prefix, and every query filters on it.
- Test users and test requests never appear in the production admin.

**When accounts are off:** if the Clerk keys are missing, or they're wrong for the environment (test keys on Production, live keys anywhere else, a mismatched pair), accounts switch off. The public site carries on unchanged, the account pages fail closed with "Accounts are temporarily unavailable", and the reason is logged once as `[auth] Accounts are disabled: …`. The log never includes key values.

The tables are created on first use, like the song archive's: see `src/lib/auth/schema.mjs`.

### The signed-in experience

The site is two experiences on one codebase:
- **The public site** is the ministry's front door: home page, song list, Library, contact. Static and cached, the same for everyone.
- **The signed-in application** is a working space for the music ministry. Its home is the **Dashboard**.

**Four places, four jobs:**

| Page | Answers | Owner |
|---|---|---|
| `/dashboard` | What do I need to know and do? What is coming up? | Built from current data |
| `/profile` | Who am I in the ministry? (names, photo, bio, titles, instruments, music answers) | The site, plus name and photo from Clerk |
| `/account` | How do I sign in? (email, password, devices). Later: account-wide settings such as notifications and profile privacy | Clerk |
| `/admin` | Running the ministry's accounts | The site |

Editing happens on the page being edited (the **Edit profile** button on `/profile`), never from a menu.

**Signed-in people never see the public home page.** The proxy redirects `/` to `/dashboard` when there is a session, and the logo links to the Dashboard. The home page itself never reads the session, so it stays prerendered (ISR) for visitors.

**Logging in:**
- **Returning members** logging in with no page to return to (e.g. the footer's **Log in!**) land on `/dashboard` (`signInFallbackRedirectUrl` in `layout.tsx`).
- **New members**, straight after creating their account from an invitation, land on `/profile/edit?welcome=1` (`signUpFallbackRedirectUrl`): the profile form introduced as "Set up your profile", where saving or skipping carries on to the Dashboard.
- Sent to log in from a members' page, they arrive with `?redirect_url=…` and go back to that page, which always wins over the fallback.
- Logging out goes to the public home page.

**Navigation** (`src/lib/navigation.ts`, one place for every menu):
- Visitors: Home, Song List, Library, Contact.
- Signed in: **Dashboard** takes Home's place, then **Availability** for the music ministry's participants (`view_availability`, never Member-only accounts), and the public music pages stay.
- The avatar menu holds Dashboard, Profile, Account settings, Admin (only with an admin permission) and Log out. On phones the avatar stays in the header bar; the full-screen menu shows the same main links as the desktop bar. The bar gives way to the menu below 1024px (`lg`), so the links never wrap.
- A new destination is one entry in `APP_NAV` (or `ACCOUNT_MENU`) with the `permission` that opens it. Nothing unfinished is listed.

**Why the header finds out in the browser:** public pages are static, so they can't know who is looking. `AccountProvider` (`components/account/AccountContext.tsx`) reads the Clerk session in the browser and asks `/api/account/me` once for the person's own permissions. The header, footer, search and members' sheet music all share that one answer. A signed-in person briefly sees the visitor's links on a static page until Clerk loads; that is the price of keeping the public site static. **Showing a link is never the protection**: every page, file and action checks permissions again on the server.

**How the Dashboard decides what to show:**

| Source | Decides | Example |
|---|---|---|
| **Permissions** | What may be shown or linked (security) | Members-only sheet music is linked only with `view_sheet_music`; account requests appear only with `manage_users` |
| **Roles** | Broad responsibilities | Musician and Song Leader mean the service music matters to them |
| **Titles, instruments** | What is most relevant | Each person's sheet music comes from their assigned sheet music types (e.g. Capo (Chords), then Standard (Chords)). A title never grants anything |
| **Current data** | What appears at all | No "0 requests", no empty cards, no placeholders for future features |

- These come together in one `DashboardFocus` (`lib/dashboard/focus.ts`). Capabilities are read from permissions, never role names, so a custom role with the right permission gets the same Dashboard.
- Someone with several responsibilities (say Administrator, Music Director and Pianist) gets **one** page: each section draws on the parts of the focus it needs, and attention items are de-duplicated by id.
- **Sections**, in this order for everyone (absent sections are skipped): things to do, this week, availability, preparing, what changed, the wider picture. Each is shown only when it has something real to say, except Availability, which is always there for the people it applies to.

  | Section | Who sees it | What it shows |
  |---|---|---|
  | **Needs your attention** | Everyone (items by permission) | An unfinished profile; account requests waiting and invitations unanswered after a week or recently expired (`manage_users`); upcoming songs with sheet-music gaps and musicians with no sheet music type (`manage_sheet_music`); musicians who list no instrument (`view_profiles`); no normal services set (`view_availability`, low priority) |
  | **Coming up** | Everyone | The next services (up to three within a week). Someone with assigned sheet music types gets each service's sheet music as one PDF to print, using for each song the first of their types it has. With more than one type, each song names the type used and links their other types it has; a song with none of their types says so |
  | **Availability** | `view_availability` | Always present, kept short: their normal services, the next service and their state for it, their upcoming exceptions, other people's changes in the next two weeks, and **View availability** |
  | **Songs to brush up on** | People who play or lead | Songs in the next two weeks not sung for six months, or not in the records at all |
  | **Sheet music to finish** | `manage_sheet_music` | Songs in the next three services (never further ahead, however much of the month is planned) with no Index entry, no files, no sheet music of the first type (Standard by default), sheet music with MuseScore but no PDF, or rights still to review |
  | **New sheet music** | Everyone, among files they may open | Songs whose files changed in Drive in the last two weeks, upcoming first |
  | **People** | The admin People permissions | Musicians (with their sheet music type, for `manage_sheet_music`), song leaders and people with no role beyond Member, each linking to their admin page |
  | **Quarter at a glance** | `view_analytics` | Services, different songs and the most sung so far this quarter (or the quarter just ended, before the new one's first service) |

- **Sheet music types are assigned, never guessed.** Two people on the same instrument can need different sheet music, so each person's types are chosen on their page under **Admin → People** by anyone with `manage_sheet_music`, in order of preference. A guitarist might have **Capo (Chords)**, then **Standard (Chords)** for songs that need no capo. Each song uses the first of their types that has a PDF they may open (a MuseScore-only file doesn't count); one with none of them shows as unavailable, never as another type. The order only chooses what is shown and never restricts access. No types means no sheet music. Types live in `user_sheet_music_types`; the older one-type `user_sheet_music` was copied in once, and still mirrors each person's first choice for older deployments sharing the database.
- **Types come from source folders, not folder layout.**
  - The types (defaults: Standard, Standard (Chords), Capo (Chords)) are named, ordered and given their **source folders** under **Admin → Configuration**.
  - Every type works the same way: it's a list of folders, each picked by browsing the Drive "Sheet Music" folder (**+ Add folder**) and removed with ×. A type takes every PDF and MuseScore file in its folders and the folders inside them, so you never pick a PDF or MuseScore folder. How the folders are laid out is never assumed.
  - If one type's folder sits inside another type's folder, the files go to the type whose folder is closest to them, then to the type higher in the list.
  - Files in no type's folders don't appear on the site. When you add a new hymnal or instrument folder in Drive, add it to the right type.
  - The three starting types are seeded as "every `Chords › Capo` folder inside `01 - Congregational`" and so on. The first visit to Configuration turns these into the actual folders (`expandSheetMusicSources`), after which they're plain folder lists like any other type.
  - A file's song comes from its name (number, title) and the nearest collection-named folder above it.
  - Song pages, the Dashboard and download names all use the type names. The Versions tab's "Variant" column takes a type name (older names like "Capo" still work).
  - Stored in `sheet_music_types`, `sheet_music_type_sources` and `user_sheet_music`. The logic is `classify` in `src/lib/sheet-music.ts` and `src/lib/sheet-music-type.ts`.

- The logic is in `lib/dashboard/` (pure, tested); the reads are in `lib/dashboard/load.ts`, each failing soft so one source being down never takes the page with it.

**Adding a feature to the signed-in application** (Service Planner, Notifications…; Availability followed these steps):
1. Its route, protected by `requireViewer()` and its own permission (added to `permissions.ts` when something checks it), and added to the proxy matcher.
2. A nav entry in `lib/navigation.ts` gated on that permission.
3. If it can need action, an attention provider in `lib/dashboard/providers.ts` returning `AttentionItem`s (nothing when there is nothing to do).
4. If it belongs on the Dashboard, its data loaded in `app/dashboard/page.tsx` (failing soft) and a section shown only when the focus and data call for it.

**Profiles are built to be shown to other members later.**
- `lib/auth/profile-visibility.ts` classifies every profile field by audience:
  - `self`, the owner;
  - `staff`, holders of `view_profiles`;
  - `members`, other signed-in members (not reachable yet).
- Pages filter with `visibleProfile()` on the server, so a hidden field never reaches the browser, and `ProfileView` renders what it is given.
- **Member profiles, when built:**
  - Live at `/people` and `/people/<id>` (`/profile` always means "mine").
  - Get their own permission, returned as the `members` audience from `audienceFor()`.
  - Any "show my profile to members" choice belongs on `/account`.

#### Installing the app

Signed-in members can install the site as the **Faithful Word Music** app. It opens in its own window, with no browser bar, at `/`, which the proxy sends on to the Dashboard.

**Where it's offered:** only to signed-in members, and only on a device that can install and isn't already running the app:
- **Account settings** (`/account`) has an **Install the app** section above Clerk's screen. It's the permanent home.
- The **Dashboard** shows an **Install Faithful Word Music** card under the greeting. **Not now** hides it on that device (`localStorage`). Account settings still has it.
- Wherever there's no button to press (older phones, Firefox), Account settings shows **Using an older phone?**, which explains installing from the browser's own menu. The Dashboard card only appears where there's something to press.
- Visitors who aren't signed in see nothing. The site doesn't stop anyone installing from the browser's own menu; it just never advertises it to them.

| Platform | How it installs | What the member sees |
|---|---|---|
| Chrome, Edge, Samsung Internet (Android, Windows, macOS, ChromeOS, Linux) | The browser's `beforeinstallprompt` event | **Install Faithful Word Music** opens the browser's own install dialog |
| iPhone and iPad (Safari, and Chrome, Edge or Firefox on iOS 16.4+) | Share → **Add to Home Screen**. No browser there can be asked to install | The same button shows the steps |
| iPhone and iPad in Chrome, Edge or Firefox before iOS 16.4, or inside an app (Facebook, Instagram) | Only Safari can add to the Home Screen | The button explains opening the page in Safari first |
| Safari 17+ on a Mac | File → **Add to Dock** | The same button shows the steps |
| Older Chrome, Firefox, other browsers | No install event (older Chrome only fired it for sites with a service worker) | No button; Account settings explains the browser menu's **Install app** / **Add to Home screen** |
| Already running as the app | | Nothing |

**How it fits together:**
- `app/manifest.ts` is the web app manifest:
  - name and short name are both `siteConfig.name`;
  - `display: standalone`, start and scope `/`, paper as the theme and background colour.
- The icons are drawn from `app/icon.svg` by `renderAppIcon` in `lib/og.tsx`, so they follow the logo:
  - `app/app-icon/[variant]/route.tsx` serves 192, 512 and a maskable 512 for Android's shapes;
  - `app/apple-icon.tsx` is the 180px Home Screen icon.
  - All of them are built at build time and served as static files.
- `appleWebApp` in `app/layout.tsx` makes an iOS Home Screen icon open full-screen under the full name.
- `lib/install.ts` holds:
  - `installPromptCaptureScript`, which runs in `<head>` before React. It keeps Chromium's install event for the button, because the event can fire before hydration. Its `preventDefault()` also stops Chrome on Android offering its own install bar to every visitor.
  - `detectInstallMode`, the platform rules above, tested in `install.test.ts`.
- `components/account/InstallApp.tsx` renders the section and the card.

**Inside the installed app on a phone or tablet** there's no browser around the site, so `components/app/InstalledApp.tsx` adds two things a browser would otherwise give. The pure parts are in `lib/installed-app.ts`. In a browser, and in the desktop app, it renders nothing and listens to nothing.
- **A PDF viewer.** Every link to one of the site's PDFs (sheet-music files, a service's sheet music, a month's song list) opens `PdfViewer` instead of a "new tab". On an iPhone that tab otherwise fills the app with no Close button and no way to save. The viewer has Close, the file's name, and **Save or share**: the share sheet on iPhone (Save to Files, Print, other apps), or **Download** plus **Share** elsewhere. The file is fetched once with PDF.js (`components/ui/pdfjs.ts`, shared with the song pages' preview). Pages are drawn only near the view, so long service packets stay light on older phones.
- **Pull to refresh.** Pull down at the top of a page and let go past the line to reload. It's off while a menu, dialog or the PDF viewer is open, and when the part being touched is scrolled.

**No service worker.** Chromium no longer needs one to install a site, and Safari never did. Offline use, caching and notifications are a later phase. Adding a service worker then doesn't change any of the above.

### Availability

**One question:** is this person available for this *whole* service, compared with their normal schedule? Set your normal services once, then only record what changes. In a normal week nobody does anything. It is not a rota, a staffing tool or a scheduler: an unavailable organist just means no organ.

**Who it is for.** The music ministry's participants, by permission, never by role name:

| Permission | Default roles | Can |
|---|---|---|
| `view_availability` | Musician, Song Leader, Music Director | Appear on the board, see everyone's changes, keep their own normal services and exceptions |
| `manage_availability` | Music Director | Also change anyone else's, on their behalf |

- Member-only accounts get neither: no nav link, no Dashboard section, and `/availability` shows "no access".
- **The board (roster)** is everyone holding `view_availability` through a role or an individual grant, minus denies (`availabilityRosterIds` in `lib/availability/access.ts`). The Administrator role's blanket "every permission" lets an admin open and manage the board, but doesn't list them on it unless they also hold a music role.
- The Music Director is on the board like anyone else and manages their own availability the same way. Managing other people's is a separate permission.
- Existing databases get the new permissions once: `PERMISSION_FIXUPS` in `permissions.ts`, recorded in `schema_fixups`, so an admin who later removes one doesn't see it come back.

**The model:**
- **Normal services** stay where they always were, in `user_profiles.service_availability` (Sunday AM, Sunday PM, Wednesday PM, special services). Existing answers carried over untouched. They're edited only on `/availability` (the Profile shows them read-only, with a link).
- **Exceptions** (`availability_exceptions`) are one row per person per service: `(service_date, slot)`, the same identity the song archive uses, with status `available` or `unavailable` and an optional note. Only real differences are stored: choosing **Normal**, or choosing what the normal pattern already says, deletes the row. Nothing is generated per week, and past rows simply stop mattering.
- **Effective availability** = normal + exception, worked out in one place: `effectiveAvailability()` in `lib/availability/effective.ts`. It returns the normal and effective states, the exception, and one of *normally available*, *normally unavailable*, *available by exception* or *unavailable by exception*. The calendar and the Dashboard use it, and later the Service Planner and member profiles will too.
- **Services** come from `siteConfig.songList.regularServices` for any date range (`lib/availability/occurrences.ts`). A dated song-list service on a day or time that isn't a regular service becomes a **special** service, matched against the "Special services" normal choice. Nothing here creates events.
- **Date ranges** ("away October 15–22") are only a way of entering changes. A range becomes every service in it that hasn't started, each stored as its own exception. The range itself isn't stored.
- **Whole services only.** There are no times, partial services or songs anywhere in the model or the forms.

**The page** (`/availability`, with `?month=YYYY-MM`, `?view=me`, and `?person=<id>` for leaders):
- **md and wider:** a month grid where only service days carry anything. Each service shows your own state: quiet when normal, a gold + for available by exception, a struck-through × for unavailable by exception. Under **Everyone** it also shows a count of people who differ from normal. **Phones:** the same services as an agenda list.
- **Choosing a service** opens a dialog with just **Available** or **Unavailable**, the one matching your normal services marked "Your usual". Whether it is an exception follows from the normal services: choosing the usual one clears any exception. Then an optional note (labelled as visible to the whole music team), who differs from normal, and who is expected. Services that have started are read-only.
- **Report a date range** marks every service in a range Available or Unavailable, or **Clear changes** removes the range's exceptions. **Normal services** and **Upcoming changes** sit beside the calendar. Under **Me**, Upcoming changes lists your own, each removable; under **Everyone**, it lists the ministry's next eight.
- **Leaders** get a **Managing** picker. Everything on the page then applies to that person, with a banner saying so.

**Security:** every change goes through `src/app/availability/actions.ts`, wrapped in `withPermission("view_availability")`. Whose record it is comes from `availabilityTarget()`: your own always comes from the session, and anyone else's needs `manage_availability` and must be someone on the board. Each service is checked to be real and not yet started. Deleting an account removes the person's exceptions.

**Later:** the Service Planner should ask `effectiveAvailability()` (or build on `buildBoard`) rather than store availability itself. Member profiles can show normal services and upcoming exceptions from the same tables. Notifications, private staff notes and creating special events aren't part of this phase.

---

## Design conventions

- **Design tokens** (colours, fonts, shadows, radius) live in the `@theme` block at the top of `src/app/globals.css`. There's no `tailwind.config.ts` (Tailwind v4 reads its settings from the CSS).
- **Dark mode** redefines those same tokens in the DARK MODE section of `globals.css`, so components never need `dark:` classes. Use the tokens (`bg-surface`, `text-ink`...), never `bg-white` or hex codes, and both themes just work. The site follows the device until a visitor uses the sun/moon button in the header (`components/layout/ThemeToggle.tsx`). Their choice is saved in `localStorage` and applied before the first paint by an inline script in `layout.tsx` (`src/lib/theme.ts`). Choosing the theme the device already uses clears the saved choice. The logo, printing, and everything shared (the PDF, PNG pictures and link previews) always stay light: they use fixed colours, not the tokens.
- **Fonts:** Source Serif 4 for headings and Inter for text, self-hosted by `next/font`. The PDF, pictures and link previews can't use those web fonts, so they use the copies in `assets/fonts/`.
- **Buttons:** use `Button`/`ButtonLink`, or `buttonClasses()` from `src/components/ui/Button.tsx`, so every button looks and behaves the same (gold-border hover, slight press-in). Primary buttons are ink, never gold, because gold text doesn't meet contrast (AA) on the paper background.
- **Motion:** every hover and state change shares one easing, set site-wide in `globals.css` (`--default-transition-duration: 250ms` with the site's ease-out curve). So a plain `transition-colors` already matches everything else; avoid one-off durations.
  - **Page transitions** use React's `<ViewTransition>` through `components/ui/PageTransition.tsx`, placed in each page (not the layout, which never re-mounts).
  - **Page-loading bar** (`components/ui/NavigationProgress.tsx`, in the root layout): a thin gold bar across the top of the window while the next page loads. It appears the moment a link is clicked and stays up for at least 300ms, so even an instant page change gets a short sweep. It ignores `#section` jumps and links that open in a new tab.
  - **Scroll reveal** (`components/ui/Reveal.tsx`) fades content in as it scrolls into view. Anything already on screen when it loads just appears.
  - **Fallbacks:** no View Transitions API means pages swap instantly. With JavaScript off, a `<noscript>` style shows everything. With `prefers-reduced-motion`, all motion is off (enforced in both CSS and JavaScript).
- **Copy** lives in `src/content/`, never inside components, so wording can change without touching layout.

---

## Testing

```bash
npm test
```

Vitest covers the pure logic in `src/lib`:
- reading the sheet (`song-list.test.ts`)
- service times and Next/Now (`service-time.test.ts`)
- song history and the archive (`song-history.test.ts`, `archive-view.test.ts`)
- PDF page fitting (`song-list-pdf.test.ts`)
- the shared text format (`share-services.test.ts`)
- the light/dark choice and its no-flash script (`theme.test.ts`)
- the year in song (`year-recap.test.ts`)
- permissions, navigation per permission, and profile visibility (`auth/permissions.test.ts`, `navigation.test.ts`, `auth/profile-visibility.test.ts`)
- the Dashboard's focus, attention list, coming services and sheet-music choice (`dashboard/dashboard.test.ts`)
- availability: the four effective states, generating services (special ones included), date ranges, the roster and who may change whose records, the board and Dashboard summary, and the forms (`availability/*.test.ts`)

The tests run on **real sheet data** saved in `src/lib/__fixtures__/` (`september-2026.json`, `missions-conference-2025.json`). When the sheet's layout changes, save a fresh copy of the real tab as a fixture and test against that, rather than guessing the layout.

For anything visual (the page, the PDF, the pictures), run `npm run dev` and look:
- `/song-list/pdf/september`
- `/song-list/image/september?s=<id>,<id>` (service ids look like `1-22`)

---

## Deploying to Vercel

### 1. Import the repository
1. Push to GitHub, then in Vercel choose **Add New → Project** and import the repo.
2. The framework (Next.js) is detected automatically. Leave the build settings as the defaults. `vercel.json` only declares the nightly cron job.
3. Add the environment variables **before** the first deploy.

### 2. Environment variables
In **Settings → Environment Variables**, tick **Production, Preview and Development** for each:

```
GOOGLE_SHEETS_API_KEY = <your key>
RESEND_API_KEY        = <your key>
CRON_SECRET           = <a long random string>
```

`DATABASE_URL` is added for you when Neon is connected (see [Song archive](#song-archive)). `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` are described under [Sheet music (service account)](#sheet-music-service-account).

**Except the Clerk keys**, which are added **twice**, with a different value for each environment (see [Accounts (Clerk)](#accounts-clerk)):

```
Production only:            NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = pk_live_…   CLERK_SECRET_KEY = sk_live_…
Preview (and Development):  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = pk_test_…   CLERK_SECRET_KEY = sk_test_…
```

### 3. Domains
In **Settings → Domains**:
1. Add `faithfulwordmusic.com` as the **primary** domain. It must match `siteConfig.url` in `src/config/site.ts`, which canonical URLs, the sitemap and the metadata are built from.
2. Add `www.faithfulwordmusic.com` and accept Vercel's offer to redirect it to the main domain.
3. Create the DNS records Vercel shows you at the domain registrar. Use Vercel's exact values.
4. Wait for each domain to show **Valid Configuration**.

### 4. Check it
- [ ] All pages load, and the song list shows the current month's real data.
- [ ] Editing a sheet cell shows up on a fresh page load within about 10–20 seconds.
- [ ] The **PDF** button opens a one-page PDF.
- [ ] On a phone, **Send as picture** and **Send as text** open the share sheet.
- [ ] A message sent through `/contact` arrives, and **Reply** goes to the visitor.
- [ ] `/sitemap.xml` and `/robots.txt` only list `faithfulwordmusic.com` addresses.
- [ ] The footer says "Have an account? **Log in!**", and `/login` shows the Clerk form (not "Accounts are temporarily unavailable").
- [ ] Vercel Logs have no `[auth] Accounts are disabled` line.

---

## Setup guides

### Google Sheets
The spreadsheet is public and read-only, so a simple API key is enough.

1. In the [Google Cloud console](https://console.cloud.google.com/), create or pick a project.
2. **APIs & Services → Library** → **Google Sheets API** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**, and copy it.
4. **Restrict the key:**
   - Under **API restrictions**, allow **Google Sheets API** only.
   - Leave application restrictions as **None**. The key is only used on the server, where there's no browser address or fixed IP to restrict to.
5. Put it in `.env.local` as `GOOGLE_SHEETS_API_KEY=...`, and add it in Vercel.
6. Make sure the spreadsheet's sharing is **Anyone with the link → Viewer**.
7. Open `/song-list`; it should show the current month.

### Song archive
1. In Vercel, go to **Storage → Create Database → Neon** (free plan) and connect it to this project for all environments. That adds `DATABASE_URL`.
2. Add `CRON_SECRET` (any long random string), then redeploy.
3. For local use, run `npx vercel link`, then `npx vercel env pull .env.local`.
4. Seed it once. The tables create themselves, and running it again is harmless:
   ```bash
   curl -H "Authorization: Bearer <CRON_SECRET>" https://faithfulwordmusic.com/api/cron/sync-archive
   ```
   The response reports how many services were `added`, `refreshed` and `frozen`.
5. From then on it runs nightly. Check **Settings → Cron Jobs**.

### Sheet music (service account)
Unlike the public song list, the Sheet Music Index and the sheet-music Drive folder are **private**. The site reads them as a Google **service account**, a robot Google identity that can only see what is shared with it.

1. **Google Cloud project:** in the [Google Cloud console](https://console.cloud.google.com/), select the same project as the Sheets API key.
2. **Enable the APIs:** go to **APIs & Services → Library** and enable **Google Sheets API** (probably already on) and **Google Drive API**.
3. **Create the service account:**
   - Go to **IAM & Admin → Service Accounts → Create service account**. A name such as `faithful-word-music-website` works.
   - **Skip** "Grant this service account access to project" (no roles) and "Grant users access". It needs no Cloud permissions, only Drive sharing.
4. **Create a key:** open the account, go to **Keys → Add key → Create new key → JSON**, and download the file.
   - It contains `client_email` and `private_key`.
   - Don't commit it, email it or leave it in Downloads. Delete the file once the two values are in Vercel and `.env.local`.
5. **Share the files:** in Google Drive, share the **Sheet Music** folder with the `client_email` address.
   - Set it to **Viewer** and untick **Notify people**.
   - If the Index spreadsheet isn't inside that folder, share it the same way.
   - Don't use "Anyone with the link", and don't enable Domain-Wide Delegation.
   - Leave "Viewers can download" allowed on those files: a service account's download counts as a viewer's.
6. **Set the environment variables** in Vercel (Production, Preview, Development):
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = `client_email`
   - `GOOGLE_PRIVATE_KEY` = `private_key`, including the `-----BEGIN/END PRIVATE KEY-----` lines. Paste it either with real line breaks or with the literal `\n` sequences exactly as the JSON file has them; the code accepts both.
7. **Redeploy**, then open a song page, such as one numbered from the hymnal.

**Troubleshooting** (read the `[sheet-music]` lines in Vercel → Logs):

| Symptom | Meaning | Fix |
|---|---|---|
| No sheet-music section anywhere; file URLs return `503 not-configured` | The two variables aren't reaching the server | Add both for that environment, then redeploy |
| `Google refused the service account credentials (...)` | The key is malformed or was deleted | Re-paste `private_key` with its BEGIN/END lines, or create a new key |
| `Google Sheets responded with 403` | The Index isn't shared with the service account, or the Sheets API is off | Share it (Viewer); enable the API |
| `Google Sheets responded with 400` | The Songs tab is missing or renamed | Restore the tab name "Songs" |
| File URL returns `502`, and the log says `Google Drive responded with 404` | The file was deleted or moved in the last few minutes | Reload after a few seconds; the listing catches up |
| `Google Drive responded with 403` | Downloads are disabled for viewers on that file, or the Drive API is off | Allow viewers to download; enable the API |
| Song page has details but no buttons | The song's `Copyrighted?` isn't `No` | Working as intended: members see the buttons once logged in |
| A song has no sheet-music section | No Index match: the number isn't in the hymnal collection, or the title is ambiguous or spelled differently | Fix the Index's Hymn Number, Collection or Title |
| A file in Drive doesn't show on its song's page | Wrong folder, no number or title match, a missing Songs row, or `IN PROGRESS` in the name | Check the folder, the filename, and that the song has a Songs row with the same Collection and Hymn Number |

### Resend
1. Create an account at [resend.com](https://resend.com).
2. **Domains → Add Domain** → `faithfulwordmusic.com` (the domain of `mail.from` in `src/config/site.ts`).
3. Add the DNS records Resend shows you, then click **Verify**.
4. **API Keys → Create API Key** with sending access. It's shown only once.
5. Put it in `.env.local` as `RESEND_API_KEY=...`, and add it in Vercel.
6. Make sure `contact@faithfulwordmusic.com` is a **real mailbox**. Verifying a domain lets Resend *send* as that address; it doesn't create an inbox.
7. Send a test message through `/contact`, and check that Reply goes to the visitor.

**If the contact form fails,** its status code (in the browser's Network tab, or Vercel → Logs) says which part is wrong:

| Status | Meaning | Fix |
|---|---|---|
| `503` | `RESEND_API_KEY` isn't reaching the server | Add it in Vercel for every environment, then redeploy |
| `502` | Resend refused the message, usually because the domain isn't verified | Read the `[contact]` line in Vercel Logs, then fix it in Resend |
| `400` | A field is empty or invalid | Nothing to fix; the form explains it to the visitor |
| `403` | BotID judged the request automated (normal for `curl`) | If a real visitor hit it, check Vercel → Firewall → BotID |

On a `502`, the log line looks like this:

```
[contact] Resend rejected the message: validation_error (403) - The faithfulwordmusic.com domain is not verified.
```

`validation_error (403)` means verify the domain. `invalid_access (401)` means the key is wrong or revoked.

Don't turn on Resend's "Receiving" feature: it adds mail records that would clash with the existing inbox.

### Accounts (Clerk)

Clerk has two **separate instances** in one application: **Development** and **Production**. They share no users, invitations, sessions or settings. An administrator in one is *not* an administrator in the other.

| Environment | Clerk instance | Keys | Users | Rows tagged |
|---|---|---|---|---|
| Local (`npm run dev`) | Development | `pk_test_` / `sk_test_` in `.env.local` | Test users | `development` |
| Vercel Preview | Development | `pk_test_` / `sk_test_`, Vercel *Preview* scope | The same test users | `development` |
| Vercel Production | Production | `pk_live_` / `sk_live_`, Vercel *Production* scope | Real users | `production` |

The site enforces this table: see `src/lib/auth/clerk-env.ts` and its tests.

#### A. Development instance (local and Preview)
1. **Create the app.** At [dashboard.clerk.com](https://dashboard.clerk.com), create an application named "Faithful Word Music". It starts with a Development instance.
2. **Sign-in methods.** Under **Configure → User & authentication**:
   - Turn on **Email** as an identifier and **Password** as the sign-in method.
   - Leave phone, username and every social provider **off**.
   - Under the name settings, turn on **First and last name** and make them **required**.
   - If the dashboard offers it, turn **off** letting users delete their own accounts. Deletion happens from `/admin`, which also removes the site's data for that person.
3. **Invite-only.** Go to **Configure → User & authentication → Access mode** and choose **Invite-only**, then **Save**. New accounts can then only come from invitations. (Older dashboards called this Restrictions → Sign-up mode → Restricted.)
4. **Paths (optional).** You can skip this. The app passes `/login` and `/accept-invite` to Clerk in code, and the dashboard **Paths** page is only a fallback for Clerk's hosted pages, which this site doesn't use.
5. **Local keys.** Under **Configure → API keys**, with **Development** selected, copy the keys into `.env.local`:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
   CLERK_SECRET_KEY=sk_test_…
   ```
   Restart `npm run dev`. Local URLs need no configuring: a Development instance accepts `localhost` and any Preview address.
6. **Your first test account.** Restricted mode blocks ordinary sign-up, so get the first account one of two ways:
   - In Clerk go to **Users → Create user**, with your email, a password and your name.
   - Or go to **Users → Invitations → Invite**, then open the emailed link, which lands on `http://localhost:3000/accept-invite`.
   Development emails come from Clerk's shared `accounts.dev` domain.
7. **Make yourself a Development administrator:**
   ```
   npm run auth:bootstrap-admin -- you@example.com
   ```
   The script:
   - reads `.env.local`;
   - confirms the account exists in the **Development** instance;
   - creates the tables if needed;
   - makes that account an Administrator (tagged `development`).
   It's safe to run twice. Log in at `/login`, then open `/admin`.

#### B. Vercel Preview
- In **Vercel → Settings → Environment Variables**, add both Clerk keys with the **Development instance's** `pk_test_`/`sk_test_` values. Tick **Preview** (and **Development**, for `vercel env pull`). **Never tick Production** for these.
- Previews then sign in against the same test users as your machine, and never touch real accounts.
- Sign-in works on `*.vercel.app` preview addresses with no extra setup; Development instances aren't tied to a domain.
- Invitation and review-email links from a Preview point at that Preview's branch address, not the live site.
- A Development instance caps how many users it can hold, which is plenty for testing. If Vercel Deployment Protection is on, you pass Vercel's check first, then Clerk's.

#### C. Production instance (faithfulwordmusic.com)
1. **Create the Production instance.** In Clerk, switch the instance selector to **Production** and create it with domain **`faithfulwordmusic.com`**. You can clone the Development settings.
   - Production can't use a `*.vercel.app` address.
   - Production settings are **separate**, so check steps A2-A4 again on the Production instance.
   - **Invite-only access mode in particular must be set here too.**
2. **DNS.** Clerk's **Configure → Domains** page lists the DNS records to add, usually **five CNAMEs**:
   - `clerk` → Clerk's Frontend API. Sign-in runs from `clerk.faithfulwordmusic.com`.
   - `accounts` → the Account Portal.
   - `clkmail` plus two `…_domainkey` records, so Clerk's emails (invitations, password resets) are sent from `faithfulwordmusic.com` and pass SPF/DKIM.

   Add them exactly as shown wherever the domain's DNS lives: Vercel → Domains → DNS Records if Vercel hosts it, otherwise the registrar. They don't clash with Vercel's records or Resend's (`send`, `resend._domainkey`). Wait for Clerk to show every record as verified, then let it issue the certificates.
3. **Production keys go into Vercel only.** Under **Configure → API keys**, with **Production** selected, copy the `pk_live_`/`sk_live_` keys into Vercel with **only Production ticked**. Don't put them in `.env.local`. Redeploy Production.
4. **Redirects and callbacks:** nothing else to register.
   - Sign-in, sign-up and invitation redirects all stay on `faithfulwordmusic.com`, which is the Production instance's own domain.
   - Invitations are created with redirect `https://faithfulwordmusic.com/accept-invite`.
   - No social providers are on, so there are no OAuth credentials to set up.
5. **Your real account.** Development users don't exist here, so create yours again:
   - **Clerk (Production) → Users → Create user**, or **Invitations → Invite** yourself and accept the emailed link on the live site.
6. **Make yourself the Production administrator.** Pick one of these.
   - **Option 1: the Neon SQL editor.** No live key ever touches your machine.
     1. Log in on the live site once and open `/dashboard` (where logging in lands). That first signed-in page creates the tables and the starting roles.
     2. Copy your user ID (`user_…`) from **Clerk (Production) → Users → you**.
     3. In the Neon console's SQL editor, run:
        ```sql
        INSERT INTO roles (clerk_env, key, label, description, is_system)
        VALUES ('production', 'administrator', 'Administrator', 'Runs the website: accounts, roles and settings. Always has every permission.', true)
        ON CONFLICT DO NOTHING;
        INSERT INTO user_roles (clerk_env, clerk_user_id, role_key, granted_by)
        VALUES ('production', 'user_PASTE_YOUR_ID', 'administrator', 'bootstrap')
        ON CONFLICT DO NOTHING;
        ```
   - **Option 2: the script, with the Production keys pulled temporarily.**
     ```
     npx vercel env pull .env.production.local --environment=production
     node --env-file=.env.production.local scripts/bootstrap-admin.mjs you@example.com --production
     ```
     Then delete `.env.production.local`. The script refuses live keys without `--production`.

   Then log in at `https://faithfulwordmusic.com/login` and open `/admin`. From now on, manage everyone from the website.

#### D. Firewall rule for the request form
Same as the contact form. **Firewall → New Rule:** Request Path equals `/api/account-requests` **and** Method equals `POST` → **Rate Limit**, Fixed Window, `600s`, `5` requests, keyed on IP.

**If accounts show "temporarily unavailable",** Vercel Logs say why:

| Log line | Fix |
|---|---|
| `Clerk Development (test) keys are set on the Production deployment` | Put the `pk_live_`/`sk_live_` keys in the Production scope and redeploy |
| `Clerk Production (live) keys are set outside Production (preview)` | Replace the Preview-scoped keys with the `pk_test_`/`sk_test_` ones |
| `…belong to different Clerk instances` | The two keys came from different instances. Copy both from the same one |
| `DATABASE_URL is not set` | Accounts need the Neon database |

---

## Gotchas

- **Write file paths out in full.** The PDF, picture and link-preview code reads fonts with a literal `join(process.cwd(), "assets/fonts/Inter-Regular.ttf")`.
  - Next reads those paths at build time to know which files to ship with each function.
  - A helper that assembles paths from variables hides them, and Next then ships the **whole project** and warns about "dynamic filesystem access".
- **New route, missing types?** Route handlers use Next's generated `RouteContext<"/path/[param]">` type. After adding a route, run `npx next typegen` (or start the dev server) before type-checking.
- **A service's id** (e.g. `1-22`) comes from its position in the sheet. It's stable while the sheet is unchanged, which is all the picture addresses need, but don't store it long-term.
- **Printing the web page directly** (Ctrl+P) isn't specially laid out anymore. The PDF is the printout.
- **`AGENTS.md` / `CLAUDE.md`** are re-added by `next dev`. Committing them keeps the working tree clean.

---

## Accessibility and SEO

- **Structure:** semantic landmarks, a skip link, visible focus rings, and labelled form fields with linked error messages.
- **Controls:**
  - Month tabs follow the ARIA tabs pattern with arrow keys.
  - The share menu works fully from the keyboard (arrows, Home/End, Escape).
  - Select mode uses real checkboxes.
- **Size and contrast:** touch targets are at least 44px, and contrast meets AA throughout (gold is only used decoratively).
- **Motion:** `prefers-reduced-motion` is respected everywhere.
- **SEO:** page titles, descriptions, canonical URLs, Open Graph and Twitter cards, `sitemap.ts`, `robots.ts` and the icon are all generated from `src/config/site.ts`.
