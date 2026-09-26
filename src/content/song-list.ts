/**
 * Editable copy for the Congregational Song List page (/song-list) and its
 * archive (/song-list/archive).
 *
 * The SONGS THEMSELVES ARE NOT HERE. They come from the Google Sheet and are
 * never edited in code. This file holds only the wording around them.
 */
export const songListContent = {
  title: "Congregational Song List",
  lead: "The songs currently scheduled for congregational singing at Faithful Word Baptist Church, with hymnal numbers and keys for each service.",

  /** Button linking to the original public spreadsheet. */
  sheetLinkLabel: "View in Google Sheets",

  /**
   * Button that opens the open month as a PDF, laid out like the spreadsheet,
   * ready to print or save.
   */
  pdfLabel: "PDF",

  /** Link from the schedule to the archive. */
  archiveLinkLabel: "Browse every song we've sung",

  /** Instruction shown above the month tabs, for screen readers. */
  monthTabsLabel: "Choose a month",

  /** The spotlight at the top of the schedule. */
  spotlight: {
    nextEyebrow: "Next service",
    nowEyebrow: "Happening now",
    thenLabel: "Then",
    noneTitle: "No upcoming services listed",
    noneBody:
      "The next month's schedule has not been posted yet. Check back soon, or browse the archive below.",
    /** Shown beside the church time when the visitor's clock is elsewhere. */
    yourTime: "{time} your time",
  },

  /** Small pills on the service cards. */
  badges: {
    next: "Next",
    now: "Now",
  },

  /** Collapsible group of this month's services that have already happened. */
  earlier: {
    show: "Show earlier services ({count})",
    hide: "Hide earlier services",
  },

  /**
   * Sharing services as text: one card's share button, or several cards
   * picked in select mode. {date} and {count} are replaced at render time.
   */
  share: {
    /** Screen-reader name of a card's share button. */
    buttonLabel: "Share songs for {date}",
    select: "Select",
    cancel: "Cancel",
    selectLabel: "Select {date}",
    selectedCount: "{count} of {max} selected",
    /** Shown in the share bar when a fourth service is tapped. */
    limitReached: "You can share up to {max} services at a time",
    selectPrompt: "Tap services to share",
    share: "Share",
    done: "Done",
    /** Phones: the two formats, each opening the share sheet. */
    sendText: "Send as text",
    sendPicture: "Send as picture",
    /** Computers. */
    copy: "Copy text",
    copyPicture: "Copy picture",
    savePicture: "Save picture",
    email: "Email",
    systemShare: "More options…",
    /** Feedback after an action. */
    copied: "Copied",
    pictureCopied: "Picture copied",
    copyFailed: "Could not copy",
    pictureFailed: "Could not make the picture",
    /** Email subject and share-sheet title. */
    titleOne: "Songs for {date}",
    titleMany: "Songs for {count} services",
    /** Short names for AM and PM in the shared text: "Sunday, September 27 · Morning, 10:30 AM". */
    slotNames: { AM: "Morning", PM: "Evening" },
  },

  search: {
    label: "Search songs",
    placeholder: "Search by title or hymnal number",
    clear: "Clear search",
    keyLabel: "Search by key",
    keyPlaceholder: "Key",
    keyClear: "Clear key",
    /** {count}, {noun} and {month} are replaced at render time. */
    results: "{count} matching {noun} in {month}.",
    noResults: "No songs match your search.",
    clearFilters: "Clear filters",
  },

  /** Column headings for the songs in each service. */
  columns: {
    number: "No.",
    title: "Song",
    key: "Key",
  },

  /**
   * Hints under each upcoming song, from the full song history. {when} is a
   * relative time such as "3 wks ago"; {date} is a short date.
   */
  hints: {
    firstEver: "First time ever",
    firstThisYear: "First time this year",
    lastSung: "Last sung {when}",
    alsoOn: "Also on {date}",
  },

  /** The sheet marks each date AM or PM; these are the names shown for them. */
  serviceMarkerLabels: {
    AM: "Morning Service",
    PM: "Evening Service",
  },

  /**
   * Fallback only: if a date ever appears twice WITHOUT an AM/PM marker, these
   * name the two services in order. Reword here - no other file needs to change.
   */
  repeatedServiceLabels: ["Morning Service", "Evening Service"] as const,
  /** Used if an unmarked date appears three or more times: "Service 1", "Service 2"... */
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

    pendingSong: "To be announced",

    fallbackNotice:
      "This month's schedule is laid out differently than usual, so it is shown below exactly as it appears in the spreadsheet.",
  },

  /** One song's page in the archive, /song-list/archive/[song]. */
  songPage: {
    backLabel: "Back to the archive",
    /** {number} is replaced at render time. */
    numberEyebrow: "Hymn No. {number}",
    fallbackEyebrow: "Song archive",
    stats: {
      count: "Times sung",
      first: "First sung",
      last: "Last sung",
      none: "Not yet",
    },
    keysTitle: "Keys",
    /** {count} is replaced at render time. */
    keyCount: "{count}×",
    upcomingTitle: "Coming up",
    historyTitle: "Every time we've sung it",
    noHistory: "There is no record of this song being sung yet. Records begin in October 2025.",
    notFoundTitle: "Song not found",
  },

  /**
   * A year of singing, /song-list/year/[year]. {year}, {count} and the like
   * are replaced at render time.
   */
  yearRecap: {
    eyebrow: "A year of singing",
    title: "{year} in song",
    metaTitle: "{year} in Song",
    backLabel: "Back to the archive",
    /** Links from the archive and the song list. */
    linkLabel: "See our year in song",
    /** The opening sentence, by how much of the year is recorded. */
    leadInProgress: "So far in {year}, we have sung {songs} in {services}.",
    leadRecordsBegan: "Since our records began in {month}, we sang {songs} in {services}.",
    leadFull: "In {year}, we sang {songs} in {services}.",
    leadDetail: "That’s {different}, {hymns} of them from the hymnal.",
    /** "{count} songs" / "{count} services" / "{count} different songs". */
    songs: ["{count} song", "{count} songs"],
    services: ["{count} service", "{count} services"],
    different: ["{count} different song", "{count} different songs"],
    range: "{from} to {to}",
    previousYear: "Previous year, {year}",
    nextYear: "Next year, {year}",
    board: {
      title: "Most sung",
      caption: "The songs we came back to most often this year.",
      times: ["once", "{count} times"],
    },
    months: {
      title: "Month by month",
      caption: "Songs sung in each month.",
      unrecorded: "Not recorded",
      tooltip: "{month}: {count}",
    },
    keys: {
      title: "Keys",
      caption: "How often each key was used.",
    },
    facts: {
      morning: "Morning favourite",
      evening: "Evening favourite",
      welcomeBack: "Welcome back",
      /** {time} is e.g. "5 months", {date} the date it returned. */
      welcomeBackDetail: "Back on {date} after {time}",
      firstSong: "First song of the year",
      busiestMonth: ["Busiest month", "Busiest months"],
      busiestDetail: "{count} sung",
      once: "Sung just once",
      onceDetail: ["{count} song sung only once:", "{count} songs sung only once:"],
      /** The button that opens the rest of them, and the list it opens. */
      onceMore: "and {count} more",
      onceMoreTitle: "Also sung just once",
      /** {count} is how many are in the list. */
      onceMoreLead: ["{count} more song sung only once, most recent first.", "{count} more songs sung only once, most recent first."],
      close: "Close",
      timesSung: ["Sung once", "Sung {count} times"],
    },
    notFoundTitle: "No songs recorded for that year",
    errorTitle: "The year in song is temporarily unavailable",
    errorBody: "We could not load the song history just now. Please try again shortly.",
  },

  archive: {
    title: "Song Archive",
    lead: "Every song sung in our services, how often we have sung it, and when we last did.",
    backLabel: "Back to the song list",
    stats: {
      services: "Services",
      songs: "Different songs",
      since: "Records since",
    },
    search: {
      label: "Search the archive",
      placeholder: "Search by title or hymnal number",
    },
    range: {
      label: "Period",
      all: "All time",
      year: "This year",
      twelveMonths: "Last 12 months",
    },
    /** Column headings. Each is also the button that sorts by that column. */
    columns: {
      number: "No.",
      title: "Song",
      count: "Times sung",
      last: "Last sung",
      keys: "Keys",
    },
    /** {count} and {noun} are replaced at render time. */
    results: "{count} {noun}",
    /** {count} is replaced at render time. */
    showMore: "Show {count} more",
    /** {shown} and {total} are replaced at render time. */
    showing: "Showing {shown} of {total} songs",
    noResults: "No songs match your search.",
    emptyTitle: "No songs recorded yet",
    emptyBody: "Once services have been held, every song sung will appear here.",
    errorTitle: "The archive is temporarily unavailable",
    errorBody: "We could not load the song history just now. Please try again shortly.",
  },
} as const;
