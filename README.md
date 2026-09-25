# Faithful Word Music

Production website for **Faithful Word Music**, the music ministry of
[Faithful Word Baptist Church](https://www.faithfulwordbaptist.org/) in Phoenix, Arizona.

Canonical domain: **https://faithfulwordmusic.com** (secondary: `fwbcmusic.org`, which redirects to it).
Contact mail is on the same domain: **contact@faithfulwordmusic.com**, which is what Resend must
verify.

Three routes:

| Route | Purpose |
|---|---|
| `/` | Home - what the ministry is, and the two things visitors want |
| `/song-list` | The congregational song list, read live from Google Sheets |
| `/contact` | A working contact form that emails the ministry via Resend |

For day-to-day content edits, see **[CONTENT-GUIDE.md](./CONTENT-GUIDE.md)**. This file is for developers.

---

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** - CSS-first; design tokens live in `src/app/globals.css`, there is no `tailwind.config.ts`
- **Resend** - contact form delivery
- **Google Sheets API v4** - read-only song list
- **Zod** - one validation schema shared by client and server
- Deployed on **Vercel**

One conventional full-stack Next.js app. No separate backend, no database, no ORM, no CMS, no auth.

---

## Local setup

```bash
npm install
cp .env.example .env.local     # then fill in real values
npm run dev                    # http://localhost:3000
```

The site runs without any keys: the song list shows a "not connected" state and the contact form
returns a clear error. Add the keys to exercise those features.

### Commands

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) for the song-list parser, timing and history logic |
| `npx tsc --noEmit` | Type check |

---

## Environment variables

All are **server-only secrets**. None is prefixed `NEXT_PUBLIC_`, because that prefix bundles a
value into browser JavaScript and makes it public.

| Variable | Used by | Needed in |
|---|---|---|
| `GOOGLE_SHEETS_API_KEY` | `src/lib/google-sheets.ts` | Development, Preview, Production |
| `RESEND_API_KEY` | `src/lib/resend.ts` | Development, Preview, Production |
| `DATABASE_URL` | `src/lib/db.ts` (song archive) | Development, Preview, Production - set automatically by the Neon integration |
| `CRON_SECRET` | `src/app/api/cron/sync-archive/route.ts` | Production (and anywhere you trigger the sync by hand) |

- **`.env.local`** - real values, local only, git-ignored.
- **`.env.example`** - placeholders, committed, documents what exists.
- **Production** - set in Vercel, Settings, Environment Variables. Never in a committed file.

Both are read in exactly one file each, and both of those files import `server-only`, so importing
them from a client component fails the build rather than leaking a key. Missing configuration
degrades gracefully; it never crashes a page or exposes a value in an error message.

Everything non-secret - the contact address, external links, the spreadsheet ID - lives in
`src/config/site.ts` instead, because a public value does not need to be an environment variable.

---

## Architecture

```
src/
├── app/
│   ├── api/contact/route.ts   POST /api/contact
│   ├── song-list/page.tsx     server component: fetch + parse, then a client island
│   ├── contact/page.tsx
│   ├── layout.tsx             fonts, header/footer, base metadata
│   ├── page.tsx               home
│   ├── globals.css            design tokens (@theme) + musical details
│   ├── sitemap.ts / robots.ts / icon.svg / not-found.tsx
├── components/
│   ├── layout/  home/  song-list/  contact/  ui/
├── config/site.ts             single source of truth for public values
├── content/                   editable page copy
├── lib/
│   ├── google-sheets.ts       all Google-specific code (server-only)
│   ├── song-list.ts           sheet grid to services (pure, no I/O)
│   ├── resend.ts              email sending (server-only)
│   └── validation.ts          shared Zod schema
└── types/song-list.ts
```

Content, configuration, presentation and integration are kept apart. Only three components ship
JavaScript to the browser - the header (mobile menu), the song list (live Next/Now, tabs, search), the
song archive (search, filters) and the contact form. Everything else is a Server Component.

### How the song list works

