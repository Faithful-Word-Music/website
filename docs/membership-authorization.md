# Membership and sheet music access

Who may open copyrighted sheet music, and how an environment moves to that policy. The decision itself lives in `src/lib/auth/sheet-entitlement.ts`.

## Who is who

- **Member:** every approved account. Never grants copyrighted sheet music.
- **Faithful Word Church Member:** an account with a `verified` row in `user_church_affiliations`. Set by anyone with Manage users, never inferred, and it never makes someone a musician.
- **External Member:** an approved account without a current verification.
- **Musician, Song Leader, Music Director, Administrator:** unchanged, separate roles.

## Who gets a file

1. A **public** file is open to anyone.
2. Otherwise the person must be signed in with no overdue profile.
3. A **withheld** file is refused, except one file at a time for someone with Manage sheet music, for review.
4. An individual deny refuses. An individual grant allows.
5. Verified affiliation, the Musician role, a role with the permission (never Member), or Administrator allows.
6. Everything else is refused.

Every route that sends a file re-reads the rights first. Nothing else may call `openDriveFile` (`sheet-policy-invariants.test.ts` checks this).

## File rights

The Index's `Copyrighted?` column is the song. The optional **File Rights** tab is the arrangement:

| Target | Arrangement Rights |
|---|---|
| `01 - Congregational` | Cleared |
| `01 - Congregational/Chords` | Restricted |
| `id:<Drive file ID>` | Withheld |

The target is a folder path below "Sheet Music", or a file. A file rule beats a folder rule, and the deepest folder wins.

| Song | Arrangement | File is |
|---|---|---|
| No | Cleared | Public |
| No | Restricted | Restricted |
| Yes | Cleared or Restricted | Restricted |
| Any | Withheld | Withheld |
| Needs Review, blank or unexpected | Any | Withheld |
| Any | Missing or conflicting | Withheld |

## Caching

File responses are never kept by a shared cache. A delivery uses rights no more than 60 seconds old, and if they cannot be read the file is refused. Limits:

- A downloaded file cannot be recalled.
- Moving a higher-level Drive folder takes effect at the next index refresh. For an urgent removal, change the Index or add a file rule.
- A Google Sheets outage stops sheet music delivery.

## Activating an environment

The tables install automatically and do nothing until activated. Development and Production are activated separately, from **Admin -> Sheet Access**, by an Administrator.

1. Deploy. Access is unchanged.
2. Verify church members on each person's page.
3. Fill in the File Rights tab, then press Refresh sheet music under Configuration.
4. Review the report on Sheet Access: who loses access, and what is withheld.
5. Before activating Production, make sure older Production deployments are no longer reachable, because they ignore the withheld class.
6. Press Activate.

Activation is one database transaction. It is refused if the data changed since the report, or if every file would be withheld.

## Rollback

Rollback removes the Song Leader grant activation added. It never restores universal Member access, and the environment stays enforcing. To restore someone's access quickly, verify them or give them an individual grant. To restore a file, fix its row in the Index or File Rights.

## Personal Library

Favorites, notes and history are open to every approved member and never affect this policy. Having a song in them grants nothing, and Favorites responses carry only public song details: no rights, file links or Drive identifiers. Administrators have no access to another person's Favorites. See [personal-library.md](personal-library.md).

## Known limitation: AI lyrics

The AI lyrics tools (`src/lib/library-content/indexer.ts`, `src/lib/ai/conductor/tools.ts`) do not apply this policy: anyone with `use_ai` can read lyrics from restricted or withheld songs. **This must be fixed before `use_ai` is given to anyone new.** Administrators and the Music Director role hold it by default.
