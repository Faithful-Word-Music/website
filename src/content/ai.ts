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

    environment: "These figures are for this environment's accounts. The Gateway's budget is shared by every environment.",
    unavailable: {
      title: "Usage could not be loaded",
      body: "The usage log could not be read just now. AI requests are not affected.",
    },
  },
} as const;