```
Google Sheets  ->  src/lib/google-sheets.ts  ->  src/lib/song-list.ts  ->  native UI
                   (fetch, read-only)            (parse into services)
```

Two requests, both cached for 10 seconds (`siteConfig.songList.revalidateSeconds`):

1. **Sheet metadata** - `?fields=sheets.properties(title,index,hidden)`
   Tabs are sorted by tab index. The **first two visible** tabs are the schedule; hidden tabs are
   read only for song history (services that have already happened) and never shown as a schedule.
2. **Cell values** - `values:batchGet` with `valueRenderOption=FORMATTED_VALUE`, one range per tab.

**Why the API and not a CSV export.** The workbook holds all twelve months; only the current one is
visible and the other eleven still contain last year's dates. The CSV and `gviz` endpoints serve
hidden sheets and report nothing about visibility or order, so they would publish every hidden tab.
Only the Sheets API exposes `hidden` and `index`.

**Formulas.** `FORMATTED_VALUE` returns what the spreadsheet displays, so `IMPORTRANGE` and other
formulas arrive already resolved. The site never parses a formula.

**Sheet layout.** Row 1 is a heading; then repeating groups of a date row plus its song rows, in two
side-by-side blocks (columns `A/B/C` and `E/F/G`, with `D` a spacer). A date row carries `AM` or
`PM` in the number column and has no key; every song has a key. That marker names the service
(Morning/Evening) and, with the times in `siteConfig.songList.serviceTimes`, gives it an exact start
time. If the layout stops matching, the page falls back to a plain table rather than rendering nothing.

**Next and Now.** Every service is an absolute instant in Arizona time (UTC-7 all year), so the
markers are right for visitors in any timezone. The browser keeps its own clock
(`src/components/song-list/use-now.ts`): a service is **Next** right up to its start time, then
**Now** for 90 minutes while Next moves to the following service. No reload is needed. In
development, `?now=2026-09-27T10:29:00-07:00` pretends it is that moment.

