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
    /** Over "Ask Conductor", the last thing offered once something is typed. */
    conductor: "Conductor",
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

  /**
   * Page entries. `keywords` are extra words that find them: what someone
   * would type when they do not remember what the page is called. Which pages
   * a person is offered is decided in src/lib/site-search.ts, by their
   * permissions.
   */
  pages: {
    home: { label: "Home", keywords: "start welcome about" },
    /** Signed in only: these replace Home. */
    dashboard: { label: "Dashboard", keywords: "home start coming up next attention my services sheet music" },
    profile: { label: "Your profile", keywords: "me instruments titles bio edit" },
    account: { label: "Account settings", keywords: "password email security sign in devices" },
    /** For someone who plans the services. */
    servicePlanner: { label: "Service Planner", keywords: "plan planning songs services draft publish queue choose schedule next sunday wednesday" },
    inserts: { label: "Inserts", keywords: "service planner psalm weekly insert second week month plan ahead" },
    /** For someone who may use AI. */
    conductor: { label: "Conductor", keywords: "ai assistant ask question chat help history lyrics when did we last sing" },
    /** For the music ministry's participants. */
    availability: { label: "Availability", keywords: "away unavailable out of town vacation who is playing schedule roster musicians normal services" },
    serviceArchive: { label: "Service plans archive", keywords: "past services history what was sung on that day order of songs" },
    songList: { label: "Song List", keywords: "schedule services this month upcoming next" },
    archive: { label: "Song archive", keywords: "history past every song sung stats most sung" },
    years: { label: "Year in songs", keywords: "recap year review annual" },
    library: { label: "Library", keywords: "songs a-z index sheet music hymns" },
    contact: { label: "Contact", keywords: "email message question write" },
    /** {year} is replaced. */
    year: { label: "{year} in songs", keywords: "recap year review" },
  },

  /**
   * The admin area's pages, by their id in src/lib/admin-sections.ts. Each is
   * offered only to someone who may open it.
   */
  admin: {
    overview: { label: "Admin", keywords: "administration manage settings overview" },
    requests: { label: "Admin: Requests", keywords: "account requests access approve decline new people waiting pending" },
    invitations: { label: "Admin: Invitations", keywords: "invite send invitation new account email pending revoke" },
    users: { label: "Admin: People", keywords: "users accounts members musicians person roles sheet music assign disable" },
    roles: { label: "Admin: Roles", keywords: "permissions role access who can music director musician member" },
    configuration: { label: "Admin: Configuration", keywords: "settings titles instruments sheet music types capo options setup" },
    aiUsage: { label: "Admin: AI Usage", keywords: "ai cost tokens budget spending requests model status library index refresh" },
    aiMemory: { label: "Admin: AI Memory", keywords: "ai remember remembered memories personal global forget conductor" },
    aiPhilosophy: { label: "Admin: Planning Philosophy", keywords: "ai service planning philosophy guidance rules how to plan history versions restore" },
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
    /** Opens the palette's own availability steps (below). For the music ministry's participants. */
    availability: { label: "Update my availability…", keywords: "away unavailable available out of town vacation sick cannot make it can't come mark myself sunday wednesday" },
    /** Sends what was typed to Conductor. {query} is replaced. For someone who may use AI. */
    askConductor: { label: "Ask Conductor: “{query}”", keywords: "" },
  },

  /** Asking Conductor from the search. */
  conductor: {
    /** Conductor is still answering the last question, so another cannot be sent yet. */
    busy: "Conductor is busy with another answer just now. Ask again in a moment.",
  },

  /** The steps behind "Update my availability…": choose a service, then say whether you will be there. */
  availability: {
    title: "Update my availability",
    back: "Back",
    /** The search box while choosing a service. */
    filter: "Find a service, e.g. Sunday or Oct 18",
    loading: "Loading your services…",
    loadError: "Your services could not be loaded just now. Please try again.",
    signedOut: "Your session has ended. Please log in again.",
    /** Holds the permission, but is not on the availability board (an administrator, say). */
    notOnBoard: "You are not on the availability board, so there is nothing here to change.",
    none: "There are no coming services to change.",
    noMatch: "No coming service matches “{query}”.",
    /** How you stand for a service now. {state} is the Availability page's own wording for it. */
    now: "Now: {state}",
    options: {
      available: "I will be there",
      unavailable: "I will be away",
      normal: "Back to my usual",
    },
    note: "Note (optional)",
    notePlaceholder: "e.g. Out of town",
    saving: "Saving…",
    hints: { choose: "to choose", back: "to go back" },
  },
} as const;
