# Song identity

`src/lib/song-identity.ts` is the shared, pure resolution policy. Display titles,
performed keys, and hymn numbers are not global identifiers.

## Resolution and persistence

1. An explicit `songId` wins. A persisted catalog alias can resolve to its
   associated index ID. A missing explicit ID never falls back to another title.
2. Old numbered references resolve only through a unique collection/number pair;
   records without a collection use the configured church hymnal. Leading zeros
   in numbers are insignificant. Conflicting numbers do not fall back to titles.
3. An unnumbered reference may use a unique normalized title. Shared titles are
   ambiguous, including titles shared across collections.
4. Otherwise the record stays unresolved. Numbered legacy evidence gets a
   lossless `legacy-n-…` identity; unnumbered records retain their old title key
   (or collection-qualified `legacy-t-…` evidence). These are historical fallback
   identities, never IDs for newly created catalog records.

Existing explicit associations in the combined history/plans are considered
before unresolved IDs are assigned, including during an index outage. The key
performed in a service is never evidence for an arrangement. A distinct index
Song ID remains independently addressable even when lyrics or titles match.

New catalog entries use persisted `catalog-<UUID>` identities. The additive
`catalog_songs_v2` table is keyed by environment and identity. Every access
repeatably copies missing rows from the old catalog using an environment-scoped,
deterministic ID and a unique legacy import key. The old table is retained so an
older production deployment can keep writing it; late additions are picked up.
An unambiguous association for a migrated row is saved once in `indexed_song_id`.
Its original catalog UUID remains an alias. New independent UUID entries are
never automatically merged into the index by title. Existing rows and timestamps
are preserved; conflicts never overwrite another identity.

Song references carry optional `songId` and `collection` through plans, weekly
inserts, AI requests, publication and archive serialization. Historical rows are
resolved in memory. There is no backfill or rewrite of frozen history; newly
saved/fresh archive rows can retain explicit identity. Existing freshness and
insert weekly-counting rules continue to apply.

## Public URLs and files

New URLs end in the complete identity, for example:

- `/library/songs/all-hail-the-power-of-jesus-name-sssh1989-167`
- `/library/songs/all-hail-the-power-of-jesus-name-sssh1989-168`

The route matches full known ID suffixes (including IDs such as `PS-019-7-10`),
not the final hyphen-separated segment. Arbitrary older identity strings use
lossless encoding. An old title in an identity URL still resolves and redirects
to the current canonical URL. Unique title-only bookmarks redirect permanently;
ambiguous bookmarks show arrangement choices and are marked `noindex`.

The Library includes every indexed song, plus catalog, historical and upcoming
entries, once per resolved identity. Listings expose only public display data.
File links retain checksums/version query strings; the file route resolves the
same arrangement and checks existing rights and member permissions before
opening Drive. Unknown, conflicting or ambiguous associations cannot serve files.
Capo overrides are now keyed by identity; old title rules apply only through an
unambiguous index/catalog association.

## Verification and Preview checks

Run the normal scripts in `package.json`: `npm test`, `npm run lint`,
`npm run build`, and `npx tsc --noEmit`.

The optional PostgreSQL migration integration test uses an isolated PGlite
engine; it never reads `DATABASE_URL`. Set `SONG_IDENTITY_PGLITE` to a file URL
for PGlite's `dist/index.js`, then run
`npm test -- src/lib/service-planner/store-identity.integration.test.ts`.
It covers repeated initialization, concurrent API calls, environment isolation,
late legacy additions, independent same-title UUID records and durable index
associations. Single-backend PGlite does not reproduce distributed lock contention.

Build verification can disable `DATABASE_URL`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`
and `GOOGLE_PRIVATE_KEY` in the build process to avoid contacting live services.
This verifies compilation and prerendering with unavailable-service fallbacks;
live Google, Neon, authenticated publication and model responses remain Preview
checks.

- Search `168`, `167`, and `all hail` in Service Planner; confirm both arrangements.
- Open each arrangement from planner, Library, schedule, archive, dashboard and recap.
- Confirm #167 has G and its files; #168 has A♭ and its own files/history/upcoming uses.
- Check Library title/number search, unique old bookmarks and ambiguous old bookmarks.
- Add two same-title catalog entries; edit/save a service and its weekly inserts.
- Publish a service and confirm it appears with its chosen identity and performed key.
- Ask Conductor about each hymn number, its history, sheet music and recommendations.
- Check member-only files signed out, as a member, and without the required permission.
- Confirm repeated Preview reads do not duplicate catalog rows or change production data.
