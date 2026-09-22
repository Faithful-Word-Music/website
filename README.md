# Faithful Word Music

Production website for **Faithful Word Music**, the music ministry of
[Faithful Word Baptist Church](https://www.faithfulwordbaptist.org/) in Phoenix, Arizona.

Canonical domain: **https://fwbcmusic.org** (secondary: `faithfulwordmusic.com`, which redirects to it).

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
| `npx tsc --noEmit` | Type check |

---

## Environment variables

Both are **server-only secrets**. Neither is prefixed `NEXT_PUBLIC_`, because that prefix bundles a
value into browser JavaScript and makes it public.

| Variable | Used by | Needed in |
|---|---|---|
| `GOOGLE_SHEETS_API_KEY` | `src/lib/google-sheets.ts` | Development, Preview, Production |
| `RESEND_API_KEY` | `src/lib/resend.ts` | Development, Preview, Production |

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
JavaScript to the browser - the header (mobile menu), the song list (tabs + search) and the contact
form. Everything else is a Server Component.

### How the song list works

```
Google Sheets  ->  src/lib/google-sheets.ts  ->  src/lib/song-list.ts  ->  native UI
                   (fetch, read-only)            (parse into services)
```

Two requests, both cached for 60 seconds:

1. **Sheet metadata** - `?fields=sheets.properties(title,index,hidden)`
   Hidden tabs are dropped, the rest sorted by tab index, and the **first two** taken.
2. **Cell values** - `values:batchGet` with `valueRenderOption=FORMATTED_VALUE`, one range per tab.

**Why the API and not a CSV export.** The workbook holds all twelve months; only the current one is
visible and the other eleven still contain last year's dates. The CSV and `gviz` endpoints serve
hidden sheets and report nothing about visibility or order, so they would publish every hidden tab.
Only the Sheets API exposes `hidden` and `index`.

**Formulas.** `FORMATTED_VALUE` returns what the spreadsheet displays, so `IMPORTRANGE` and other
formulas arrive already resolved. The site never parses a formula.

**Sheet layout.** Row 1 is a heading; then repeating groups of a date row plus its song rows, in two
side-by-side blocks (columns `A/B/C` and `E/F/G`, with `D` a spacer). A date row and a
song-without-a-number both have an empty first cell, so they are told apart by the key column, which
every song has and no date row does. Repeated dates are labelled Morning/Evening. If the layout
stops matching, the page falls back to a plain table rather than rendering nothing.

**Freshness.** `revalidate = 60` on both the data fetches and the page. Editing the sheet reaches the
site within about a minute, with no rebuild and no redeploy. Nothing is baked into the build.

**Failure.** `getSongList()` returns a result object and never throws, so a Sheets outage or a
missing key shows an error state - which still links to the spreadsheet - instead of a broken site.

### How the contact form works

```
visitor -> /contact -> POST /api/contact -> Zod validation -> Resend -> contact@fwbcmusic.org
```

- The same Zod schema runs in the browser and on the server. The server never trusts the client.
- **Addressing:** `From:` the site's own verified address, `To:` the ministry inbox, and
  `Reply-To:` **the visitor**. Replying answers them directly, without the message pretending to
  come from their address (which would fail SPF/DKIM).
- A hidden honeypot field catches bots; a filled honeypot returns `200` and sends nothing, so a bot
  cannot detect it.
- Status codes: `400` invalid, `502` Resend failed, `503` not configured, `200` sent. Responses are
  generic - no stack traces, no environment values. Message contents are never logged.
- There is deliberately **no in-memory rate limiter**: it would not hold across serverless instances.
  If spam appears, use Vercel WAF rate limiting, which works at the edge.

---

## Deploying to Vercel

### 1. Import the repository

1. Push this repository to GitHub.
2. In Vercel: **Add New, Project**, then import the repo.
3. Framework preset: **Next.js** (auto-detected). Root directory: `./`. Build command and output
   directory: leave as the defaults. No `vercel.json` is needed.
4. Add the environment variables below **before** the first deploy, then deploy.

### 2. Environment variables

**Settings, Environment Variables.** Add both, ticked for **Production, Preview and Development**:

```
GOOGLE_SHEETS_API_KEY = <your key>
RESEND_API_KEY        = <your key>
```

Changing an environment variable requires a redeploy to take effect.

To pull them down for local use later: `npx vercel env pull .env.local`.

### 3. Domains

**Settings, Domains.**

1. Add `fwbcmusic.org` and set it as the **primary** domain.
2. Add `www.fwbcmusic.org`; Vercel will offer to redirect it to the apex - accept.
3. Add `faithfulwordmusic.com` (and `www.faithfulwordmusic.com`), and for each choose
   **Redirect to** `fwbcmusic.org`, permanent (308).
4. Vercel then shows the **exact DNS records** to create at your registrar - typically an `A` record
   for the apex and a `CNAME` for `www`. **Use the values Vercel gives you**; they are not guessed here.
5. Wait for each domain to show **Valid Configuration**.

> **Heads-up on the cutover.** `fwbcmusic.org`, `www.fwbcmusic.org` and `faithfulwordmusic.com`
> currently point at the existing Google Sites site. Repointing DNS is what takes the old site down
> and brings this one up, so do it deliberately. Verify the Vercel deployment on its
> `*.vercel.app` URL first.

### 4. Verify

- All three pages load, and the song list shows the current month's real data.
- Edit a cell in the Google Sheet; within about 60 seconds a fresh page load shows the change, with no redeploy.
- Send a real message through `/contact` and confirm it arrives, and that **Reply** addresses the visitor.
- `https://fwbcmusic.org/sitemap.xml` and `/robots.txt` respond.
- `faithfulwordmusic.com` redirects to `fwbcmusic.org`.

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

## Setting up Resend

1. Create an account at [resend.com](https://resend.com).
2. **Domains, Add Domain,** `fwbcmusic.org`.
3. Resend shows the **exact DNS records** to add (typically DKIM `TXT`, an SPF/`MX` pair for the
   sending subdomain, and optionally DMARC). **Add the records Resend gives you** - they are
   account-specific and are not reproduced here. Then click **Verify** and wait for *Verified*.
4. **API Keys, Create API Key**, with **Sending access**. Copy it - it is shown only once.
5. Put it in `.env.local` as `RESEND_API_KEY=...`, and add it in Vercel.
6. Make sure **`contact@fwbcmusic.org` is a real mailbox you can read.** Verifying the domain lets
   Resend *send* as that address; it does not create an inbox. Messages are delivered there.
7. Test: submit `/contact`, confirm the message arrives, and confirm **Reply** goes to the visitor.

If you ever send from a different address, change it in `src/config/site.ts` under `mail.from`. It
must be on a domain verified in Resend.

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
