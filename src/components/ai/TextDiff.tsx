import { cn } from "@/components/ui/cn";
import type { DiffPart } from "@/lib/ai/planning/revisions";

/**
 * How one text became another, in place: what was added is marked, what was
 * taken out is struck through, and the rest reads as it always did
 * (diffText in src/lib/ai/planning/revisions.ts). Used wherever a change to
 * the planning philosophy is shown before or after it is applied.
 *
 * Not colour alone: an addition is underlined and a removal struck through,
 * and each is a real <ins> or <del> for a screen reader.
 */
export function TextDiff({ parts, className }: { parts: readonly DiffPart[]; className?: string }) {
  return (
    <div className={cn("whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft", className)}>
      {parts.map((part, index) =>
        part.type === "same" ? (
          <span key={index}>{part.text}</span>
        ) : part.type === "add" ? (
          <ins
            key={index}
            className="rounded-[3px] bg-[color-mix(in_srgb,var(--color-gold)_24%,transparent)] text-ink underline decoration-gold decoration-1 underline-offset-2"
          >
            {part.text}
          </ins>
        ) : (
          <del key={index} className="text-muted line-through decoration-[color-mix(in_srgb,var(--color-ink)_45%,transparent)]">
            {part.text}
          </del>
        ),
      )}
    </div>
  );
}
