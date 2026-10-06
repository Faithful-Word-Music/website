/**
 * Wording for Conductor, the site's AI assistant: the Conductor page and the
 * floating panel share every word here. What Conductor itself is told (its
 * instructions) is in src/lib/ai/conductor/instructions.ts; the wording of a
 * failed AI request is in src/content/ai.ts.
 */
export const conductorContent = {
  name: "Conductor",
  /** For a screen reader, where "Conductor" alone would not say what it is. */
  description: "Faithful Word Music AI Assistant",
  metaDescription: "Ask about the songs, services and plans of Faithful Word Music.",

  /** Beside the name in the Conductor page's bar, where there is room. */
  tag: "AI Assistant",

  /**
   * What it can and cannot do yet. Said once: on the Conductor page as the
   * small line under the box to type in, in the panel over the suggestions.
   * Short enough for a line or two on a phone.
   */
  capabilities:
    "Conductor reads the site's records, the lyrics and the planning philosophy. It cannot read the music itself or change anything.",

  empty: {
    heading: "What would you like to know?",
    /** The one sentence under the heading, on the Conductor page. */
    body: "Ask what has been sung, what is planned and how often songs come round, or anything about music, sound and equipment.",
    examplesLabel: "Try asking",
    examples: [
      "When did we last sing Blessed Assurance?",
      "What did we sing last Sunday morning?",
      "What is planned for next Sunday night?",
      "Which songs about heaven have we not sung lately?",
      "What does my planning philosophy say about openers?",
      // Only the first five are shown (ConductorChat); a page's own examples come before these.
      "Which songs have we not sung in a while?",
      "Explain the circle of fifths.",
    ],
    /** Offered instead, over a page with a service or a song on it. */
    serviceExamples: [
      "Is anything in this service being repeated too soon?",
      "When were these songs last sung?",
      "How does this service fit my planning philosophy?",
    ],
    songExamples: ["When was this last sung?", "What do we usually sing with this song?", "Which songs are similar in theme to this one?"],
  },

  composer: {
    label: "Ask Conductor",
    placeholder: "Ask Conductor…",
    send: "Send",
    stop: "Stop",
    /** {max} is a count. */
    tooLong: "That is longer than Conductor can take ({max} characters at most).",
  },

  you: "You",
  thinking: "Conductor is thinking…",
  responding: "Conductor is responding…",
  stopped: "Stopped.",
  retry: "Try again",
  /** Under a finished answer. */
  copy: "Copy",
  copied: "Copied",

  /** What Conductor is doing while it looks something up. Keys are sent by the server (tools.ts). */
  status: {
    songs: "Checking the song history…",
    services: "Looking through the services…",
    plans: "Checking what is planned…",
    statistics: "Working through the records…",
    planner: "Checking the Service Planner…",
    lyrics: "Reading the lyrics…",
    themes: "Searching the song library…",
    philosophy: "Reading the planning philosophy…",
    memory: "Checking what has been remembered…",
    proposal: "Preparing a card for you to review…",
  },

  actions: {
    open: "Ask Conductor",
    close: "Close Conductor",
    openFull: "Open full Conductor",
    /** What the link itself shows, where there is room for two words. */
    openFullShort: "Full page",
    newConversation: "New conversation",
    /** What the button itself shows, in the Conductor page's bar. */
    newConversationShort: "New chat",
  },

  resize: {
    label: "Resize Conductor",
    hint: "Drag to resize. Double-click to reset.",
  },

  errors: {
    connection: "Conductor lost its connection before it finished. Please try again.",
    signedOut: "Your session has ended. Please log in again.",
    invalid: "Conductor could not read that question. Please try again.",
    empty: "Type a question first.",
    hourly: "That is a lot of questions in an hour. Please wait a little before asking more.",
    unavailable: "Conductor could not reach its saved conversations just now. Please try again.",
    notFound: "That conversation is no longer there.",
  },

  /** The person's saved conversations: the list behind "Chats", the same in the page, the panel and the sheet. */
  history: {
    /** The button that opens the list, and the list's own heading. */
    open: "Your conversations",
    openShort: "Chats",
    heading: "Conversations",
    /** A conversation whose first question gave it no title. */
    untitled: "New conversation",
    back: "Back to the conversation",
    close: "Close",
    newChat: "New chat",
    search: "Search conversations",
    loading: "Loading your conversations…",
    opening: "Opening the conversation…",
    failed: "Your conversations could not be loaded.",
    retry: "Try again",
    empty: "No conversations yet. Whatever you ask Conductor is kept here, so you can come back to it.",
    noMatches: "No conversation has that in its title.",
    /** Marks the conversation that is open. */
    current: "Open",
    rename: "Rename",
    /** {title} is the conversation's title. */
    renameLabel: "New title for {title}",
    delete: "Delete",
    /** {title} is the conversation's title. */
    confirmDelete: "Delete “{title}”? It cannot be brought back.",
    confirmYes: "Yes, delete",
    confirmNo: "Keep it",
    save: "Save",
    cancel: "Cancel",
    /** When a conversation was last spoken in. */
    today: "Today",
    yesterday: "Yesterday",
    errors: {
      title: "Give the conversation a title.",
    },
  },

  /**
   * The cards Conductor shows when it proposes something. Nothing a card
   * proposes happens until the person chooses on it.
   */
  cards: {
    memorySave: {
      heading: "Save to memory?",
      textLabel: "Exactly what will be saved",
      prompt: "Where should Conductor keep this?",
      personal: { label: "Personal", detail: "Only used when Conductor is helping you." },
      global: { label: "Global", detail: "Shared ministry-wide. Used for everyone who uses the AI." },
      cancel: { label: "Cancel", detail: "Store nothing." },
      /** Under a scope the person may not save to. */
      personalNotAllowed: "You do not have personal AI memory.",
      globalNotAllowed: "You do not have permission to change global memory.",
      /** Beside the scope the person asked for. */
      suggested: "You asked for this one",
      savedPersonal: "Saved to your personal memory.",
      savedGlobal: "Saved to global memory.",
      cancelled: "Not saved.",
    },
    memoryUpdate: {
      heading: "Change this memory?",
      beforeLabel: "Now",
      afterLabel: "Changed to",
      apply: "Apply",
      cancel: "Cancel",
      applied: "Memory changed.",
      cancelled: "Left as it was.",
    },
    memoryDelete: {
      heading: "Forget this memory?",
      textLabel: "This will be deleted",
      apply: "Forget it",
      cancel: "Keep it",
      applied: "Memory deleted.",
      cancelled: "Kept.",
    },
    philosophyEdit: {
      heading: "Change the planning philosophy?",
      /** {section} is the section's title. */
      section: "Section: {section}",
      currentLabel: "Current text",
      proposedLabel: "Proposed text",
      changesLabel: "What changes",
      showChanges: "Changes",
      showProposed: "Proposed",
      showCurrent: "Current",
      apply: "Apply",
      cancel: "Cancel",
      notAllowed: "You do not have permission to change the planning philosophy.",
      applied: "Applied. The planning philosophy now reads this way, and the change is in its history.",
      cancelled: "Not applied. The philosophy is unchanged.",
    },
    scopes: { personal: "Personal memory", global: "Global memory" },
    pending: "Saving…",
    /** Why a choice on a card could not be carried out. Keys are ResolveProblem (src/lib/ai/conductor/resolve.ts). */
    errors: {
      "not-found": "This card is no longer there.",
      settled: "This has already been decided.",
      "invalid-choice": "That is not one of this card's choices.",
      forbidden: "You do not have permission to do that. Nothing was saved.",
      "memory-gone": "That memory is no longer there, or already reads this way. Nothing was changed.",
      "memory-invalid": "That memory could not be saved as written. Nothing was saved.",
      "memory-full": "That memory is full. Delete some memories under Admin → AI → Memory first.",
      "philosophy-changed": "The planning philosophy has been changed since this was proposed. Nothing was applied; ask Conductor to propose it again.",
      "philosophy-invalid": "With this change the philosophy could not be used. Nothing was applied.",
      unavailable: "This could not be saved just now. Please try again.",
    },
  },
} as const;

export type ConductorStatusKey = keyof typeof conductorContent.status;
