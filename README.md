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
   - [The printable PDF](#the-printable-pdf) · [Sharing services](#sharing-services) · [The contact form](#the-contact-form)
6. [Design conventions](#design-conventions)
7. [Testing](#testing)
8. [Deploying to Vercel](#deploying-to-vercel)
9. [Setup guides](#setup-guides): [Google Sheets](#google-sheets) · [Song archive](#song-archive) · [Resend](#resend)
10. [Gotchas](#gotchas)
11. [Accessibility and SEO](#accessibility-and-seo)

---

## At a glance

One Next.js app on Vercel. There's no separate backend, CMS or login. The song list is read live from a public Google Sheet, and nothing about it is baked into the build.

| Address | What it is |
|---|---|
| `/` | Home: what the ministry is, with links to the song list and contact page |
| `/song-list` | The congregational song list, live from Google Sheets: next-service spotlight, month tabs, search, key filter, PDF and sharing |
| `/song-list/archive` | Every song ever sung, searchable, with counts and dates |
| `/song-list/archive/<song>` | One song's history: times sung, keys used, upcoming services |
| `/song-list/pdf/<month>` | A month as a one-page printable PDF |
| `/song-list/image/<month>?s=<ids>` | One to three services as a PNG picture, for sharing |
| `/contact` | Contact form, emailed to the ministry through Resend |
| `POST /api/contact` | The contact form's endpoint |
| `GET /api/cron/sync-archive` | Nightly job that saves past services to the archive database |

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Google Sheets API ·
Neon Postgres (song archive) · Resend (email) · Vercel BotID · `@react-pdf/renderer` (PDF) ·
`next/og` (pictures and link previews) · Zod · Vitest.

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

All four are **server-only secrets**. None starts with `NEXT_PUBLIC_`, because that prefix puts a value into the browser's JavaScript, where anyone can read it.

| Variable | Powers | Where it's read | Needed in |
|---|---|---|---|
| `GOOGLE_SHEETS_API_KEY` | The song list | `src/lib/google-sheets.ts` | Development, Preview, Production |
| `RESEND_API_KEY` | The contact form and archive alerts | `src/lib/resend.ts` | Development, Preview, Production |
| `DATABASE_URL` | The permanent song archive (optional) | `src/lib/db.ts` | All, and added automatically by the Neon integration |
| `CRON_SECRET` | Protects the nightly archive sync | `src/app/api/cron/sync-archive/route.ts` | Production, and locally if you run the sync by hand |

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
src/
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
│   ├── layout.tsx                    Fonts, header, footer, base metadata
│   ├── globals.css                   Design tokens (@theme), motion, print
│   └── opengraph-image.tsx, sitemap.ts, robots.ts, icon.svg, not-found.tsx
├── components/
│   ├── song-list/                    Everything on /song-list (see below)
│   ├── ui/                           Shared pieces: Button, Card, Reveal, BackToTop…
│   └── layout/  home/  contact/
├── config/site.ts                    Every public setting, in one place
├── content/                          All page wording (edit without touching components)
├── lib/                              Logic, kept free of UI (see below)
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
| `service-picture.tsx` | Draws the shareable picture |
| `text-measure.ts` | Predicts where Inter text wraps (used by the PDF and the picture) |
| `og.tsx` | Link-preview cards, plus the fonts, logo and colours the picture reuses |
| `resend.ts`, `validation.ts` | Email sending and the shared form schema |

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
- **Where it's used:** `/song-list/archive` is the searchable archive, and every song has a page at `/song-list/archive/<song>` (address from `songSlug()`). The hints under upcoming songs ("Last sung 3 weeks ago") come from the same history.
  - "First time ever / this year" hints are switched off (`showFirstTimeHints: false`) until the records, which start in October 2025, go back far enough to be trustworthy.
- **Links:** song titles link to their pages in the archive. On the schedule they're plain text.
- **Alerts:** if a nightly run fails, or finds no past services (usually a sheet layout change), an email goes to `siteConfig.songList.alertEmail`. That happens in production only.

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
- **Phone:** *Send as text* or *Send as picture*, each opening the phone's share sheet.
- **Computer:** *Copy text*, *Copy picture*, *Save picture*, *Email*, and *More options…* (the system share panel).

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

---

## Design conventions

- **Design tokens** (colours, fonts, shadows, radius) live in the `@theme` block at the top of `src/app/globals.css`. There's no `tailwind.config.ts` (Tailwind v4 reads its settings from the CSS).
- **Fonts:** Source Serif 4 for headings and Inter for text, self-hosted by `next/font`. The PDF, pictures and link previews can't use those web fonts, so they use the copies in `assets/fonts/`.
- **Buttons:** use `Button`/`ButtonLink`, or `buttonClasses()` from `src/components/ui/Button.tsx`, so every button looks and behaves the same (gold-border hover, slight press-in). Primary buttons are ink, never gold, because gold text doesn't meet contrast (AA) on the paper background.
- **Motion:** every hover and state change shares one easing, set site-wide in `globals.css` (`--default-transition-duration: 250ms` with the site's ease-out curve). So a plain `transition-colors` already matches everything else; avoid one-off durations.
  - **Page transitions** use React's `<ViewTransition>` through `components/ui/PageTransition.tsx`, placed in each page (not the layout, which never re-mounts).
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

`DATABASE_URL` is added for you when Neon is connected (see [Song archive](#song-archive)).

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
