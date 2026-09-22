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

  /** Short form of the brand, used where the full name will not fit. */
  shortName: "FWBC Music",

  /** Short tagline used under the brand and in metadata. */
  tagline: "The Music Ministry of Faithful Word Baptist Church",

  /** Default meta description for the site. */
  description:
    "Faithful Word Music is the music ministry of Faithful Word Baptist Church in Phoenix, Arizona. Browse the congregational song list and find hymn resources for the local church and like-minded believers.",

  /** Canonical production domain. Used for metadata, canonical URLs and the sitemap. */
  url: "https://fwbcmusic.org",

  /** Public contact address. Also the destination for the contact form. */
  contactEmail: "contact@fwbcmusic.org",

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

    /** How long (seconds) a fetched copy of the sheet is reused before refreshing. */
    revalidateSeconds: 60,

    /** Maximum number of visible worksheet tabs shown on the site. */
    maxMonths: 2,
  },

  /**
   * Contact form email addressing (see src/lib/resend.ts).
   *
   * `from` must use a domain verified in Resend. Until fwbcmusic.org is
   * verified, Resend will reject sends from this address - change it here and
   * nowhere else.
   *
   * The visitor's address is NOT used as the sender. It is set as Reply-To, so
   * replying reaches them without the message pretending to come from them.
   */
  mail: {
    from: "Faithful Word Music <contact@fwbcmusic.org>",
    to: "contact@fwbcmusic.org",
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