**Song history and the archive.** The sheet only keeps a rolling twelve months, so every past
service is copied nightly into a Neon Postgres database (`src/lib/archive-store.ts`) by a Vercel
Cron job (`vercel.json`, calling `/api/cron/sync-archive`). A service stays *fresh* for 30 days, and
during that time the sheet's version wins so corrections are picked up. After that it is *frozen*,
so rewriting a tab for next year can never change last year's record. Pages combine the database
with the sheet (`src/lib/song-history.ts`), so the history is current before the nightly run, and if
the database is unavailable they carry on with the sheet's twelve months. `/song-list/archive` is
the searchable archive, and the hints under each upcoming song ("Last sung 3 weeks ago", "First
time ever") come from the same history. It only knows about services since the archive began, so
"First time ever" means "first time on record".

**Song pages.** Every song has its own page at `/song-list/archive/<song>` (e.g. `/song-list/archive/amazing-grace`).
It shows times sung, first and last sung, the keys used with counts, any upcoming services, and every
date, grouped by year. Song titles in the archive and on the schedule link there. A song only scheduled
so far still gets a page. The address comes from `songSlug()` in `src/lib/song-list.ts`.

**Printing.** The Print button (or Ctrl+P) on `/song-list` prints the open month in a layout that mirrors
the spreadsheet's printout (`src/components/song-list/PrintSchedule.tsx`): the full month, two columns
reading down, on one page. Nothing live is printed: no Next/Now, no hints, and no search filter.

**Freshness.** `revalidate = 10` on both the data fetches and the pages. Editing the sheet reaches the
site within seconds (at most 12 Sheets API requests a minute, against a 300/minute quota), with no rebuild and no redeploy. Nothing is baked into the build.

**Failure.** `getSongList()` returns a result object and never throws, so a Sheets outage or a
missing key shows an error state - which still links to the spreadsheet - instead of a broken site.

### How the contact form works

```
visitor -> /contact -> POST /api/contact -> BotID -> honeypot -> Zod validation -> Resend -> contact@faithfulwordmusic.com
```

- The same Zod schema runs in the browser and on the server. The server never trusts the client.
- **Addressing:** `From:` the site's own verified address, `To:` the ministry inbox, and
  `Reply-To:` **the visitor**. Replying answers them directly, without the message pretending to
  come from their address (which would fail SPF/DKIM).
- A hidden honeypot field catches bots; a filled honeypot returns `200` and sends nothing, so a bot
  cannot detect it.
- Status codes: `400` invalid, `403` BotID, `502` Resend failed, `503` not configured, `200` sent.
  Responses are generic - no stack traces, no environment values. Message contents are never logged.

**Spam and bot protection.** Three layers, none of which asks the visitor to do anything:

1. **Vercel BotID** - an invisible challenge the browser solves in the background, verified on the
   server with `checkBotId()`. The protected routes are listed in `src/instrumentation-client.ts`
   and must match what `src/app/api/contact/route.ts` checks; `withBotId()` in `next.config.ts`
   serves the challenge from this domain so an ad-blocker cannot drop it. A submission judged
   automated gets `403` and copy that names `contact@faithfulwordmusic.com`, so a false positive still has
   a way through. Free on every plan, including Hobby.
   *Deep Analysis* (Kasada's ML model) is a Firewall toggle - Pro only, $1 per 1000 checks, and not
   needed at this volume.
2. **The honeypot**, as above.
3. **A WAF rate-limit rule**, configured in the Vercel dashboard rather than in code - an in-memory
   limiter would not hold across serverless instances, but the edge one does. Firewall → Configure →
   New Rule: if `Request Path` equals `/api/contact` **and** `Method` equals `POST`, then
   **Rate Limit** (not Log - Log there throttles nothing), Fixed Window, `600s`, `10` requests,
   keyed on `IP`. Leave the exceeded-action on **Log** for the first week, then switch it to
   **Deny**. Hobby allows exactly one rate-limit rule per project; blocked requests are not billed.

`checkBotId()` always returns `isBot: false` under `next dev` - real detection only happens on a
Vercel deployment. To exercise the rejection path locally, pass
`developmentOptions: { bypass: "BAD-BOT" }` to it temporarily.

---

## Deploying to Vercel

### 1. Import the repository

1. Push this repository to GitHub.
2. In Vercel: **Add New, Project**, then import the repo.
3. Framework preset: **Next.js** (auto-detected). Root directory: `./`. Build command and output
   directory: leave as the defaults. `vercel.json` only declares the nightly archive cron job.
4. Add the environment variables below **before** the first deploy, then deploy.

### 2. Environment variables

**Settings, Environment Variables.** Add these, ticked for **Production, Preview and Development**:

```
GOOGLE_SHEETS_API_KEY = <your key>
RESEND_API_KEY        = <your key>
CRON_SECRET           = <a long random string>
```

`DATABASE_URL` is added for you when the Neon database is connected (see
[Setting up the song archive](#setting-up-the-song-archive)).

Changing an environment variable requires a redeploy to take effect.

To pull them down for local use later: `npx vercel env pull .env.local`.

### 3. Domains

**Settings, Domains.**

1. Add `faithfulwordmusic.com` and set it as the **primary** domain. It must match `siteConfig.url`
   in `src/config/site.ts`, which is what canonical URLs, the sitemap and metadata are built from.
2. Add `www.faithfulwordmusic.com`; Vercel will offer to redirect it to the apex - accept.
3. Add `fwbcmusic.org` (and `www.fwbcmusic.org`), and for each choose
   **Redirect to** `faithfulwordmusic.com`, permanent (308).
4. Vercel then shows the **exact DNS records** to create at your registrar - typically an `A` record
   for the apex and a `CNAME` for `www`. **Use the values Vercel gives you**; they are not guessed here.
5. Wait for each domain to show **Valid Configuration**.

> **Note.** `fwbcmusic.org` already redirects to `faithfulwordmusic.com`; step 3 just reproduces
> that redirect in Vercel.

### 4. Verify

- All three pages load, and the song list shows the current month's real data.
- Edit a cell in the Google Sheet; within about 10-20 seconds a fresh page load shows the change, with no redeploy.
- Send a real message through `/contact` and confirm it arrives, and that **Reply** addresses the visitor.
- `https://faithfulwordmusic.com/sitemap.xml` and `/robots.txt` respond, and every URL inside them
  is on `faithfulwordmusic.com` - not the old domain.
- `fwbcmusic.org` redirects to `faithfulwordmusic.com`.

---

## Setting up Google Sheets access

The spreadsheet is public read-only, so an API key is enough - no OAuth, no service account.

1. Go to the [Google Cloud console](https://console.cloud.google.com/) and create or select a project.
2. **APIs & Services, Library,** search **Google Sheets API**, then **Enable**.
3. **APIs & Services, Credentials, Create credentials, API key.** Copy it.
4. **Restrict the key** (recommended): edit it, and under **API restrictions** choose
   **Restrict key**, then **Google Sheets API** only. Leave application restrictions as **None** -
   the key is used server-side, where there is no referrer or fixed IP to restrict to.
5. Put it in `.env.local` as `GOOGLE_SHEETS_API_KEY=...`, and add it in Vercel.
6. Confirm the spreadsheet's sharing is **Anyone with the link, Viewer**. API-key access needs
   this, and it keeps the sheet read-only to the public.
7. Test: run the site and open `/song-list`. It should show the current month.

The integration is read-only; the site never writes to the spreadsheet.

---

## Setting up the song archive

1. In Vercel, open the project, go to **Storage, Create Database**, choose **Neon** (Marketplace,
   free plan), and connect it to this project for all environments. This adds `DATABASE_URL`.
2. Add `CRON_SECRET` (a long random string) in **Settings, Environment Variables**, then redeploy.
3. Locally: `npx vercel link`, then `npx vercel env pull .env.local`, or copy `DATABASE_URL` and
   `CRON_SECRET` into `.env.local` by hand.
4. Seed the archive once. The tables create themselves on first run:
   ```
   curl -H "Authorization: Bearer <CRON_SECRET>" https://faithfulwordmusic.com/api/cron/sync-archive
   ```
   The response reports how many services were `added`, `refreshed` and `frozen`. Running it again
   is harmless.
5. After that, Vercel runs it every night at 3 AM Arizona time. Check **Settings, Cron Jobs**.

**Failure alerts.** If a nightly run fails, or finds no past services in the sheet (usually a layout
change), an email goes to `siteConfig.songList.alertEmail` through Resend. This only happens in
production, never from local runs. If the whole site is down the job can't run at all; Vercel's cron logs
show that case.

Without a database the site still works: the archive and hints use the sheet's twelve months.

---

## Setting up Resend

1. Create an account at [resend.com](https://resend.com).
2. **Domains, Add Domain,** `faithfulwordmusic.com` - this must be the domain in `mail.from`, which is not the same as the canonical site domain.
3. Resend shows the **exact DNS records** to add (typically DKIM `TXT`, an SPF/`MX` pair for the
   sending subdomain, and optionally DMARC). **Add the records Resend gives you** - they are
   account-specific and are not reproduced here. Then click **Verify** and wait for *Verified*.
4. **API Keys, Create API Key**, with **Sending access**. Copy it - it is shown only once.
5. Put it in `.env.local` as `RESEND_API_KEY=...`, and add it in Vercel.
6. Make sure **`contact@faithfulwordmusic.com` is a real mailbox you can read.** Verifying the domain lets
   Resend *send* as that address; it does not create an inbox. Messages are delivered there.
7. Test: submit `/contact`, confirm the message arrives, and confirm **Reply** goes to the visitor.

If you ever send from a different address, change it in `src/config/site.ts` under `mail.from`. It
must be on a domain verified in Resend.

### Troubleshooting the contact form

**Adding an API key and verifying a domain are two separate steps.** A working key is not enough:
Resend refuses to send from a domain your account has not verified, and `mail.from` must always be
on a verified domain.

The status code tells you which half is wrong. Read it in the browser's Network tab, or in
Vercel → Logs.

| Status | Cause | Fix |
|---|---|---|
| `503` | `RESEND_API_KEY` is not reaching the function - not set for that environment, or set but not redeployed since | Add it in Vercel for Production/Preview/Development, then redeploy |
| `502` | Resend was reached and **rejected** the message. Usually an unverified sending domain; sometimes a revoked key or a rate limit | Read the exact reason in Vercel Logs, then fix it in Resend |
| `400` | Validation - a field is empty, malformed or too long | Nothing to fix; the form reports it per field |
| `403` | Vercel BotID judged the request automated. Expected for `curl` and other direct calls, which never solve the challenge | Nothing to fix if it was a bot. If a real visitor hit it, check Vercel → Firewall → BotID, and that `/api/contact` is listed in `src/instrumentation-client.ts` |

On a `502`, `src/lib/resend.ts` logs the reason Resend gave, prefixed `[contact]`:

```
[contact] Resend rejected the message: validation_error (403) - The faithfulwordmusic.com domain is not verified.
```

`validation_error (403)` means the domain needs verifying. `invalid_access (401)` means the key is
bad or revoked. Nothing sensitive is logged - no key, no message contents.

**Sending and receiving are independent.** Verifying the domain lets Resend send *as*
`contact@faithfulwordmusic.com`; it does not create an inbox. Inbound mail is whatever the domain's `MX`
records point at, and that address needs a real mailbox or forwarding rule there - otherwise
messages will send successfully and land nowhere. Do not enable Resend's "Receiving" feature unless
you intend to move inbound mail to Resend as well: it adds `MX` records at the root that would
collide with the existing ones.

---

## Motion

Two effects, both defined in the `MOTION` section of `src/app/globals.css`.

**Page transitions** use React's `<ViewTransition>` via `src/components/ui/PageTransition.tsx`, which
wraps the content of each `page.tsx`. It has to go in the pages, not the layout - layouts persist
across navigation, so enter and exit would never fire. No `next.config.ts` flag is needed: the React
build Next vendors for the App Router exports `ViewTransition`, even though the top-level
`react` package in `node_modules` does not. The header and footer carry `view-transition-name`s and
have their animations suppressed, so they stay anchored while the content changes.

**Scroll reveal** uses `src/components/ui/Reveal.tsx`, a small client component sharing one
`IntersectionObserver` across every instance on the page. It follows a single rule:

> already on screen when it mounts → appear at once; below the fold → fade up when scrolled to.

That one rule stops content animating in behind the page transition, keeps above-the-fold content
readable immediately, and means the song list's search filter needs no special handling - filtered
results render on screen, so they appear instantly instead of re-animating on every keystroke. Only
wrap content that is normally below the fold. Revealing sets data attributes directly on the node
rather than going through React state, so a dozen song cards cost no re-renders.

A pure-CSS approach (`animation-timeline: view()`) was rejected: Firefox stable still has it behind a
flag, and it scrubs with scroll position, so content un-reveals when you scroll back up.

**Degradation.** No View Transitions API → pages swap instantly. JavaScript disabled → a `<noscript>`
style in the root layout shows all revealed content. JavaScript broken → a CSS failsafe animation
reveals everything after 800ms (the first `Reveal` to mount adds `motion-ready` to `<html>`, which
cancels it). `prefers-reduced-motion: reduce` → both effects off, enforced in CSS *and* in JS.

Note the reduced-motion block has to name the `::view-transition-*` pseudo-elements explicitly; they
live in their own pseudo-element tree on the root, so the usual `*, *::before, *::after` reset does
not reach them.

---

## Accessibility and SEO

Semantic landmarks, a skip link, visible focus states, labelled fields with `aria-describedby`
errors, month tabs following the ARIA tabs pattern with arrow-key support, tables with scoped
column headers, touch targets of at least 44px, `prefers-reduced-motion` support, and AA contrast
throughout (gold is used decoratively because it does not meet AA for small text).

Per-page titles and descriptions, canonical URLs, Open Graph and Twitter metadata, `sitemap.ts`,
`robots.ts` and an SVG icon are all generated from `src/config/site.ts`.
