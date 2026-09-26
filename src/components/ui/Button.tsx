import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

type Variant = "primary" | "secondary" | "quiet";
type Size = "md" | "lg";

/**
 * Shared button styling.
 *
 * Note on colour: gold is 3.1:1 on paper, which fails AA for text, so it is
 * never a text or fill colour here. Filled buttons use ink; gold appears only
 * as a hover border. See the contrast notes in globals.css.
 */
export function buttonClasses(variant: Variant, size: Size = "md", className?: string) {
  return cn(
    // min-h keeps touch targets comfortable on mobile
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-medium",
    // The site's default easing (globals.css), plus a small give when pressed.
    "transition-[color,background-color,border-color,box-shadow,transform] active:scale-[0.97]",
    "disabled:cursor-not-allowed disabled:opacity-60",
    size === "lg" ? "px-7 text-base" : "px-5 text-sm",
    variant === "primary" &&
      "bg-ink text-paper hover:bg-ink-soft active:bg-ink-soft",
    variant === "secondary" &&
      "border border-line bg-surface text-ink hover:border-gold hover:bg-white",
    variant === "quiet" && "text-ink underline-offset-4 hover:text-gold-dark hover:underline",
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
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
