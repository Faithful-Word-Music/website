import { initBotId } from "botid/client/core";

/**
 * Vercel BotID - an invisible challenge the browser solves in the background.
 *
 * Every route listed here has BotID's headers attached to its requests; the
 * server then verifies them with checkBotId(). A route checked on the server
 * but missing from this list always fails the check, so the two must stay in
 * step: see src/app/api/contact/route.ts.
 *
 * Nothing is shown to the visitor - no puzzle, no checkbox, no extra click.
 */
initBotId({
  protect: [{ path: "/api/contact", method: "POST" }],
});
