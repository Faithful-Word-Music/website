/**
 * What a streamed AI answer looks like on the wire: one JSON event per line.
 * streamAiText() in src/lib/ai/service.ts writes these and the browser reads
 * them, so neither a route nor a component ever sees the AI SDK's own stream.
 *
 *   status   the answer is being worked on: a key the feature's own content
 *            words ("Checking the song history…"). Never a tool's name, its
 *            input or what it returned.
 *   text     the next piece of the answer
 *   done     the answer is complete
 *   error    it failed: a code (src/lib/ai/errors.ts) and wording safe to show
 *
 * Pure - no server-only import, and no import of the AI SDK - so the browser
 * can share it and it can be unit tested.
 */
export type AiStreamEvent =
  | { type: "status"; key: string }
  | { type: "text"; delta: string }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

export const AI_STREAM_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

/** One event as its line, newline included. */
export function encodeStreamEvent(event: AiStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/** One line back into its event; null for a blank or unreadable line. */
export function parseStreamLine(line: string): AiStreamEvent | null {
  const text = line.trim();
  if (text === "") return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  switch (event.type) {
    case "status":
      return typeof event.key === "string" ? { type: "status", key: event.key } : null;
    case "text":
      return typeof event.delta === "string" ? { type: "text", delta: event.delta } : null;
    case "done":
      return { type: "done" };
    case "error":
      return typeof event.code === "string" && typeof event.message === "string"
        ? { type: "error", code: event.code, message: event.message }
        : null;
    default:
      return null;
  }
}

/**
 * The complete lines in what has arrived so far, and what is left over (the
 * start of a line still on its way). Chunks do not arrive on line boundaries.
 */
export function splitStreamLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}
