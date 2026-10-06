import type { AiErrorCode } from "@/lib/ai/errors";

/**
 * Wording for the AI system: what a person is told when a request fails, and
 * the Admin -> AI page. A provider's own error text is never shown - each
 * failure is sorted into a code (src/lib/ai/errors.ts) and worded here.
 */
export const aiContent = {
  errors: {
    forbidden: "You do not have permission to use AI features.",
    "not-configured": "AI is not set up on this site yet.",
    auth: "The AI service did not accept this site's credentials. An administrator needs to check the AI Gateway key.",
    budget: "This month's AI budget has been used up. It resets at the start of next month.",
    "rate-limited": "The AI service is busy right now. Please wait a minute and try again.",
    "model-unavailable": "The AI model this site is set to use is not available. An administrator needs to check the model setting.",
    timeout: "The AI service took too long to answer. Please try again.",
    "invalid-response": "The AI service gave an answer the site could not use. Please try again.",
    provider: "The AI service could not answer just now. Please try again in a little while.",
    unknown: "Something went wrong with the AI request. Please try again.",
  } satisfies Record<AiErrorCode, string>,

  /** Short names for a failure, in the list of recent requests. */
  errorLabels: {
    forbidden: "No permission",
    "not-configured": "Not set up",
    auth: "Credentials refused",
    budget: "Budget used up",
    "rate-limited": "Rate limited",
    "model-unavailable": "Model unavailable",
    timeout: "Timed out",
    "invalid-response": "Unusable answer",
    provider: "Service error",
    unknown: "Failed",
  } satisfies Record<AiErrorCode, string>,

  admin: {
    title: "AI",
    intro:
      "The site's AI features run through Vercel AI Gateway. Every request is logged here by feature, so you can see what is being used and what it costs.",
    /** A request is one question or one refresh, however many calls to a model it took. */
    requestsNote: "A request is one thing asked - a Conductor question, a refresh of the library index - however many calls to a model it took. Each call is counted under the model it went to.",

    status: {
      heading: "Status",
      ready: "Connected",
      notConfigured: "Not set up",
      notConfiguredBody:
        "No AI Gateway key reaches the server here, so AI requests cannot be made. Add AI_GATEWAY_API_KEY to this environment and redeploy.",
      model: "Model",
      credentials: "Credentials",
      credentialLabels: { "api-key": "AI Gateway API key", oidc: "Vercel deployment token" },
      budget: "Monthly budget shown",
      noBudget: "None",
      dashboard: "Budgets and spend in Vercel AI Gateway",
      enforcement:
        "The budget that actually stops spending is the one set in Vercel AI Gateway. The figures on this page are this site's own record.",
    },

    test: {
      heading: "Connection test",
      body: "Sends one very short request to the model and logs it like any other, to check that the key, the model and the usage log all work. It costs a fraction of a cent.",
      button: "Run test request",
      pending: "Asking…",
      done: "Answered",
      success: "The model answered.",
      reply: "Reply",
      costPending: "Cost not reported yet",
    },

    month: {
      heading: "This month",
      /** {month} is "October 2026". */
      period: "{month}, by Coordinated Universal Time - the clock the Gateway's budget resets on.",
      cost: "Cost",
      /** {budget} is "$10.00". */
      ofBudget: "of {budget}",
      remaining: "Remaining",
      /** {share} is "13%". */
      used: "{share} used",
      overBudget: "Over the budget shown",
      requests: "Requests",
      errors: ["{count} failed", "{count} failed"],
      tokens: "Tokens",
      /** {input} and {output} are counts. */
      tokenSplit: "{input} in · {output} out",
      /** {count} is a count. */
      reasoning: "{count} reasoning",
      average: "Average cost",
      averageDetail: "per answered request",
      latency: "Average time",
      latencyDetail: "per answered request",
      none: "–",
      /** {used} is "13%" - read out for the bar. */
      barLabel: "{used} of the monthly budget used",
    },

    breakdown: {
      byFeature: "By feature",
      byModel: "By model",
      requests: ["{count} request", "{count} requests"],
      tokens: ["{count} token", "{count} tokens"],
    },

    recent: {
      heading: "Recent requests",
      empty: "No AI requests have been made yet. Run the connection test to make the first one.",
      answered: "Answered",
      /** A Conductor answer the person stopped before it finished. */
      stopped: "Stopped",
      costPending: "Cost pending",
    },

    /** The library index: the songs' lyrics, read from the MuseScore files (src/lib/library-content). */
    library: {
      heading: "Library index",
      intro:
        "The lyrics of the song library, read from the Standard MuseScore files in Drive and kept here so Conductor can read, search and compare them. Nothing refreshes it by itself: refresh it after sheet music is added or changed.",
      songs: "Songs in the Index",
      indexed: "Lyrics indexed",
      /** Under "Lyrics indexed". */
      sections: ["{count} section", "{count} sections"],
      noSource: "No MuseScore file",
      noSourceDetail: "no Standard file to read",
      noLyrics: "No lyrics in the file",
      noLyricsDetail: "nothing typed under the notes",
      failed: "Could not be read",
      failedDetail: "tried again at each refresh",
      outOfDate: "Out of date",
      outOfDateDetail: "new or changed since the last refresh",
      upToDate: "nothing waiting",
      awaitingEmbedding: ["{count} song still to embed", "{count} songs still to embed"],
      embeddingModel: "Embedding model",
      refreshed: "Last refreshed",
      never: "Never",

      refreshHeading: "Refresh",
      refreshBody:
        "Reads only the files that are new or have changed, and embeds only words it has not embedded before. A library with nothing changed costs nothing to refresh.",
      button: "Refresh library index",
      pending: "Refreshing…",
      done: "Refreshed",
      /** While a long refresh works. {done} and {total} are counts of files. */
      progress: "{done} of {total} files read…",
      embedding: ["Embedding the last {count} text…", "Embedding the last {count} texts…"],

      /** What a refresh reports. Each is left out when its count is zero, except the first. */
      report: {
        nothing: "Everything was already up to date.",
        added: ["{count} song indexed for the first time", "{count} songs indexed for the first time"],
        updated: ["{count} song updated", "{count} songs updated"],
        unchanged: ["{count} unchanged", "{count} unchanged"],
        removed: ["{count} removed", "{count} removed"],
        embedded: ["{count} text embedded", "{count} texts embedded"],
        noSource: ["{count} with no MuseScore file", "{count} with no MuseScore file"],
        noLyrics: ["{count} with no lyrics in the file", "{count} with no lyrics in the file"],
        failed: ["{count} could not be read", "{count} could not be read"],
      },
      /** A refresh that stopped before it had finished. */
      unfinished: "The refresh stopped before it had finished. Refresh again to carry on from where it left off.",
      /** {message} is the AI system's own wording for why. */
      embeddingStopped: "The lyrics are indexed, but embedding stopped: {message} Search by theme will miss what is not embedded yet.",

      problems: {
        /** {count} is a count of songs. */
        toggle: ["{count} song has a file that could not be indexed", "{count} songs have a file that could not be indexed"],
        noLyrics: "No lyrics in the file",
        failed: "Could not be read",
      },

      errors: {
        "not-configured": "The Google service account is not set up here, so the sheet music cannot be read.",
        unavailable: "The Sheet Music Index or Google Drive could not be read just now. Please try again.",
        "no-lyrics-type": "No sheet music type is named “{type}”. Lyrics are read from that type's MuseScore files; add it under Admin → Configuration.",
        database: "The library index could not be reached. Please try again.",
      },
      unavailable: {
        title: "The library index could not be loaded",
        body: "Its status could not be read just now. Conductor's other answers are not affected.",
      },
    },

    /** The pages under Admin -> AI. */
    nav: {
      label: "AI",
      usage: "Usage",
      memory: "Memory",
      philosophy: "Planning Philosophy",
    },

    /** Admin -> AI -> Memory: what people have asked the AI to remember (src/lib/ai/memory). */
    memory: {
      title: "AI memory",
      intro:
        "What the AI has been asked to remember. It only ever remembers what someone tells it to: here, or by asking Conductor and choosing where to keep it. A memory is something for the AI to keep in mind, not a rule; the planning philosophy is where rules for planning belong.",
      scopes: {
        personal: {
          tab: "My memory",
          heading: "My memory",
          body: "Yours alone. Used only when the AI is helping you, and nobody else can see it.",
          empty: "You have not asked the AI to remember anything for you yet.",
          add: "Add to my memory",
        },
        global: {
          tab: "Global memory",
          heading: "Global memory",
          body: "Shared ministry-wide. Used for everyone who uses the AI, whoever is asking.",
          empty: "Nothing has been saved to global memory yet.",
          add: "Add to global memory",
        },
      },
      /** Where a scope cannot be changed, or used at all, by this person. */
      readOnlyGlobal: "You can read global memory, but changing it needs the “Manage global AI memory” permission.",
      noPersonal: "You do not have personal AI memory. It needs the “Use personal AI memory” permission.",
      textLabel: "What to remember",
      textHint: "One short statement",
      textPlaceholder: "The congregation knows “To God Be the Glory” especially well.",
      categoryLabel: "Category",
      categoryHint: "Optional",
      noCategory: "None",
      search: "Search memory",
      noMatches: "No memory has that in it.",
      /** {count} is a count of memories. */
      count: ["{count} memory", "{count} memories"],
      edit: "Edit",
      save: "Save",
      cancel: "Cancel",
      delete: "Delete",
      confirmDelete: "Delete this memory? The AI will no longer have it.",
      confirmYes: "Yes, delete",
      confirmNo: "Keep it",
      moveTo: { personal: "Move to my memory", global: "Move to global memory" },
      /** {date} is a date and time; {name} is a person. */
      saved_on: "Saved {date}",
      changed_on: "Changed {date}",
      by: "by {name}",
      saved: "Memory saved.",
      deleted: "Memory deleted.",
      moved: { personal: "Moved to your memory.", global: "Moved to global memory." },
      errors: {
        forbidden: "You do not have permission to change that memory.",
        invalid: "A memory is one short statement, up to 500 characters.",
        "not-found": "That memory is no longer there.",
        full: "That memory is full. Delete some before adding more.",
        unchanged: "Nothing was changed.",
      },
      unavailable: {
        title: "Memory could not be loaded",
        body: "The AI's memory could not be read just now. Please try again.",
      },
    },

    /** Admin -> AI -> Planning Philosophy: the document the AI plans by, and its history (src/lib/ai/planning). */
    philosophy: {
      title: "Service Planning Philosophy",
      intro:
        "How Faithful Word Music plans a song service. Conductor reads it, and Generate with AI and Suggest with AI plan by it. A change made here is in force from the next AI request, with no deploy; every change is kept in the history below and can be brought back.",
      readOnly: "You can read the philosophy, but changing it needs the “Manage planning philosophy” permission.",
      /** Above the sections, for someone who can edit. */
      editing:
        "Each section is one topic. State a hard rule as one (“must”, “this is a hard rule”); anything else is treated as a preference. The AI repeats what is written and is told to add nothing, so write a number only if it is meant.",
      documentTitle: "Document title",
      sectionTitle: "Section heading",
      sectionText: "Section text",
      /** {count} is a count of characters. */
      length: "{count} of {max} characters",
      tooLong: "The philosophy is longer than the AI can be given. Shorten it before saving.",
      addSection: "Add a section",
      newSection: "New section",
      removeSection: "Remove section",
      restoreSection: "Put it back",
      removed: "This section will be removed when you save.",
      moveUp: "Move {section} up",
      moveDown: "Move {section} down",
      edit: "Edit",
      doneEditing: "Done",
      changed: "Changed",
      added: "New",
      noteLabel: "Note for the history",
      noteHint: "Optional",
      notePlaceholder: "Why this change was made",
      save: "Save changes",
      discard: "Discard changes",
      unsaved: ["{count} section changed, not yet saved", "{count} sections changed, not yet saved"],
      unsavedOrder: "Sections reordered, not yet saved",
      saved: "The planning philosophy was updated.",
      restored: "That version is the planning philosophy again.",
      /** A way to check the AI has understood a change, without touching a plan. */
      ask: {
        heading: "Check how the AI reads it",
        body: "Ask Conductor to explain how it would approach a service under the philosophy as it stands. It only explains: no plan is changed.",
        link: "Open Conductor",
        prompt: "Based on the current planning philosophy, explain how you would approach planning this Sunday morning's service. Do not change anything.",
        copy: "Copy the question",
        copied: "Copied",
      },
      history: {
        heading: "History",
        body: "Every version that has been in force, the latest first. Restoring one makes it the philosophy again as a new version; nothing is ever removed from this list.",
        current: "In force",
        sources: { seed: "First copy", manual: "Edited by hand", ai: "Proposed by Conductor", restore: "Restored" },
        /** {name} is a person. */
        by: "by {name}",
        /** {sections} is a list of section titles. */
        sections: "Changed: {sections}",
        reordered: "Sections reordered",
        seed: "Taken from the document the site shipped with.",
        /** {date} is a date and time. */
        restoredFrom: "Brought back the version of {date}.",
        view: "View",
        hide: "Hide",
        compare: "Compare with the version in force",
        showVersion: "This version",
        showCompare: "What differs from now",
        same: "This version reads the same as the one in force.",
        restore: "Restore this version",
        confirmRestore: "Make this the planning philosophy again? The version in force now stays in the history.",
        confirmYes: "Yes, restore",
        confirmNo: "Cancel",
        changes: { same: "Unchanged", changed: "Different", added: "Not in this version", removed: "Only in this version" },
        loading: "Loading that version…",
        failed: "That version could not be loaded.",
      },
      errors: {
        forbidden: "You do not have permission to change the planning philosophy.",
        unavailable: "The planning philosophy could not be saved just now. Please try again.",
        conflict: "The philosophy was changed by someone else while you were editing. Reload the page to see it, then make your change again.",
        unchanged: "Nothing was changed.",
        "not-found": "That version is no longer there.",
        empty: "The philosophy cannot be empty.",
        "no-sections": "The philosophy needs at least one section with some text.",
        "duplicate-section": "Two sections have the same heading. Give each its own.",
        "too-long": "The philosophy is longer than the AI can be given. Shorten it and save again.",
        invalid: "That could not be saved. Reload the page and try again.",
        heading: "Every section needs a heading of up to 80 characters.",
        /** {section} is a section's heading. */
        emptySection: "“{section}” has no text. Write something, or remove the section.",
      },
      unavailable: {
        title: "The planning philosophy could not be loaded",
        body: "It could not be read just now. Until it can, the AI will say the philosophy is not available rather than plan without it.",
      },
    },

    environment: "These figures are for this environment's accounts. The Gateway's budget is shared by every environment.",
    unavailable: {
      title: "Usage could not be loaded",
      body: "The usage log could not be read just now. AI requests are not affected.",
    },
  },
} as const;
