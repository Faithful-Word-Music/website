/**
 * Conductor's answers arrive as light Markdown. This reads the little of it
 * the answers use - paragraphs, headings, lists, quotes, tables, bold,
 * italics and code - into plain data for ConductorMarkdown to draw. There is
 * no HTML in or out: anything not recognised is shown as the text it is, and
 * a link keeps only its words.
 *
 * Pure - unit tested.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "code"; text: string };

export type Block =
  | { type: "paragraph"; content: Inline[] }
  | { type: "heading"; level: 1 | 2 | 3; content: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; content: Inline[] }
  | { type: "table"; head: Inline[][]; rows: Inline[][][] }
  | { type: "code"; text: string };

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|\[[^\]\n]+\]\([^)\s]+\))/g;

export function parseInline(text: string): Inline[] {
  const result: Inline[] = [];
  const push = (inline: Inline) => {
    const last = result.at(-1);
    if (inline.type === "text" && last?.type === "text") last.text += inline.text;
    else if (inline.text !== "") result.push(inline);
  };

  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    push({ type: "text", text: text.slice(index, match.index) });
    if (token.startsWith("`")) push({ type: "code", text: token.slice(1, -1) });
    else if (token.startsWith("**") || token.startsWith("__")) push({ type: "strong", text: token.slice(2, -2) });
    else if (token.startsWith("*")) push({ type: "em", text: token.slice(1, -1) });
    // A link: its words only. Conductor has nothing to link to.
    else push({ type: "text", text: token.slice(1, token.indexOf("](")) });
    index = match.index + token.length;
  }
  push({ type: "text", text: text.slice(index) });
  return result;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
// A ">" on its own or before a space: never ">=" or the like at the start of a line.
const QUOTE = /^\s*>(?:\s+(.*))?$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const FENCE = /^\s*```/;

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => parseInline(cell.trim()));

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) body.push(lines[index++]);
      index += 1;
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: Math.min(3, heading[1].length) as 1 | 2 | 3, content: parseInline(heading[2].trim()) });
      index += 1;
      continue;
    }

    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[index + 1] ?? "")) {
      const head = cells(line);
      const rows: Inline[][][] = [];
      index += 2;
      while (index < lines.length && TABLE_ROW.test(lines[index])) rows.push(cells(lines[index++]));
      blocks.push({ type: "table", head, rows });
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index])) quoted.push((QUOTE.exec(lines[index++])?.[1] ?? "").trim());
      blocks.push({ type: "quote", content: parseInline(quoted.filter(Boolean).join(" ")) });
      continue;
    }

    const ordered = NUMBERED.test(line);
    if (ordered || BULLET.test(line)) {
      const pattern = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (index < lines.length) {
        const item = pattern.exec(lines[index]);
        if (item) items.push(item[1]);
        // An indented line under an item continues it.
        else if (items.length > 0 && /^\s{2,}\S/.test(lines[index]) && !BULLET.test(lines[index]) && !NUMBERED.test(lines[index])) {
          items[items.length - 1] += ` ${lines[index].trim()}`;
        } else break;
        index += 1;
      }
      blocks.push({ type: "list", ordered, items: items.map((item) => parseInline(item.trim())) });
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !FENCE.test(lines[index]) &&
      !HEADING.test(lines[index]) &&
      !BULLET.test(lines[index]) &&
      !NUMBERED.test(lines[index]) &&
      !QUOTE.test(lines[index]) &&
      !(TABLE_ROW.test(lines[index]) && TABLE_RULE.test(lines[index + 1] ?? ""))
    ) {
      paragraph.push(lines[index++].trim());
    }
    blocks.push({ type: "paragraph", content: parseInline(paragraph.join(" ")) });
  }

  return blocks;
}
