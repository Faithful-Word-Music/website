/**
 * What went wrong with an AI request, as one of a few codes the site can act
 * on. The code is what gets logged and what picks the wording a person sees
 * (src/content/ai.ts); a provider's own message never reaches the browser.
 *
 * Errors are read by their HTTP status and Gateway `type` before their class:
 * a spent budget is a 402 that the AI SDK can report as an internal server
 * error, so the class alone would call it a provider failure.
 *
 * Pure - no server-only import, and no import of the AI SDK - so it can be
 * unit tested.
 */

export const AI_ERROR_CODES = [
  "forbidden",
  "not-configured",
  "auth",
  "budget",
  "rate-limited",
  "model-unavailable",
  "timeout",
  "invalid-response",
  "provider",
  "unknown",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export interface AiFailure {
  code: AiErrorCode;
  /** A short, secret-free description for the log and the usage table. Never shown to a person. */
  detail: string;
  /** The Gateway's ID for the request, when the error carried one. */
  generationId: string | null;
}

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  type?: unknown;
  statusCode?: unknown;
  generationId?: unknown;
  cause?: unknown;
  lastError?: unknown;
}

/** The error and what it wraps (a retry's last error, a cause), outermost first. */
function chain(error: unknown): ErrorLike[] {
  const found: ErrorLike[] = [];
  let current: unknown = error;
  while (current && typeof current === "object" && found.length < 6 && !found.includes(current as ErrorLike)) {
    found.push(current as ErrorLike);
    const item = current as ErrorLike;
    current = item.lastError ?? item.cause;
  }
  return found;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const status = (item: ErrorLike) => (typeof item.statusCode === "number" ? item.statusCode : null);

const BUDGET_WORDS = /budget exceeded|quota limit exceeded|quota_for_entity_exceeded|insufficient (funds|credits|balance)/i;
/** The AI SDK replaces a refused key with a plain error: no status, no type, only these words. */
const AUTH_WORDS = /unauthenticated|authentication failed/i;
const MALFORMED_NAMES = /NoObjectGenerated|NoOutputGenerated|NoContentGenerated|JSONParse|TypeValidation|InvalidResponseData|EmptyResponseBody/;

function codeFor(items: ErrorLike[]): AiErrorCode {
  const has = (test: (item: ErrorLike) => boolean) => items.some(test);

  // Budget first: it can arrive wrapped as an internal server error.
  if (has((item) => status(item) === 402 || text(item.type) === "quota_for_entity_exceeded" || BUDGET_WORDS.test(text(item.message)))) {
    return "budget";
  }
  if (has((item) => ["AbortError", "TimeoutError"].includes(text(item.name)) || text(item.type) === "timeout_error" || status(item) === 408)) {
    return "timeout";
  }
  if (has((item) => text(item.type) === "authentication_error" || text(item.type) === "forbidden" || status(item) === 401 || status(item) === 403 || AUTH_WORDS.test(text(item.message)))) {
    return "auth";
  }
  if (has((item) => text(item.type) === "rate_limit_exceeded" || status(item) === 429)) return "rate-limited";
  if (has((item) => text(item.type) === "model_not_found" || text(item.type) === "not_found" || status(item) === 404)) {
    return "model-unavailable";
  }
  if (has((item) => text(item.type) === "response_error" || MALFORMED_NAMES.test(text(item.name)))) return "invalid-response";
  if (has((item) => text(item.type) !== "" || (status(item) ?? 0) >= 400)) return "provider";
  return "unknown";
}

/** Longest detail kept. */
const MAX_DETAIL = 300;

/**
 * Takes anything that could be a credential out of a message: bearer tokens,
 * and any long unbroken run of letters and digits (which also covers key and
 * generation IDs - the latter is kept separately). A long plain word has no
 * digit and is left alone.
 */
export function sanitizeDetail(message: string): string {
  return message
    // Terminal colour codes, which the AI SDK puts in some development messages.
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DETAIL);
}

/** Sorts any thrown value into a code, with a safe detail for the log. */
export function classifyAiError(error: unknown): AiFailure {
  const items = chain(error);
  const code = codeFor(items);
  // The innermost error with a message says the most about the cause.
  const source = [...items].reverse().find((item) => text(item.message) !== "") ?? items[0];
  const name = text(source?.name) || "Error";
  const statusCode = items.map(status).find((value) => value !== null);
  const message = text(source?.message) || (typeof error === "string" ? error : "No message.");
  const generationId = items.map((item) => text(item.generationId)).find((value) => value !== "") ?? null;
  return {
    code,
    detail: sanitizeDetail(`${name}${statusCode ? ` (${statusCode})` : ""}: ${message}`),
    generationId,
  };
}
