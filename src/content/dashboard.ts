/**
 * Editable copy for the Dashboard (/dashboard), the signed-in home page.
 * Which sections show, and for whom, is decided in src/app/dashboard/page.tsx
 * and src/lib/dashboard/.
 */
export const dashboardContent = {
  eyebrow: "Dashboard",
  /** {name} is replaced with their preferred or first name. */
  greeting: "Welcome back, {name}!",
  greetingFallback: "Welcome back!",
  profileLink: "Your profile",

  attention: {
    title: "Needs your attention",
    // A profile that still needs something is no longer an item here: the
    // profile notice above everything else says it (ProfileStatusNotice).
    requests: {
      /** [one, many]; {count} is replaced. */
      title: ["{count} account request is waiting", "{count} account requests are waiting"],
      detail: "Someone asked to join and needs a review.",
      action: "Review requests",
    },
    sheetGaps: {
      title: [
        "{count} song in the next three services needs sheet music work",
        "{count} songs in the next three services need sheet music work",
      ],
      detail: "Missing files, PDFs or rights decisions - listed below.",
      action: "See the list",
    },
    invitations: {
      title: ["{count} invitation needs a follow-up", "{count} invitations need a follow-up"],
      /** Joined with " · ". {count} is replaced. */
      unanswered: ["{count} not accepted after a week", "{count} not accepted after a week"],
      expired: ["{count} expired unused", "{count} expired unused"],
      action: "Open invitations",
    },
    sheetTypes: {
      title: [
        "{count} musician has no sheet music chosen",
        "{count} musicians have no sheet music chosen",
      ],
      /** {names} is replaced. */
      detail: "{names}. Their Dashboard shows no Sheet Music links until you choose a type.",
      action: ["Choose their sheet music", "See musicians"],
    },
    instruments: {
      title: [
        "{count} musician hasn't listed their instruments",
        "{count} musicians haven't listed their instruments",
      ],
      /** {names} is replaced. */
      detail: "{names}. Their Dashboard can't pick the right sheet music without them.",
      action: ["Open their profile", "Open People"],
    },
  },

  /** Every list card. {count} is replaced. */
  lists: {
    showAll: "Show all {count}",
    close: "Close",
  },

  /** The row under Coming up: sheet music to finish, new sheet music, brush up. */
  gettingReady: {
    title: "Getting ready",
  },

  brushUp: {
    title: "Songs to brush up on",
    lead: "Next two weeks, not sung for a while.",
    /** {date} is replaced. */
    lastSung: "Last sung {date}",
    /** {date} is replaced with when the records begin. */
    neverSung: "Not sung since our records began ({date})",
    neverSungNoRecords: "Not in our records",
    /** {date} is replaced. */
    scheduled: "{date}",
  },

  sheetGaps: {
    title: "Sheet music to finish",
    lead: "Next three services, songs with missing pieces.",
    gaps: {
      noEntry: "Not in the Sheet Music Index",
      noFiles: "No files in Drive",
      /** {type} is replaced with the first sheet music type, e.g. "Standard". */
      noMainType: "No {type} sheet music",
      /** {type} is the capo type, e.g. "Capo (Chords)": the song's key calls for it. */
      noCapo: "Needs {type} sheet music for its key",
      /** {types} is replaced, e.g. "Standard, Capo (Chords)". */
      missingPdf: "No PDF for {types}",
      rights: "Rights need review",
    },
    unavailable: "The Sheet Music Index could not be read just now.",
  },

  newSheet: {
    title: "New sheet music",
    lead: "Added or updated in the last two weeks.",
    upcoming: "Coming up",
    /** {when} is replaced, e.g. "2 days ago". */
    updated: "Updated {when}",
  },

  quarter: {
    /** {label} is replaced, e.g. "Oct–Dec 2026". */
    titleCurrent: "{label} so far",
    titlePrevious: "{label}",
    services: ["{count} service", "{count} services"],
    songs: ["{count} different song", "{count} different songs"],
    /** {title} and {count} are replaced. */
    mostSung: "Most sung: {title} ({count}×)",
    /** {year} is replaced. */
    recap: "{year} in song",
  },

  people: {
    title: "People",
    musicians: "Musicians",
    songLeaders: "Song leaders",
    membersOnly: "Members only",
    membersOnlyNote: "No role beyond Member yet.",
    noSheetMusic: "none chosen",
    sheetMusicLabel: "Sheet music",
    /** Under a name with no title, so every row has two lines. */
    noTitle: "No title",
    all: "All people",
    unavailable: "The list of people could not be loaded just now.",
  },

  /** Song leaders (src/lib/dashboard/leadership.ts). {songs} is "song 5" or "songs 2 and 5". */
  leading: {
    /**
     * Captions over a service card's songs (Dashboard and song list): one above each run of songs
     * with the same leader, like a printed order of service (leaderCaptions).
     */
    ledBy: "Led by {name}",
    ledByYou: "Led by you",
    noLeader: "No leader yet",
    /** A song's leader tag (LeaderTag): the viewer's own, and the hidden words before any name. */
    tagYou: "You",
    tagLedBy: "Led by",
    /** On a card whose songs are not posted yet. */
    youLeadDraft: "You're leading {songs}",
    /** The viewer's next assignments beyond Coming up. */
    title: "Your song leading",
    notPublished: "Song list not published yet",
    unavailable: "You are marked unavailable",
    attention: {
      unled: ["{count} service in the next two weeks has songs without a leader", "{count} services in the next two weeks have songs without a leader"],
      unledDetail: "{service}: {count} without a leader",
      conflict: "{name} leads {songs} at {service} but is unavailable",
      ineligible: "{name} can no longer lead ({songs}) at {service}",
      mine: "You're leading {songs} at {service} but are marked unavailable",
      assign: "Assign leaders",
      resolve: "Resolve",
      mineAction: "Check availability",
    },
  },

  comingUp: {
    title: "Coming up",
    fullList: "Full song list",
    notPosted: "Songs not posted yet",
    pendingSong: "To be announced",
    /** Under a song: the person's other sheet music types it has, e.g. "also Standard (Chords)". */
    alsoSheet: "also",
    /** Under a song with none of the person's sheet music types. */
    noSheet: "No sheet music in your types yet",
    sheetNewTab: "(PDF, opens in a new tab)",
    /** The whole service's sheet music as one PDF, to print in one go. */
    packet: {
      /** Short enough for one line beside the "i" and the three dots, at every card width. */
      button: "Sheet music",
      /** In place of the button, when none of the service's songs has their sheet music. */
      none: "No sheet music for this service in your types yet",
      /** {count} songs in it. */
      count: ["{count} song · PDF", "{count} songs · PDF"],
      newTab: "(PDF, opens in a new tab)",
      /**
       * The three dots beside it, for people who look after the sheet music:
       * the service in any sheet music type, whoever it is assigned to.
       */
      types: {
        toggle: "Print another sheet music type",
        /** In place of the button, for someone with no sheet music types of their own. */
        only: "Sheet music for this service, by type",
      },
      /** The "i" beside it: a dialog on how to print all of it, or only some. */
      help: {
        toggle: "How to print",
        title: "Printing sheet music",
        intro: "You can print the whole service, or only the songs you need.",
        close: "Close",
        open: "Open the PDF",
        whole: {
          heading: "The whole service",
          body: "Open the PDF and print it. Every song prints, in order.",
        },
        some: {
          heading: "Only some songs",
          steps: [
            "Open the PDF and choose Print.",
            "Change Pages from All to Custom (on some phones, Range).",
            "Type the pages you want, like 3 or 1-2.",
          ],
          twoPages: "Some songs are two pages long. Count both: if the first song is pages 1-2, the second starts on page 3.",
          inOrder: "In this PDF, in order",
        },
        one: {
          heading: "Just one song?",
          body: "You can also tap its title in the list to open its song page, and print it from there.",
        },
      },
    },
    none: "No services are scheduled yet.",
    unavailable: "The song list could not be loaded just now.",
  },
} as const;
