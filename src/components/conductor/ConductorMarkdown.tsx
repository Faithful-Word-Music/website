import { Fragment, memo } from "react";

import { parseMarkdown, type Inline } from "@/lib/ai/conductor/markdown";

function Inlines({ content }: { content: Inline[] }) {
  return content.map((inline, index) => {
    switch (inline.type) {
      case "strong":
        return (
          <strong key={index} className="font-semibold text-ink">
            {inline.text}
          </strong>
        );
      case "em":
        return <em key={index}>{inline.text}</em>;
      case "code":
        return (
          <code key={index} className="rounded bg-paper px-1 py-0.5 text-[0.9em]">
            {inline.text}
          </code>
        );
      default:
        return <Fragment key={index}>{inline.text}</Fragment>;
    }
  });
}

/**
 * One of Conductor's answers, drawn from the light Markdown it writes
 * (src/lib/ai/conductor/markdown.ts). Only the site's own elements are ever
 * produced - an answer cannot put HTML, a link or an image on the page.
 */
export const ConductorMarkdown = memo(function ConductorMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-3 break-words text-[0.95rem] leading-relaxed text-ink-soft">
      {parseMarkdown(text).map((block, index) => {
        switch (block.type) {
          case "heading":
            // Never a real heading: an answer is not part of the page's outline.
            return (
              <p key={index} className="pt-1 font-display text-lg text-ink">
                <Inlines content={block.content} />
              </p>
            );
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List key={index} className={block.ordered ? "list-decimal space-y-1 pl-5 marker:text-muted" : "list-disc space-y-1 pl-5 marker:text-gold"}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="pl-1">
                    <Inlines content={item} />
                  </li>
                ))}
              </List>
            );
          }
          case "quote":
            return (
              <blockquote key={index} className="border-l-2 border-gold pl-4 text-ink">
                <Inlines content={block.content} />
              </blockquote>
            );
          case "table":
            return (
              // Scrolls on its own, so a wide table never widens the panel.
              <div key={index} className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-line bg-paper">
                      {block.head.map((cell, cellIndex) => (
                        <th key={cellIndex} scope="col" className="whitespace-nowrap px-3 py-2 font-medium text-ink">
                          <Inlines content={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="tnum px-3 py-2 align-top">
                            <Inlines content={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "code":
            return (
              <pre key={index} className="overflow-x-auto rounded-lg border border-line bg-paper p-3 text-sm">
                <code>{block.text}</code>
              </pre>
            );
          default:
            return (
              <p key={index}>
                <Inlines content={block.content} />
              </p>
            );
        }
      })}
    </div>
  );
});
