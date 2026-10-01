/** Editable copy for the site search (the palette opened from the header, or Ctrl/⌘ K). */
export const searchContent = {
  /** The header button's accessible name. */
  openLabel: "Search the site",
  /** The dialog's accessible name. */
  dialogLabel: "Search",
  placeholder: "Search songs, services and pages",
  closeLabel: "Close search",

  /** Result groups, in the order they are shown. */
  groups: {
    songs: "Songs",
    services: "Coming up",
    pages: "Pages",
    actions: "Actions",
  },

  /** Under a song with sheet music anyone may open. */
  sheetMusic: "Sheet music",
  /** Last row of the Songs group when more songs match than are shown. {count} is replaced. */
  moreSongs: "See all {count} matching songs in the Library",

  /** Shown while the songs and services are still arriving. */
  loading: "Loading songs…",
  /** Shown when the songs and services could not be loaded. Pages and actions still work. */
  loadError: "Songs could not be loaded just now. Pages and actions still work.",

  /** {query} is replaced. */
  noMatchTitle: "Nothing matches “{query}”",
  noMatchBody: "Try part of a song title, a hymn number, or a date such as “Oct 5”.",

  /** Announced to screen readers. {count} is replaced. */
  resultCount: ["{count} result", "{count} results"],

  /** The keyboard hints along the bottom of the palette. */
  hints: { move: "to move", open: "to open", close: "to close" },

  /** Page entries. `keywords` are extra words that find them. */
  pages: {
    home: { label: "Home", keywords: "start welcome about" },
    /** Signed in only: these replace Home. */
    dashboard: { label: "Dashboard", keywords: "home start coming up next attention" },
    profile: { label: "Your profile", keywords: "me instruments titles bio edit" },
    account: { label: "Account settings", keywords: "password email security sign in devices" },
    songList: { label: "Song List", keywords: "schedule services this month upcoming next" },
    archive: { label: "Song archive", keywords: "history past every song sung stats most sung" },
    years: { label: "Year in songs", keywords: "recap year review annual" },
    library: { label: "Library", keywords: "songs a-z index sheet music hymns" },
    contact: { label: "Contact", keywords: "email message question write" },
    /** {year} is replaced. */
    year: { label: "{year} in songs", keywords: "recap year review" },
  },

  /** Action entries. */
  actions: {
    themeDark: { label: "Switch to dark mode", keywords: "theme night appearance colour color" },
    themeLight: { label: "Switch to light mode", keywords: "theme day appearance colour color" },
    /** {month} is replaced. */
    pdf: { label: "{month} song list as a PDF", keywords: "print download save pdf" },
    email: { label: "Email us", keywords: "contact mail write" },
    church: { label: "Faithful Word Baptist Church website", keywords: "fwbc church external" },
    youtube: { label: "Our YouTube channel", keywords: "video recordings watch listen" },
    musescore: { label: "Our scores on MuseScore", keywords: "sheet music arrangements" },
    hymnCds: { label: "Hymn CDs to download", keywords: "audio recordings listen mp3 album" },
  },
} as const;
