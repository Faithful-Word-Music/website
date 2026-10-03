/**
 * Global, PUBLIC site configuration - the single source of truth.
 *
 * Everything here is safe to ship to the browser. Secrets never belong in this
 * file; they live in environment variables (see .env.example).
 *
 * If you need to change the contact email, an external resource link, the
 * service times, or the navigation, this is the only file you should have to open.
 */

export const siteConfig = {
  /** Public brand name. */
  name: "Faithful Word Music",

  /**
   * Short form of the brand, used where the full name will not fit. The
   * ministry is branded "Faithful Word Music" throughout, so this is currently
   * the same as `name` - kept as its own field for places that want a shorter
   * label later.
   */
  shortName: "Faithful Word Music",

  /** Short tagline used under the brand and in metadata. */
  tagline: "The Music Ministry of Faithful Word Baptist Church",

  /** Default meta description for the site. */
  description:
    "Faithful Word Music is the music ministry of Faithful Word Baptist Church in Phoenix, Arizona. Browse the congregational song list and find hymn resources for the local church and like-minded believers.",

  /** Canonical production domain. Used for metadata, canonical URLs and the sitemap. */
  url: "https://faithfulwordmusic.com",

  /** Public contact address. Also the destination for the contact form. */
  contactEmail: "contact@faithfulwordmusic.com",

  church: {
    name: "Faithful Word Baptist Church",
    shortName: "FWBC",
    location: "Phoenix, Arizona",
    url: "https://www.faithfulwordbaptist.org/",
  },

  songList: {
    /**
     * The retired "PUBLIC Song List" Google Sheet. The song list is now built
     * in the Service Planner; this is read only by the one-time import
     * (src/app/api/cron/import-sheet-schedule), and goes when that does.
     */
    spreadsheetId: "1ei9QUOHQ8l69pIXH09d5RlE90ZKbYJjYz1dTyup7nQ0",

    /**
     * How long (seconds) a rendered schedule page is reused before it is built
     * again from the database. Publishing in the Service Planner refreshes the
     * pages at once; this only bounds anything else.
     * Keep in step with `revalidate` in src/app/page.tsx, src/app/song-list/page.tsx and
     * src/app/song-list/archive/page.tsx, src/app/library/page.tsx and
     * src/app/library/songs/[song]/page.tsx and src/app/api/search/route.ts, which
     * Next.js needs as literal numbers.
     */
    revalidateSeconds: 10,

    /** The retired sheet's visible tabs read by the one-time import. Goes with it. */
    maxMonths: 2,

    /**
     * When each service starts, in church time (24-hour "HH:MM").
     *
     * Every service is AM or PM; these are their usual times (a special
     * service can set its own in the Service Planner). They drive the "Next"
     * and "Now" markers: a service is
     * "Next" right up to its start time, then "Now" for `serviceDurationMinutes`.
     * "otherDay" covers Wednesdays and special meetings such as the Missions
     * Conference.
     */
    serviceTimes: {
      sunday: { AM: "10:30", PM: "18:00" },
      otherDay: { AM: "10:30", PM: "19:00" },
    },

    /**
     * The services held every week (day: 0 = Sunday, 3 = Wednesday). They exist
     * for any date without being created: the Service Planner lists them for
     * planning, Availability for marking, and the song list shows those not yet
     * published as "Songs not posted yet" (src/lib/schedule-months.ts).
     */
    regularServices: [
      { day: 0, slot: "AM" },
      { day: 0, slot: "PM" },
      { day: 3, slot: "PM" },
    ] as ReadonlyArray<{ day: number; slot: "AM" | "PM" }>,

    /**
     * Show the "First time ever" / "First time this year" hints under upcoming
     * songs. Off while the song history is still being filled in: records only
     * go back to October 2025, so "first time ever" is not yet trustworthy.
     * The "Last sung..." hints are unaffected.
     */
    showFirstTimeHints: false,

    /**
     * "Often sung with" on each song's page. Most songs are paired differently
     * every time and show nothing; a pair is listed only when both songs were
     * sung together at least `minTogether` times, AND in at least `minShare`
     * of the services where either was sung (so a hymn that is simply sung
     * often does not look "paired" with everything). Raise either to show
     * fewer, stronger pairs.
     */
    pairings: { minTogether: 3, minShare: 0.33, limit: 3 },

    /** How long a service is treated as "happening now" after it starts. */
    serviceDurationMinutes: 90,

    /**
     * The church's timezone. Arizona does not observe daylight saving time, so
     * the offset is -07:00 all year - which is why a fixed offset is safe here.
     * Visitors elsewhere also see the time converted to their own zone.
     */
    timeZone: "America/Phoenix",
    utcOffset: "-07:00",
    timeZoneLabel: "Arizona time",

    /**
     * Where to send an email if the nightly archive sync fails, so the song
     * history never silently stops being saved. Change it to send alerts to
     * someone other than the main inbox.
     */
    alertEmail: "contact@faithfulwordmusic.com",
  },

  /**
   * The Service Planner (/service-planner), where the Music Director builds
   * the song list. See src/lib/service-planner/.
   */
  servicePlanner: {
    /** Songs a new service starts with room for. Any service can have more or fewer. */
    defaultSongs: 5,

    /**
     * The week's insert (a Psalm or other song) goes in this place (1 = first)
     * of each service in `insertServices`, unless that service says otherwise.
     */
    insertPosition: 3,

    /** The services a week's insert applies to (day: 0 = Sunday, 3 = Wednesday). */
    insertServices: [
      { day: 0, slot: "AM" },
      { day: 0, slot: "PM" },
      { day: 3, slot: "PM" },
    ] as ReadonlyArray<{ day: number; slot: "AM" | "PM" }>,


    /** A song sung within this many days of a service is flagged as recent. */
    recentDays: 14,

    /**
     * Plan and Inserts show the month being planned, and bring in the next
     * month this many days before it starts - never further ahead unless
     * "Start planning" asks (src/lib/service-planner/planning-window.ts).
     */
    planningLeadDays: 7,
  },

  sheetMusic: {
    /**
     * The PRIVATE "Sheet Music Index" Google Sheet: one row per song, with its
     * details and rights. The files themselves are found in the Drive folders.
     * Both are read by the site's Google service account (see
     * src/lib/google-auth.ts) and are not shared publicly - the ID alone opens
     * nothing. See src/lib/sheet-music-index.ts.
     */
    indexSpreadsheetId: "1vlPXiPuYooLpGACOTqwueYdB2wqkKZQb40lJoxi3tPE",

    /**
     * The hymnal the song list's numbers refer to. A song listed as "233" is
     * matched to the Index song in this collection with Hymn Number 233.
     */
    hymnalCollection: "Soul-Stirring Songs and Hymns 1989",

    /**
     * How long (seconds) a read of the Index and the Drive folders is reused,
     * and how long the CDN keeps a served file. A file dropped into Drive or
     * an edit to the sheet reaches the song pages within this time, without a
     * redeploy. Each refresh is 2 Sheets and ~2 Drive requests, and only
     * happens when someone visits - so 10s is at most ~12 Sheets requests a
     * minute, against the service account's limit of 60.
     */
    revalidateSeconds: 10,
  },

  /**
   * Contact form email addressing (see src/lib/resend.ts).
   *
   * `from` must use a domain verified in Resend. Until faithfulwordmusic.com
   * is verified, Resend will reject sends from this address - change it here
   * and nowhere else.
   *
   * The visitor's address is NOT used as the sender. It is set as Reply-To, so
   * replying reaches them without the message pretending to come from them.
   */
  mail: {
    from: "Faithful Word Music <contact@faithfulwordmusic.com>",
    to: "contact@faithfulwordmusic.com",
  },

  /**
   * Member accounts (invite-only, through Clerk). See README -> Accounts.
   * The keys themselves are environment variables, never here.
   */
  accounts: {
    /** Where "someone asked for an account" emails go. */
    notifyEmail: "contact@faithfulwordmusic.com",
    /** How long a Clerk invitation link stays valid. */
    invitationDays: 30,
  },

  /** External resources, surfaced in the footer. */
  resources: {
    church: "https://www.faithfulwordbaptist.org/",
    youtube: "https://www.youtube.com/@FWBCMusic1611",
    musescore: "https://musescore.com/user/98461567",
    hymnCds:
      "https://drive.google.com/drive/folders/13GVPOYOG1_G-5IL6b5CDTpWBsWOCUnAg?usp=drive_link",
  },

  /** Primary navigation. Order here is the order rendered in header and footer. */
  nav: [
    { label: "Home", href: "/" },
    { label: "Song List", href: "/song-list" },
    { label: "Library", href: "/library" },
    { label: "Contact", href: "/contact" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
