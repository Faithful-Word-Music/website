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

    environment: "These figures are for this environment's accounts. The Gateway's budget is shared by every environment.",
    unavailable: {
      title: "Usage could not be loaded",
      body: "The usage log could not be read just now. AI requests are not affected.",
    },
  },
} as const;
