import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * Section heading with a "rehearsal mark" eyebrow - the small boxed label
 * engravers print above a bar to mark a section of a score.
 */
export function SectionHeading({
  eyebrow,
  title,
  as: Tag = "h2",
  align = "left",
  className,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  as?: "h1" | "h2" | "h3";
  align?: "left" | "center";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn(align === "center" && "text-center", className)}>
      {eyebrow ? <RehearsalMark align={align}>{eyebrow}</RehearsalMark> : null}
      <Tag
        className={cn(
          "text-balance font-display text-ink",
          Tag === "h1"
            ? "text-4xl sm:text-5xl lg:text-6xl"
            : "text-3xl sm:text-4xl",
        )}
      >
        {title}
      </Tag>
      {children ? (
        <div
          className={cn(
            "mt-5 space-y-4 text-lg leading-relaxed text-muted",
            align === "center" && "mx-auto max-w-2xl",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** The boxed label itself, also usable on its own. */
export function RehearsalMark({
  children,
  align = "left",
  className,
}: {
  children: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <p className={cn("mb-4", align === "center" && "flex justify-center", className)}>
      <span className="inline-block border border-line bg-surface px-2.5 py-1 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">
        {children}
      </span>
    </p>
  );
}
