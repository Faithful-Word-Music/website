import type { ReactNode } from "react";

import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";

/**
 * A notice: something the page wants the person to know, in one consistent
 * shape - an icon in a tinted tile, a title, a line or two of explanation,
 * and its actions. Used for the profile notice, setup prompts, "couldn't be
 * loaded" messages and empty states, so they all read as one family.
 *
 *   neutral  uncertainty or emptiness: couldn't be checked, nothing yet
 *   info     a note, nothing required
 *   success  done, confirmed - sparingly
 *   warning  needs doing, with a date or a consequence
 *   danger   blocked: required now
 *
 * The words carry the meaning and the tone reinforces it: every tone has
 * its own icon, and the title says what is going on. Colour only ever
 * tints - the text stays ink on the surface, so contrast holds in both
 * themes. Built on the status tokens in globals.css; no new colours.
 *
 * `compact` is the one-line row (a setup prompt, a panel's "couldn't load").
 * `dismiss` is a slot for a close button - leave it out for anything that
 * must stay (a required profile).
 *
 * Semantics are the caller's: pass `role="status"` for something that
 * appears in response to an action, `role="alert"` only for an error the
 * person must hear now, and `label` to make it a named region. Static
 * notices need neither - they are read in place.
 */
export type NoticeTone = "neutral" | "info" | "success" | "warning" | "danger";

const ICONS: Record<NoticeTone, IconName> = {
  neutral: "minus",
  info: "info",
  success: "check-circle",
  warning: "clock",
  danger: "alert-circle",
};

const FRAME: Record<NoticeTone, string> = {
  neutral: "border-line bg-surface",
  info: "border-line bg-surface",
  success: "border-[color-mix(in_srgb,var(--color-success)_22%,var(--color-line))] bg-surface",
  warning:
    "border-[color-mix(in_srgb,var(--color-warning)_28%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-warning-bg)_55%,var(--color-surface))]",
  danger:
    "border-[color-mix(in_srgb,var(--color-danger)_40%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-danger-bg)_70%,var(--color-surface))]",
};

const TILE: Record<NoticeTone, string> = {
  neutral: "bg-paper text-muted",
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
};

export function Notice({
  tone = "info",
  title,
  children,
  icon,
  actions,
  dismiss,
  compact = false,
  role,
  label,
  id,
  className,
}: {
  tone?: NoticeTone;
  title: ReactNode;
  /** The explanation, and anything else under the title (a list of what is missing). */
  children?: ReactNode;
  /** Another icon than the tone's own. */
  icon?: IconName;
  /** Buttons or links: at the right from `sm`, under the text on a phone. */
  actions?: ReactNode;
  /** A small close button, top right. */
  dismiss?: ReactNode;
  compact?: boolean;
  role?: "status" | "alert";
  /** Names it as a region (it becomes a <section>). */
  label?: string;
  id?: string;
  className?: string;
}) {
  const Tag = label ? "section" : "div";
  return (
    <Tag
      id={id}
      role={role}
      aria-label={label}
      className={cn(
        "relative flex min-w-0 gap-3.5 rounded-card border shadow-card",
        compact ? "px-4 py-3.5" : "px-4 py-4 sm:gap-4 sm:px-5 sm:py-5",
        FRAME[tone],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("grid shrink-0 place-items-center rounded-control", compact ? "size-8" : "size-9", TILE[tone])}
      >
        <Icon name={icon ?? ICONS[tone]} size={compact ? 16 : 18} strokeWidth={1.5} />
      </span>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
          dismiss ? "pr-8" : null,
        )}
      >
        <div className={cn("min-w-0", compact ? "pt-1 sm:pt-0" : "pt-1.5 sm:pt-1")}>
          <p className={cn("text-ink", compact ? "text-[0.95rem] font-medium leading-snug" : "font-display text-lg leading-snug sm:text-xl")}>
            {title}
          </p>
          {children ? (
            <div className={cn("text-sm leading-relaxed text-ink-soft", compact ? "mt-0.5" : "mt-1")}>{children}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">{actions}</div> : null}
      </div>
      {dismiss ? <div className="absolute right-2 top-2">{dismiss}</div> : null}
    </Tag>
  );
}

/** The small × a dismissible notice puts in its `dismiss` slot. */
export function NoticeDismiss({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink"
    >
      <Icon name="close" size={14} strokeWidth={1.5} />
    </button>
  );
}
