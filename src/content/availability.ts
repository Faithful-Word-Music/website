/**
 * Editable copy for Availability: the /availability page and the
 * Dashboard's Availability section. Who sees what is decided in
 * src/lib/availability/ and the page itself.
 */
export const availabilityContent = {
  eyebrow: "Music ministry",
  title: "Availability",
  lead: "Your normal services count every week. Only mark the services that are different.",

  views: {
    label: "Show",
    everyone: "Everyone",
    me: "Me",
  },
  managing: {
    label: "Managing",
    /** {name} is replaced. */
    banner: "You are changing {name}'s availability.",
    back: "Back to my own",
    yourself: "Myself",
  },
  notOnBoard:
    "You can see the ministry's availability, but you are not on the board yourself. Choose someone to manage their availability.",

  month: {
    previous: "Previous month",
    next: "Next month",
    today: "This month",
  },

  /** The legend under the calendar. */
  legend: {
    normal: "Normal",
    away: "Unavailable by exception",
    extra: "Available by exception",
    off: "Not one of your services",
    changes: "People with changes",
  },

  states: {
    "normally-available": "Available",
    "normally-unavailable": "Not one of your services",
    "available-by-exception": "Available by exception",
    "unavailable-by-exception": "Unavailable by exception",
  },
  /** Short forms, for chips and lists. */
  stateShort: {
    "normally-available": "Normal",
    "normally-unavailable": "Off",
    "available-by-exception": "Available",
    "unavailable-by-exception": "Away",
  },

  slots: { AM: "Morning", PM: "Evening" },
  special: "Special service",
  noServices: "No services this month.",
  past: "This service has passed.",

  /** {count} is replaced. */
  changeCount: ["{count} change", "{count} changes"],

  service: {
    /** The dialog for one service. */
    yourStatus: "Your availability",
    /** {name} is replaced. */
    theirStatus: "{name}'s availability",
    choices: {
      available: "Available",
      unavailable: "Unavailable",
    },
    /** Beside the choice that matches their normal services. Choosing it clears any exception. */
    usual: "Your usual",
    exceptionHint: "This differs from the normal services, so it shows as an exception.",
    note: "Note",
    noteHint: "Optional. Visible to the whole music team.",
    notePlaceholder: "e.g. Out of town",
    save: "Save",
    saving: "Saving…",
    close: "Close",
    changes: "Changes from normal",
    noChanges: "Everyone is on their normal schedule.",
    /** {count} is replaced. */
    expected: "Expected ({count})",
    nobodyExpected: "Nobody is expected.",
  },

  range: {
    open: "Report a date range",
    title: "Report a date range",
    lead: "Vacation, travel or illness: mark every service in a range at once.",
    from: "From",
    to: "To",
    status: "Mark as",
    clear: "Clear changes",
    /** {count} and {list} are replaced. */
    covers: ["Covers {count} service: {list}", "Covers {count} services: {list}"],
    none: "No upcoming services in that range.",
    save: "Save range",
  },

  normal: {
    title: "Normal services",
    /** {name} is replaced. */
    titleOther: "{name}'s normal services",
    lead: "The services you usually serve at. They count every week until you change them.",
    leadOther: "The services they usually serve at.",
    legend: "Usually available for",
    save: "Save normal services",
    saved: "Normal services saved.",
    none: "No normal services yet - you are only expected where you mark yourself available.",
  },

  upcoming: {
    titleMine: "Your upcoming changes",
    /** {name} is replaced. */
    titleOther: "{name}'s upcoming changes",
    titleEveryone: "Upcoming changes",
    noneMine: "No upcoming changes. Your normal services apply.",
    noneEveryone: "No upcoming changes. Everyone is on their normal schedule.",
    remove: "Back to normal",
    /** {name} {date} is replaced, for screen readers. */
    removeLabel: "Return {name} to normal for {date}",
  },

  messages: {
    saved: "Saved.",
    /** {count} is replaced. */
    rangeSaved: ["Saved for {count} service.", "Saved for {count} services."],
    noService: "No service is held then.",
    started: "That service has already started, so it can't be changed.",
    noneInRange: "There are no upcoming services in that range.",
    notOnBoard: "You are not on the availability board. Ask the music director if you should be.",
    notLeader: "You can only change your own availability.",
    unknownPerson: "That person is not on the availability board.",
  },

  /** The Dashboard's section. */
  dashboard: {
    title: "Availability",
    open: "View availability",
    normal: "Your normal services",
    noNormal: "No normal services set",
    setNormal: "Set them",
    next: "Next service",
    noNext: "No upcoming services.",
    mine: "Your changes",
    noMine: "No upcoming exceptions.",
    /** {count} is replaced. */
    more: "and {count} more",
    ministry: "Ministry changes, next two weeks",
    unavailable: "Availability could not be loaded just now.",
  },

  /** The "Needs your attention" item. */
  attention: {
    title: "Set your normal services",
    detail: "Choose the services you usually serve at, so the music team knows when to expect you.",
    action: "Set availability",
  },
} as const;
