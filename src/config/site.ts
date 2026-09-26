/**
 * Global, PUBLIC site configuration - the single source of truth.
 *
 * Everything here is safe to ship to the browser. Secrets never belong in this
 * file; they live in environment variables (see .env.example).
 *
 * If you need to change the contact email, an external resource link, the
 * spreadsheet, or the navigation, this is the only file you should have to open.
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
     * The public "PUBLIC Song List" Google Sheet.
     *
     * The spreadsheet is the source of truth for the song schedule: edit it in
     * Google Sheets and the website follows automatically, with no code change,
     * no build and no redeploy. See src/lib/google-sheets.ts.
     */
    spreadsheetId: "1ei9QUOHQ8l69pIXH09d5RlE90ZKbYJjYz1dTyup7nQ0",
    spreadsheetUrl:
      "https://docs.google.com/spreadsheets/d/1ei9QUOHQ8l69pIXH09d5RlE90ZKbYJjYz1dTyup7nQ0/edit",

    /**
     * How long (seconds) a fetched copy of the sheet is reused before refreshing.
     * Each refresh is 2 Sheets API requests and only happens when someone visits,
     * so 10s is at most 12 requests a minute against a 300/minute quota.
     * Keep in step with `revalidate` in src/app/song-list/page.tsx and
     * src/app/song-list/archive/page.tsx, which Next.js needs as literal numbers.
     */
    revalidateSeconds: 10,

    /** Maximum number of visible worksheet tabs shown on the site. */
    maxMonths: 2,

    /**
     * When each service starts, in church time (24-hour "HH:MM").
     *
     * The sheet marks every date AM or PM but never gives a time, so the site
     * supplies it here. These drive the "Next" and "Now" markers: a service is
     * "Next" right up to its start time, then "Now" for `serviceDurationMinutes`.
     * "otherDay" covers Wednesdays and special meetings such as the Missions
     * Conference.
     */
    serviceTimes: {
      sunday: { AM: "10:30", PM: "18:00" },
      otherDay: { AM: "10:30", PM: "19:00" },
    },

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

  /** External resources, surfaced in the footer. */
  resources: {
    church: "https://www.faithfulwordbaptist.org/",
    youtube: "https://www.youtube.com/@FWBCMusic1611",
    musescore: "https://musescore.com/user/98461567",
    songSheets:
      "https://drive.google.com/drive/folders/1-14CFjpOzHwAlvTLvjVOAEF7JqWYl8_L?usp=sharing",
    hymnCds:
      "https://drive.google.com/drive/folders/13GVPOYOG1_G-5IL6b5CDTpWBsWOCUnAg?usp=drive_link",
  },

  /** Primary navigation. Order here is the order rendered in header and footer. */
  nav: [
    { label: "Home", href: "/" },
    { label: "Song List", href: "/song-list" },
    { label: "Contact", href: "/contact" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
