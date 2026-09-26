# Content Guide

Practical answers to "where do I change this?" for the Faithful Word Music website.
Nothing here requires knowing React. For developer setup and deployment, see [README.md](./README.md).

After editing any file, commit and push. Vercel rebuilds and deploys automatically.
**The one exception is the song list, which needs no commit at all** - see below.

---

## Quick reference

| I want to change… | Edit this |
|---|---|
| The congregational song list | **The Google Sheet** - no code change, no deploy |
| Homepage wording | `src/content/home.ts` |
| Contact page wording, form labels, error messages | `src/content/contact.ts` |
| Footer headings, resource labels, the list of resources | `src/content/footer.ts` |
| Song list page wording, "Morning/Evening Service" labels | `src/content/song-list.ts` |
| The contact email address | `src/config/site.ts` → `contactEmail` |
| The email the contact form sends *from* | `src/config/site.ts` → `mail.from` |
| An external resource URL (YouTube, MuseScore, Drive…) | `src/config/site.ts` → `resources` |
| The Google Sheet link or spreadsheet ID | `src/config/site.ts` → `songList` |
| Navigation menu items | `src/config/site.ts` → `nav` |
| Site colours, fonts, spacing | `src/app/globals.css` (the `@theme` block at the top) |
| The logo / brand mark | `src/components/layout/Logo.tsx` &mdash; and `src/app/icon.svg`, the browser-tab copy, must match |
| The social share card (link previews) | `src/lib/og.tsx` |
| Animation speed, or turning animation off | `src/app/globals.css` (the `MOTION` section at the bottom) |
| How fresh the song list is (default 10s) | `src/config/site.ts` → `songList.revalidateSeconds` |
| Local secrets (API keys) | `.env.local` - never committed |
| Which environment variables exist | `.env.example` - placeholders only, safe to commit |

---

## Editing the song list

**Just edit the Google Sheet.** That is the whole workflow:

1. Open the sheet.
2. Edit the song schedule.
3. Google saves automatically.
4. Within about 60 seconds, new visitors see the change.

No code edit. No commit. No build. No redeploy.

People who subscribe to the song list in their calendar (the **Add to calendar** button) get the changes too, with nothing more to do. iPhones and Outlook usually catch up within an hour or so. Google Calendar can take several hours.

### Which months appear on the website

The website shows **the visible worksheet tabs, in tab order, up to two of them**:

- The **first visible tab** is treated as the current month.
- The **second visible tab**, if there is one, is treated as the upcoming month, and the site shows a month switcher.
- If only one tab is visible, the site shows that month with no switcher and no "coming soon" placeholder.

**Hidden tabs are never shown.** This matters: the workbook contains all twelve months, and the
eleven you are not using still hold last year's dates. They stay hidden, so they stay off the website.

To publish next month's schedule, **unhide that month's tab**. To retire a month, **hide it again**.

> The site uses the Google Sheets API specifically so it can tell which tabs are hidden.
> A simpler CSV export cannot, and would publish every hidden tab.

### Month names on the website

The website shows each tab's **actual title**. Rename a tab to `Christmas 2026` and the website
says `Christmas 2026`. Nothing in the code needs changing.

### The layout the website expects

Each tab is read as a service schedule:

- **Row 1** is the heading, e.g. `September Song List`.
- Two side-by-side blocks of services: columns **A/B/C** and columns **E/F/G**. Column **D** is a spacer.
- Within each block: a **date row** (the date in the title column, number and key left blank), followed by that service's **song rows** (`number`, `title`, `key`).
- A song with no hymnal number (a Psalm or chorus) simply leaves the number blank. That still reads as a song, not a date.

If a date appears twice - as Sundays do - the site labels the two services **Morning Service** and
**Evening Service**. Reword those in `src/content/song-list.ts` → `repeatedServiceLabels`.

If the layout ever stops matching, the page does not go blank: it falls back to showing the rows
plainly, with a short note.

### Formulas

Cells pulling from another spreadsheet (`IMPORTRANGE` and similar) are fine. The website reads the
**displayed value**, never the formula. Whatever the public sheet shows is what the website shows.

---

## Editing page wording

Copy lives in `src/content/`, separate from layout, so you can edit text without touching components:

- `src/content/home.ts` - hero, about section, both calls to action
- `src/content/contact.ts` - contact page text, field labels, validation and status messages
- `src/content/footer.ts` - footer headings and the resource list
- `src/content/song-list.ts` - song list page text and states

Keep the quotes and commas as they are; change only the text inside the quotes.

### Adding or removing a footer resource

In `src/content/footer.ts`, add or delete a line in `resources`:

```ts
{ label: "Faithful Word Music on YouTube", href: siteConfig.resources.youtube },
```

For a brand new resource, add the URL to `src/config/site.ts` → `resources` first, then reference it here.

---

## Changing colours and fonts

Both live at the top of `src/app/globals.css`, in the `@theme` block. Change a value there and it
updates across the whole site.

```css
--color-paper:     #faf9f6;   /* page background  */
--color-ink:       #111111;   /* body text        */
--color-muted:     #6b6b68;   /* secondary text   */
--color-line:      #e5e5e2;   /* borders          */
--color-gold:      #b08d57;   /* accent           */
--color-gold-dark: #84683f;   /* accent, readable at small sizes */
```

**One accessibility rule worth keeping:** `--color-gold` is too light for small text (about 3.1:1
against the page). It is used for rules, borders and large type only. Where gold text needs to be
readable, the site uses `--color-gold-dark`. If you change these, keep that split.

Fonts are set in `src/app/layout.tsx` (Source Serif 4 for headings, Inter for body).

---

## Animation

There are two effects, both defined in the `MOTION` section at the bottom of `src/app/globals.css`.

**Page transitions.** Moving between pages fades the old page out and fades the new one in with a
small upward drift. The header and footer stay still, so it reads as the content changing rather
than the whole screen moving.

**Scroll reveal.** Sections fade up as you scroll to them. Anything already on screen when the page
loads appears straight away with no animation - nobody should wait to read something already in
front of them, and it keeps the song list's search results appearing instantly as you type.

Both are switched off automatically for visitors who have asked their device to reduce motion, and
both are skipped entirely in browsers that do not support them. The site works the same either way.

### Adjusting it

- **Speed:** change the millisecond values in the `MOTION` section of `src/app/globals.css`. Lower is snappier.
- **How far content drifts:** the `translateY` values in the same section.
- **Which sections reveal:** the `<Reveal>` wrappers in the page and component files. Wrap a section to add the effect, remove the wrapper to take it away. Only wrap things that sit below the fold - wrapping a page heading achieves nothing, since it is on screen already.
- **Turn all motion off:** delete the `MOTION` section from `globals.css`. Nothing breaks; everything simply appears instantly.

---

## Secrets

- `.env.local` holds real API keys on your own machine. **It is never committed.**
- `.env.example` lists which variables exist, with placeholder values. **It is committed**, so anyone setting the project up knows what to fill in.
- Production keys are set in Vercel → Project → Settings → Environment Variables, not in any file.

Never put a secret in a variable starting with `NEXT_PUBLIC_` - anything with that prefix is sent to
every visitor's browser.
