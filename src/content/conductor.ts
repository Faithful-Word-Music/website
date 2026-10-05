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

  page: {
    eyebrow: "Faithful Word Music AI Assistant",    intro:
      "Ask about what has been sung, what is planned and how often songs come round, or anything about music, sound and equipment.",
  },

  /** What it can and cannot do yet, under the conversation. */
  capabilities:
    "Conductor answers from the site's own records of songs, services and plans, from the lyrics in the song library, and from the Music Director's planning philosophy. It cannot read the music itself, and it cannot change anything.",

  empty: {
    heading: "What would you like to know?",
    body: "Conductor looks things up in the song history, the plans, the lyrics of the song library and the planning philosophy. It only reads: nothing you ask can change a service.",
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
  },

  actions: {
    open: "Ask Conductor",
    close: "Close Conductor",
    openFull: "Open full Conductor",
    /** What the link itself shows, where there is room for two words. */
    openFullShort: "Full page",
    newConversation: "New conversation",
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
  },
} as const;

export type ConductorStatusKey = keyof typeof conductorContent.status;
