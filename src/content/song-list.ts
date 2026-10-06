/**
 * Editable copy for the Congregational Song List page (/song-list) and its
 * archive (/song-list/archive).
 *
 * The SONGS THEMSELVES ARE NOT HERE. They are planned in the Service Planner
 * and never edited in code. This file holds only the wording around them.
 */
export const songListContent = {
  title: "Congregational Song List",
  lead: "The songs currently scheduled for congregational singing at Faithful Word Baptist Church, with hymnal numbers and keys for each service.",

  /**
   * Button that opens the open month as a PDF, laid out like the printed song list,
   * ready to print or save.
   */
  pdfLabel: "PDF",

  /** For screen readers, after a song title that opens its page (SongLink). */
  newTab: "(opens in a new tab)",

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

  /** Every service is AM or PM; these are the names shown for them. */
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
      "This month's songs have not been posted yet. Please check back soon.",

    errorTitle: "The song list is temporarily unavailable",
    errorBody:
      "We could not load the schedule just now. It is usually a brief interruption - please try again shortly.",

    notConfiguredTitle: "The song list is not connected yet",
    notConfiguredBody:
      "This site is not currently connected to the song schedule.",

    pendingSong: "To be announced",
    /** A service whose songs have not been published yet. */
    notPosted: "Songs not posted yet",
    /** On a service not posted yet whose week's insert is already planned (said once for each, in a week with two). */
    plannedInsert: "Planned insert:",

    fallbackNotice:
      "This month's schedule is laid out differently than usual, so it is shown below exactly as it appears in the spreadsheet.",
  },

  /** One song's page in the archive, /library/songs/[song]. */
  songPage: {
    /** {number} is replaced at render time. */
    numberEyebrow: "Hymn No. {number}",
    /** From the Sheet Music Index. Rows with nothing filled in are left out. */
    about: {
      title: "About this song",
      labels: {
        composer: "Music",
        lyricist: "Words",
        keys: "Key",
        collection: "Collection",
        hymnNumber: "Hymn number",
        type: "Type",
        category: "Category",
        occasion: "Occasion",
        source: "Source",
        copyright: "Copyright",
      },
      copyright: {
        "not-copyrighted": "Not under copyright",
        copyrighted: "Under copyright",
      },
    },
    sheetMusic: {
      title: "Sheet music",
      /** Shown when the Index lists files, but none may be shared publicly. */
      restricted: "Sheet music for this song isn't available publicly.",
      /** Copyrighted files, open to signed-in members only. */
      membersOnly: "Members only",
      logIn: "Log in",
      /** Above the list when members could open files the public cannot. */
      membersNoteSignedOut: "This sheet music is copyrighted, so it's shared with members only.",
      /** Follows the "Log in" link: "Log in to view it." */
      membersNoteLogIn: "to view it.",
      membersNoteDenied: "This sheet music is copyrighted. Your account doesn't include access to it yet.",
      previewTitle: "Sheet music preview: {title}",
      previewLoading: "Loading the sheet music…",
      /** Over the preview when a PDF has more than one page. {page} and {count} are replaced at render time. */
      pageOf: "Page {page} of {count}",
      /** Shown in place of the preview if it cannot be drawn; the buttons below still work. */
      previewError: "The preview couldn't be shown here. Use View PDF below to open it.",
      viewPdf: "View PDF",
      downloadMuseScore: "Download MuseScore",
      /** Format names, for files listed but not available. */
      formats: { pdf: "PDF", musescore: "MuseScore" },
      /** A second or third version of the same type. {version} is replaced at render time. */
      version: "Version {version}",
      /** {fret} is replaced at render time. */
      capo: "Capo {fret}",
      /** {key} is replaced at render time. */
      key: "Key of {key}",
      newTab: " (PDF, opens in a new tab)",
      museScoreHint: "Opens in MuseScore, the free notation program.",
    },
    /**
     * Whether the song needs capo sheet music, and its own setting - shown only
     * to people who look after the sheet music (SongCapoSetting).
     */
    capo: {
      title: "Capo sheet music",
      required: "Needed",
      notRequired: "Not needed",
      /** Why: {key} is e.g. "Eb · 3 flats". */
      reasonPolicy: "from its key, {key}",
      reasonNoKey: "no key on record for this song",
      reasonSong: "set for this song",
      noType: "No capo sheet music type is chosen under Admin, Configuration, so nothing asks for it yet.",
      label: "For this song",
      rules: {
        /** {outcome} is policyYes or policyNo: what the site's policy says for this song. */
        global: "Use the site's capo policy ({outcome})",
        always: "Always need capo sheet music",
        never: "Never need capo sheet music",
      },
      policyYes: "needed",
      policyNo: "not needed",
      save: "Save",
      saved: "Saved.",
      note: "Only people who manage sheet music see this. The Service Planner's checks and the Dashboard's sheet music list follow it.",
    },
    /** Songs without a hymnal number are inserts, printed in the front of every hymnal. */
    fallbackEyebrow: "Insert",
    stats: {
      count: "Times sung",
      first: "First sung",
      last: "Last sung",
      none: "Not yet",
      /** Under the count. {count} and {total} are replaced at render time. */
      services: "In {count} of {total} services",
      rank: "#{position} most sung",
      jointRank: "Joint #{position} most sung",
      once: "Sung once so far",
      scheduledOnly: "First time coming up",
    },
    timeline: {
      title: "Through the months",
      caption: "Each dot is a time it was sung; rings are services it is scheduled for.",
      clippedCaption: "The last two years. Each dot is a time it was sung; rings are services it is scheduled for.",
      /** Tooltip. {month} and {detail} are replaced at render time. */
      tooltip: "{month}: {detail}",
      sung: ["sung once", "sung {count} times"],
      upcoming: ["scheduled once", "scheduled {count} times"],
      none: "not sung",
    },
    rhythm: {
      title: "How often",
      /** {gap} is replaced at render time, e.g. "6 weeks". */
      usually: "Usually every {gap}",
      since: "Last sung {ago}",
      longest: "Longest wait between: {gap}",
      status: {
        scheduled: "Scheduled",
        due: "Due",
        recent: "Sung recently",
      },
    },
    placement: {
      title: "Place in the service",
      habit: {
        opener: "Usually the opening song",
        middle: "Usually mid-service",
        closer: "Usually the closing song",
      },
      /** When every time sung was in the same place. {count} is replaced at render time. */
      always: {
        opener: "Opened all {count} times",
        middle: "Mid-service all {count} times",
        closer: "Closed all {count} times",
      },
      alwaysTwo: {
        opener: "Opened both times",
        middle: "Mid-service both times",
        closer: "Closed both times",
      },
      /** For a song sung once. */
      single: {
        opener: "Sung as the opening song",
        middle: "Sung mid-service",
        closer: "Sung as the closing song",
      },
      share: "{count} of {total} times",
      none: "No set place in the service",
      labels: { opener: "Opening", middle: "Middle", closer: "Closing" },
    },
    keysTitle: "Keys",
    /** {key} is replaced at render time. */
    keysAlways: "Always in {key}",
    keysMostly: "Mostly in {key}",
    keysMany: "Sung in {count} keys",
    signature: {
      none: "No sharps or flats",
      sharps: ["1 sharp", "{count} sharps"],
      flats: ["1 flat", "{count} flats"],
      relativeMajor: "relative major {key}",
      relativeMinor: "relative minor {key}",
      /** For modes such as C Dorian. */
      sameNotes: "same notes as {key} major",
    },
    weekly: {
      title: "Which services",
      all: "Sung all week",
      /** Under "Sung all week". {count} and {total} are replaced at render time. */
      allDetail: "Sunday morning, Sunday evening and Wednesday, {count} of {total} times it came round",
      allEvery: ["Sunday morning, Sunday evening and Wednesday", "Sunday morning, Sunday evening and Wednesday, all {count} times it came round"],
      mostly: {
        sundayMorning: "Mostly Sunday mornings",
        sundayEvening: "Mostly Sunday evenings",
        wednesday: "Mostly Wednesdays",
        other: "Mostly special services",
      },
      always: {
        sundayMorning: "Always Sunday mornings",
        sundayEvening: "Always Sunday evenings",
        wednesday: "Always Wednesdays",
        other: "Only at special services",
      },
      single: {
        sundayMorning: "Sung on a Sunday morning",
        sundayEvening: "Sung on a Sunday evening",
        wednesday: "Sung on a Wednesday",
        other: "Sung at a special service",
      },
      none: "No usual service",
      /** Under the headline. {count}, {total} and {weeks} are replaced at render time. */
      share: "{count} of {total} times",
      oncePerWeek: "Never twice in the same week",
      acrossWeeks: "{count} times across {weeks} weeks",
      labels: { sundayMorning: "Sun AM", sundayEvening: "Sun PM", wednesday: "Wed", other: "Other" },
    },
    /** {count} is replaced at render time. */
    keyCount: "{count}×",
    /** Heads the singing statistics when sheet music sits above them. */
    statsTitle: "Sung at Faithful Word",
    companionsTitle: "Often sung with",
    /** {count} is replaced at render time. */
    togetherCount: "Sung together {count} times",
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
      /** For an insert, which is counted by the week: sung at all of a week's services is one. */
      weeks: ["1 week", "{count} weeks"],
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
      onceMoreLead: ["{count} more song sung only once, oldest first.", "{count} more songs sung only once, oldest first."],
      close: "Close",
      timesSung: ["Sung once", "Sung {count} times"],
      /** For an insert, counted by the week. */
      weeksSung: ["Sung in 1 week", "Sung in {count} weeks"],
    },
    notFoundTitle: "No songs recorded for that year",
    errorTitle: "The year in song is temporarily unavailable",
    errorBody: "We could not load the song history just now. Please try again shortly.",
  },

  archive: {
    title: "Song Archive",
    lead: "Every song sung in our services, how often we have sung it, and when we last did.",
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
    /** {shown} and {total} are replaced at render time. */
    showing: "Showing {shown} of {total} songs",
    noResults: "No songs match your search.",
    emptyTitle: "No songs recorded yet",
    emptyBody: "Once services have been held, every song sung will appear here.",
    errorTitle: "The archive is temporarily unavailable",
    errorBody: "We could not load the song history just now. Please try again shortly.",
    /** The switch between the archive's two views of the same history. */
    views: {
      label: "Archive",
      songs: "Songs",
      services: "Service plans",
    },
  },

  /** The archive's other view: every past service as a complete song list. */
  serviceArchive: {
    title: "Service Plans",
    lead: "Every past service, song by song, in the order it was sung and in the keys it used.",
    filters: {
      song: "Song",
      songPlaceholder: "Title or hymnal number",
      from: "From",
      to: "To",
      type: "Service",
      key: "Key",
      anyKey: "Any key",
      insertOnly: "Inserts only",
      clear: "Clear",
    },
    types: {
      all: "All services",
      sundayMorning: "Sunday morning",
      sundayEvening: "Sunday evening",
      wednesday: "Wednesday",
      special: "Special services",
    },
    results: "{count} services",
    resultsOne: "1 service",
    /** {shown} and {total} are replaced at render time. */
    showing: "Showing {shown} of {total} services",
    noResults: "No services match.",
    insert: "Insert",
    special: "Special",
    emptyTitle: "No services recorded yet",
    emptyBody: "Once services have been held, each one will appear here.",
    errorTitle: "The archive is temporarily unavailable",
    errorBody: "We could not load the service history just now. Please try again shortly.",
    detail: {
      songs: "Songs",
      notFound: "No service was recorded then.",
      published: "Published by {name} on {date}",
      updated: "Last changed by {name} on {date}",
      created: "Planned by {name}",
      someone: "someone",
      history: "Changes",
      planner: "Open in the Service Planner",
      before: "Earlier service",
      after: "Later service",
    },
  },
} as const;
