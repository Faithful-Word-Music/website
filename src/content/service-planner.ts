/**
 * Editable copy for the Service Planner (/service-planner): the work queue,
 * the planning workspace, Inserts, and the planner's Dashboard items. What
 * the planner does is decided in src/lib/service-planner/.
 *
 * {placeholders} are replaced at render time.
 */
export const servicePlannerContent = {
  eyebrow: "Music Director",
  title: "Service Planner",
  lead: "Build each service's songs here. Publishing puts them on the song list.",

  /** The planner's own sections. */
  tabs: {
    label: "Service Planner sections",
    plan: "Plan",
    inserts: "Inserts",
    archive: "Archive",
  },

  viewPublished: "View Published Song List",

  status: {
    "not-started": "Not started",
    draft: "Draft",
    published: "Published",
    cancelled: "Cancelled",
  },
  /** "3 of 5 songs" */
  progress: "{filled} of {target} songs",
  oneSong: "1 song",

  queue: {
    needsPlanning: "Needs planning",
    allPlanned: "Everything up to {date} is published.",
    published: "Published ({count})",
    cancelled: "Cancelled ({count})",
    select: "Select {service}",
    selected: "{count} selected",
    publishSelected: "Publish selected",
    publishOne: "Publish {count} service",
    publishMany: "Publish {count} services together",
    publishedGroup: "Published {count} services together.",
    publishedOne: "Published.",
    clearSelection: "Clear",
    showing: "Listing services through {date}.",
    newSpecial: "New special service",
    open: "Open",
    special: "Special",
    planNext: "Plan next",
    ahead: "Planning ahead",
  },

  special: {
    title: "New special service",
    lead: "A conference, holiday or other service outside the weekly pattern.",
    date: "Date",
    slot: "Service",
    slots: { AM: "Morning", PM: "Evening" },
    label: "Name",
    labelPlaceholder: "e.g. Missions Conference",
    time: "Start time",
    songs: "Number of songs",
    create: "Create service",
    cancel: "Cancel",
    exists: "There is already a service then. Open it to rename it or change its time.",
    created: "Special service created.",
  },

  workspace: {
    back: "Back to the Service Planner",
    songs: "Songs",
    place: "Place {n}",
    empty: "Empty",
    addSong: "Add song",
    chooseSong: "Choose a song",
    replace: "Change song",
    remove: "Remove",
    moveUp: "Move up",
    moveDown: "Move down",
    key: "Key",
    keyFor: "Key for {title}",
    noKey: "No key",
    insert: "Insert",
    insertFromWeek: "This week's insert",
    addPlace: "Add a place",
    removePlace: "Remove last empty place",
    save: "Save draft",
    saveChanges: "Save changes",
    saveAndPublish: "Save and publish",
    publish: "Publish",
    unpublish: "Return to draft",
    unpublishHint: "Takes it off the song list until it is published again.",
    cancelService: "Cancel this service",
    restore: "Restore this service",
    deleteSpecial: "Delete this special service",
    unsaved: "Unsaved changes",
    saved: "Saved.",
    published: "Published - it is on the song list.",
    returnedToDraft: "Back to a draft - it is off the song list.",
    cancelled: "Service cancelled.",
    restored: "Service restored as a draft.",
    publishedEditing: "This service is published. Saved changes go straight to the song list.",
    conflict: "Someone else changed this service. Reload to see their version before saving again.",
    reload: "Reload",
    locked: "This service took place more than a month ago, so it is now part of the permanent history and can no longer be changed.",
    cancelledNotice: "This service is cancelled, so it is not on the song list or in Availability. Restore it to plan it again.",
    newState: "Not saved yet - publish when it is ready, or save a draft.",
    draftState: "Draft - only you can see it until it is published.",
    publishedState: "Published - on the song list.",
    detailsLead: "Its name and start time.",
    detailsHint: "Leave the name blank for the usual one. A special name shows on the song list.",
    manage: "This service",
    exportPdf: "Download as PDF",
    details: "Service details",
    name: "Name",
    namePlaceholder: "Usual name",
    time: "Start time",
    applyDetails: "Apply",
    viewOnSongList: "View on the song list",
    export: "Export",
    leaveWarning: "You have unsaved changes to this service.",
    leaveTitle: "Leave without saving?",
    leaveStay: "Stay",
    leaveConfirm: "Leave without saving",
  },

  picker: {
    title: "Choose a song",
    replaceTitle: "Replace {title}",
    search: "Search by title or number",
    searchLabel: "Search songs",
    noResults: "No song matches “{query}”.",
    createNew: "Add “{query}” as a new song",
    lastSung: "Last sung {ago}",
    neverSung: "Never sung",
    usesYear: "{count}× in 12 months",
    upcoming: "Also planned {date}",
    keys: "Keys: {keys}",
    christmas: "Christmas",
    newSong: "New",
    sheet: {
      complete: "Sheet music",
      partial: "Some sheet music",
      none: "No sheet music files",
      unknown: "Not in the Sheet Music Index",
    },
    close: "Close",
    showing: "Showing {count} of {total}",
  },

  newSong: {
    title: "Add a new song",
    lead: "It joins the Library straight away. Sheet music and other details can be added later.",
    songTitle: "Title",
    number: "Hymn number",
    numberHint: "Leave blank for songs without one.",
    collection: "Collection",
    collectionPlaceholder: "e.g. Soul-Stirring Songs and Hymns 1989",
    defaultKey: "Usual key",
    create: "Add song",
    exists: "That song is already in the Library - search for it instead.",
    created: "Song added.",
  },

  /**
   * Generate with AI and Suggest with AI (src/lib/ai/service-planner). AI only
   * ever changes the songs on the page; saving and publishing stay with the
   * person.
   */
  ai: {
    generate: "Generate with AI",
    title: "Generate with AI",
    lead: "AI suggests songs for this service from the planning philosophy, the song history and the lyrics. It changes only what is on this page: nothing is saved or published until you do it.",
    /** The two ways to plan the whole service. Shown only when there is an unlocked song for them to differ about. */
    strategy: {
      label: "What should AI do?",
      fresh: {
        label: "Generate a new plan",
        hint: "Every unlocked place is chosen from scratch, around your locked songs and the week's inserts.",
      },
      improve: {
        label: "Improve current plan",
        hint: "The songs already here stay unless another would clearly serve the service better.",
      },
    },
    kept: ["{count} locked song stays exactly as it is.", "{count} locked songs stay exactly as they are."],
    open: ["AI may fill or change {count} place.", "AI may fill or change {count} places."],
    /** Generate a new plan: the places it starts again from. */
    openFresh: ["AI will choose {count} place afresh.", "AI will choose {count} places afresh."],
    /** An insert is unlocked and nothing is typed in the instructions. One insert, then two. */
    insertHeld: [
      "The insert is unlocked, but AI keeps it where it is unless your instructions ask for this service to go without it.",
      "The inserts are unlocked, but AI keeps them where they are unless your instructions ask otherwise.",
    ],
    nothingOpen: "Every song is locked, so there is nothing for AI to change. Unlock a song, or add a place.",
    instructions: "Additional instructions (optional)",
    instructionsHint: "Anything particular about this service. Locked songs stay, whatever is written here.",
    instructionsPlaceholder: "e.g. Keep this service especially familiar.",
    run: "Generate",
    pending: "Planning…",
    done: "Planned",
    cancel: "Cancel",
    /** After a generation, above the songs. */
    applied: ["AI changed {count} place. Look it over, then save.", "AI changed {count} places. Look them over, then save."],
    noChange: "AI would keep this service as it is.",
    undo: "Undo",
    dismiss: "Dismiss",
    /** Added when the library's lyrics have not been indexed. */
    noLyrics: "The lyrics are not indexed yet, so this was planned from the song history alone.",
    lock: {
      locked: "Locked - AI will keep this song here",
      unlocked: "Unlocked - AI may change this song",
    },
    /** In the song picker. */
    suggest: {
      button: "Suggest with AI",
      again: "Suggest again",
      pending: "Thinking…",
      done: "Suggested",
      heading: "Suggested by AI",
      lockedHint: "This song is locked. Unlock it to ask AI for suggestions.",
    },
    errors: {
      signedOut: "Your session has ended. Please log in again.",
      forbidden: "You do not have permission to plan with AI.",
      invalid: "Something about that was not valid.",
      cancelled: "This service is cancelled. Restore it first.",
      targetLocked: "This song is locked. Unlock it to ask AI for suggestions.",
      noPhilosophy: "The planning philosophy could not be read, so AI cannot plan just now.",
      noCandidates: "There are not enough songs to choose from.",
      christmasShort:
        "This service is in the Christmas season, and the site cannot tell enough songs to be Christmas songs to fill it. Lock what you have chosen, or choose the rest by hand.",
      hourly: "That is a lot of AI planning for one hour. Please try again a little later.",
      unusable: "AI's answer could not be used, so nothing was changed. Please try again.",
      unavailable: "The planner's data could not be read just now. Nothing was changed.",
    },
  },

  /** The side panel's checks. */
  checks: {
    title: "Checks",
    none: "Nothing to flag.",
    duplicate: "{title} is in this service twice.",
    recentlySung: "{title} was sung {ago}.",
    plannedNearby: "{title} is also planned for {date}.",
    repeatedPair: "{a} and {b} were sung together on {date}.",
    outOfSeason: "{title} is a Christmas song, and this is outside the Christmas season.",
    noSheetEntry: "{title} is not in the Sheet Music Index.",
    sheetGap: "{title}: no sheet music for {people}.",
    /** When that is every expected musician: said once, without the names. */
    sheetGapEveryone: "{title}: no sheet music for any of the expected musicians.",
    /** When that is every song in the service: one line instead of one per song. */
    noSheetMusic: "None of these songs has sheet music yet.",
    noSheetMusicForAnyone: "None of these songs has sheet music for the expected musicians.",
    /** Its key calls for capo sheet music (Admin, Configuration), which it does not have. */
    capoNeeded: "{title}: no capo sheet music for {people}.",
    /** Planned in a key other than the song's own. */
    keyDiffers: "{title} is planned in {key}; its current key is {current}.",
    emptyPlaces: "{count} places still empty.",
    emptyPlace: "1 place still empty.",
    unavailableIndex: "The Sheet Music Index could not be read, so sheet music is not checked.",
  },

  availability: {
    title: "Who's there",
    expected: "{count} expected",
    away: "Away",
    extra: "Coming specially",
    noneAway: "Nobody has said they are away.",
    unavailable: "Availability could not be loaded.",
    open: "Availability",
    nobody: "Nobody yet.",
  },

  history: {
    title: "History",
    created: "Created",
    edited: "Edited",
    published: "Published",
    published_edited: "Changed after publishing",
    cancelled: "Cancelled",
    restored: "Restored",
    unpublished: "Returned to draft",
    by: "by {name}",
    someone: "someone",
    imported: "the old song list",
    group: "with {count} other services",
  },

  /** The end of the Plan and Inserts lists (PlanAhead). {month} is e.g. "November". */
  planAhead: {
    start: "Start planning {month}",
    /** Undoes it: the month brought in early goes away again. What was planned stays saved. */
    stop: "Not yet - hide {month}",
  },

  inserts: {
    title: "Inserts",
    lead: "One Psalm or other song a week. It goes third in that week's Sunday morning, Sunday evening and Wednesday services, unless a service changes it. Any week can be given a second, which goes fourth.",
    weekOf: "Week of {date}",
    none: "No insert",
    choose: "Choose insert",
    change: "Change",
    clear: "Clear",
    /** Under a week that has its insert and no second one. */
    addSecond: "Add second insert",
    /** Beside each of a week's two inserts. {number} is 1 or 2. */
    numbered: "Insert {number}",
    /** The song picker's title when choosing one of two. {number} is 1 or 2; {date} is the week's Sunday. */
    pickerTitle: "Insert {number}, week of {date}",
    /** Refused: an insert is a song without a hymnal number. */
    numberedSong: "An insert is a song without a hymnal number. To put a hymn in the insert's place for one service, change that service's own plan.",
    /** Refused: the week's other insert is this song already. */
    twice: "That song is already this week's other insert.",
    key: "Key",
    /** Beside an insert saved in a key other than the song's own. {key} is the song's current key. */
    currentKey: "Current key: {key}",
    useCurrentKey: "Use it",
    services: "{count} services follow this week",
    custom: ["{count} changed it themselves", "{count} changed it themselves"],
    /** Published services still to come that show an older set: from before a change returned them to draft by itself. */
    outdated: ["{count} published service still shows older inserts.", "{count} published still show older inserts."],
    updatePublished: "Update and return to draft",
    /** A published service still to come took the week's inserts and is a draft again. */
    returned: [
      "{count} published service was updated and returned to draft: publish it again when it is ready.",
      "{count} published services were updated and returned to draft: publish them again when they are ready.",
    ],
    /** Under an insert that none of the week's services has among its songs. */
    unused: "No service is singing this insert. Clear it, or put it back into the services below.",
    /** Puts the week's inserts back into the services that changed theirs. {count} is how many inserts the week has. */
    putBack: ["Put it back into those services", "Put both back into those services"],
    restored: ["Put back into {count} draft service.", "Put back into {count} draft services."],
    /** Every service that changed its inserts has already been held. */
    nothingRestored: "No service could be changed: they have already been held.",
    /** When no unplanned or draft service needed it. */
    saved: "Insert saved.",
    savedUpdated: ["Insert saved and put into {count} draft service.", "Insert saved and put into {count} draft services."],
    /** A planned month, folded away once the next month is up. {count} is its weeks. */
    monthPlanned: ["{count} week planned", "All {count} weeks planned"],
  },

  export: {
    title: "Export",
    lead: "Spreadsheets and PDFs made from the planner. They are copies: changes to them do not come back here.",
    range: "Services",
    from: "From",
    to: "To",
    rawXlsx: "Raw data (.xlsx)",
    rawCsv: "Raw data (.csv)",
    formattedXlsx: "Formatted song list (.xlsx)",
    formattedPdf: "Formatted song list (PDF)",
    includeDrafts: "Include drafts",
  },

  errors: {
    notFound: "There is no service then.",
    invalid: "Something about that was not valid.",
  },

  /** The planner's Dashboard items (src/lib/dashboard/providers.ts). */
  dashboard: {
    needPlanning: "{count} services need planning",
    needPlanningOne: "1 service needs planning",
    needPlanningDetail: "Next: {service}",
    draft: "{service} - {progress}",
    draftDetail: "A draft, not yet on the song list.",
    open: "Open Service Planner",
    continue: "Continue planning",
  },
} as const;
