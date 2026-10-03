import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";
import { CheckIcon, Spinner } from "./StatusIcons";
import type { ActionState } from "./use-action";

type Variant = "primary" | "secondary" | "quiet";
type Size = "md" | "lg";

/**
 * Shared button styling.
 *
 * Note on colour: gold is 3.1:1 on paper, which fails AA for text, so it is
 * never a text or fill colour here. Filled buttons use ink; gold appears only
 * as a hover border. See the contrast notes in globals.css.
 *
 * Hover and press styles are all `not-disabled:`, so a disabled button does
 * nothing under the pointer: it dims and shows the not-allowed cursor.
 */
export function buttonClasses(variant: Variant, size: Size = "md", className?: string) {
  return cn(
    // min-h keeps touch targets comfortable on mobile
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-medium",
    // The site's default easing (globals.css), plus a small give when pressed.
    "transition-[color,background-color,border-color,text-decoration-color,box-shadow,transform,opacity] not-disabled:active:scale-[0.97]",
    // A button at work (data-busy, below) is disabled too, but is not dimmed.
    "disabled:cursor-not-allowed not-data-busy:disabled:opacity-60",
    size === "lg" ? "px-7 text-base" : "px-5 text-sm",
    variant === "primary" &&
      "bg-ink text-paper not-disabled:hover:bg-ink-soft not-disabled:active:bg-ink-soft",
    variant === "secondary" &&
      "border border-line bg-surface text-ink not-disabled:hover:border-gold",
    variant === "quiet" &&
      "text-ink underline decoration-transparent underline-offset-4 not-disabled:hover:text-gold-dark not-disabled:hover:decoration-current",
    className,
  );
}

/**
 * `state` is for a button that runs an action (`useAction`): while it works
 * it shows a spinner and `pendingLabel` ("Saving…"), then a tick and
 * `doneLabel` ("Saved") for a moment. It cannot be pressed in either, but
 * stays at full strength - it is the busy one, not a dimmed neighbour.
 */
export function Button({
  variant = "primary",
  size = "md",
  className,
  state = "idle",
  pendingLabel,
  doneLabel,
  disabled,
  children,
  ...props
}: ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  state?: ActionState;
  pendingLabel?: ReactNode;
  doneLabel?: ReactNode;
}) {
  const busy = state !== "idle";
  return (
    <button
      className={buttonClasses(variant, size, className)}
      disabled={disabled || busy}
      data-busy={busy || undefined}
      aria-busy={state === "pending" || undefined}
      {...props}
    >
      {busy ? (
        // The resting label stays in place, unseen, so the button never gets narrower.
        <span className="inline-grid justify-items-center [&>*]:col-start-1 [&>*]:row-start-1">
          <span aria-hidden="true" className="invisible inline-flex items-center gap-2">
            {children}
          </span>
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            {state === "pending" ? <Spinner /> : <CheckIcon />}
            {(state === "pending" ? pendingLabel : doneLabel) ?? children}
          </span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
