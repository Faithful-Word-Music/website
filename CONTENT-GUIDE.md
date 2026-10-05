# Content Guide

Practical answers to "where do I change this?" for the Faithful Word Music website.
Nothing here requires knowing React. For developer setup and deployment, see [README.md](./README.md).

After editing any file, commit and push. Vercel rebuilds and deploys automatically.
**The one exception is the song list, which needs no commit at all** - it is built in the
**Service Planner** on the website itself. See below.

---

## Quick reference

| I want to change… | Edit this |
|---|---|
| The congregational song list | **The Service Planner** (`/service-planner`, signed in as Music Director) - no code change, no deploy |
| The weekly insert (Psalm / other song) | **Service Planner → Inserts** |
| Default number of songs, the insert's place, which services take it | `src/config/site.ts` → `servicePlanner` |
| Service planner wording | `src/content/service-planner.ts` |
| The planning philosophy the AI follows | `src/content/music-planning-philosophy.md` - plain Markdown. Keep one topic under each `##` heading, and no two headings the same |
| Homepage wording | `src/content/home.ts` |
| Contact page wording, form labels, error messages | `src/content/contact.ts` |
| Footer headings, resource labels, the list of resources | `src/content/footer.ts` |
| Song list page wording, "Morning/Evening Service" labels | `src/content/song-list.ts` |
| The contact email address | `src/config/site.ts` → `contactEmail` |
| The email the contact form sends *from* | `src/config/site.ts` → `mail.from` |
| An external resource URL (YouTube, MuseScore, Drive…) | `src/config/site.ts` → `resources` |
| Navigation menu items | `src/config/site.ts` → `nav` |
| Site colours, fonts, spacing | `src/app/globals.css` (the `@theme` block at the top) |
| The logo / brand mark | `src/components/layout/Logo.tsx` &mdash; and `src/app/icon.svg`, the browser-tab copy, must match |
| The social share card (link previews) | `src/lib/og.tsx` |
| Animation speed, or turning animation off | `src/app/globals.css` (the `MOTION` section at the bottom) |
| How fresh the song list is (default 10s) | `src/config/site.ts` → `songList.revalidateSeconds` |
| Sheet music files on song pages | **The Drive folders** - drop the file in; see [Adding sheet music](#adding-sheet-music) |
| Song details and whether its sheet music is public | **The Sheet Music Index**, Songs tab - one row per song. Files are public **only when `Copyrighted?` is `No`** |
| Song page / sheet music wording | `src/content/song-list.ts` → `songPage.about` and `songPage.sheetMusic` |
| Local secrets (API keys) | `.env.local` - never committed |
| Which environment variables exist | `.env.example` - placeholders only, safe to commit |

---

## Editing the song list

**Use the Service Planner.** Log in as the Music Director and choose **Service Planner** in the menu.
The old Google Sheet is no longer used - editing it changes nothing on the website.

### Planning a week

1. Open **Service Planner**. The next service that needs planning is at the top.
2. Open it. The week's insert is usually already in third place.
3. **Choose a song** for each place: type part of the title or the hymn number. Each result shows when
   it was last sung, how often, its recent keys, and whether it has sheet music. The key it was last
   sung in is filled in - change it if needed.
4. Reorder with the arrows, change keys, add or remove places. The **Checks** beside the list point out
   anything worth a second look (sung recently, planned nearby, missing sheet music, who is away).
   They never stop you.
5. **Save draft** to come back later, or **Publish** to put it on the song list.
6. To publish several services at once (say Sunday morning, Sunday evening and Wednesday), tick them in
   the list and press **Publish … together**.

Published services fold away under **Published**, so the next service to plan is always on top. They
can still be opened and changed - the song list updates as soon as you **Save changes**. **Return to
draft** takes a service off the song list.

### Inserts

**Service Planner → Inserts** lists the coming weeks. Choose one song per week; it goes in third
place in that week's Sunday morning, Sunday evening and Wednesday services. In any one service you can
still move it, replace it or remove it - that service then keeps its own choice. Changing a week's
insert later updates its unpublished services; for published ones the page offers **Update them**.

### Special services and planning ahead

- **New special service** (on the planner's main page) adds a conference, holiday or other one-off
  service: give it a date, morning or evening, a name and a start time.
- Regular services never need adding - they are always there. To plan further ahead, use
  **Plan further ahead** at the side of the list.
- A regular service that will not happen can be **cancelled** from its own page (and restored).

### New songs

If a song is not found when choosing, use **Add "…" as a new song**. Only the title is needed. The song
gets a Library page straight away; sheet music and details can be added later as usual.

### Exports

**Export** downloads the song list as a PDF or spreadsheet (formatted like the song list, or as raw
data). Exports are copies: editing a downloaded file does not change the website.

### Looking back

The **Archive** tab (also **Song Archive → Service plans** on the public site) lists every past service
with its songs and keys, and can be filtered by date, song, service, key or inserts.

---

## Adding sheet music

1. **Put the file in the right Drive folder**, named like the others:
   - `Sheet Music/01 - Congregational/Hymnals/<Hymnal>/Standard/PDF/121 - Like a River Glorious.pdf`
   - Chord charts go in `Chords/Standard/…`, and guitar capo charts in `Chords/Capo/…`. MuseScore files go in the `MuseScore` folder beside `PDF`.
   - Songs without a number (Psalms, Other Songs) are just the title: `Psalm 54.pdf`.
   - A second version of the same chart ends in ` (2)`, e.g. `… Saviour! (2).mscz`.
   - Put `IN PROGRESS` in the name of a draft to keep it off the website.
2. **Only if the song is new to the Index,** add one row to the **Songs** tab: Song ID, Title, Collection (the hymnal's folder name, exactly), Hymn Number, and `Copyrighted?`.
3. **Set `Copyrighted?` to `No`** only when the song is cleared to share. `Yes` or `Needs Review` keeps the file off the public site, and the song's page just says it isn't available publicly.

That's all. The site picks it up within about 10-20 seconds. There's no file list to update, and the **Versions** tab is optional: add a row there only to show a key or capo fret for one version.

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
