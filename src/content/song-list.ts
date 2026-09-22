/**
 * Editable copy for the Congregational Song List page (/song-list).
 *
 * The SONGS THEMSELVES ARE NOT HERE. They come from the Google Sheet and are
 * never edited in code. This file holds only the wording around them.
 */
export const songListContent = {
  title: "Congregational Song List",
  lead: "The songs currently scheduled for congregational singing at Faithful Word Baptist Church, with hymnal numbers and keys for each service.",

  /** Button linking to the original public spreadsheet. */
  sheetLinkLabel: "View in Google Sheets",

  /** Instruction shown above the month tabs, for screen readers. */
  monthTabsLabel: "Choose a month",

  search: {
    label: "Search songs",
    placeholder: "Search by title or hymnal number",
    clear: "Clear search",
    /** {count} and {month} are replaced at render time. */
    results: "{count} matching {noun} in {month}.",
    noResults: "No songs match your search.",
  },

  /** Column headings for the songs in each service. */
  columns: {
    number: "No.",
    title: "Song",
    key: "Key",
  },

  /**
   * Sundays hold two services and the spreadsheet does not name them, so these
   * labels are applied by the site when a date appears more than once.
   * Reword or blank them out here - no other file needs to change.
   */
  repeatedServiceLabels: ["Morning Service", "Evening Service"] as const,
  /** Used if a date ever appears three or more times: "Service 1", "Service 2"... */
  numberedServicePrefix: "Service",

  /** Heading used for songs found before any date in the sheet (malformed data). */
  undatedServiceLabel: "Additional songs",

  states: {
    emptyTitle: "No songs listed yet",
    emptyBody:
      "This month's schedule has not been filled in yet. You can check the spreadsheet directly for the latest.",

    errorTitle: "The song list is temporarily unavailable",
    errorBody:
      "We could not load the schedule just now. It is usually a brief interruption - please try again shortly. In the meantime you can open the spreadsheet directly.",

    notConfiguredTitle: "The song list is not connected yet",
    notConfiguredBody:
      "This site is not currently configured to read the song schedule. You can open the spreadsheet directly.",

    fallbackNotice:
      "This month's schedule is laid out differently than usual, so it is shown below exactly as it appears in the spreadsheet.",
  },
} as const;
