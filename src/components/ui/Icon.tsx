import { cn } from "./cn";

/**
 * The site's small line icons, drawn on a 16px grid in the text's own colour.
 * One stroke weight family: 1.3 by default, 1.5 for the header's controls.
 *
 * Add an icon here as one path (several subpaths in one `d` are fine) when a
 * second place needs it; a one-off can stay inline beside its only use.
 * Feature sets with their own vocabulary keep their own maps
 * (AdminSidebar's sections, the notification categories, the share menu).
 *
 * Always decorative (aria-hidden): the control or text beside it carries the
 * meaning, so an icon never needs a label of its own.
 */
export const ICON_PATHS = {
  search: "M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM11 11l3.5 3.5",
  close: "M3.5 3.5l9 9M12.5 3.5l-9 9",
  "chevron-down": "M4 6l4 4 4-4",
  "chevron-right": "M6 4l4 4-4 4",
  check: "M3.5 8.5l3 3 6-7",
  external: "M6.5 3.5h6v6M12.5 3.5 4 12",
  bell: "M4 11.5V7a4 4 0 0 1 8 0v4.5M2.5 11.5h11M6.5 13.5a1.6 1.6 0 0 0 3 0",
  music:
    "M6 12.5V4l6.5-1.5v8M6 12.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0ZM12.5 10.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0Z",
  headphones: "M2.5 11V8.5a5.5 5.5 0 0 1 11 0V11M2.5 10h2v3.5h-2zM11.5 10h2v3.5h-2z",
  edit: "M10 3l3 3-7.5 7.5H2.5v-3zM8.5 4.5l3 3",
  user: "M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 13.5c.4-2.5 2.3-4 5-4s4.6 1.5 5 4",
  calendar: "M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3",
  alert: "M8 2.5 14 13H2zM8 6.5v3M8 11.25v.01",
  info: "M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM8 7.5v3.5M8 5v.01",
  "check-circle": "M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM5.5 8.25l1.75 1.75L10.75 6.5",
  "alert-circle": "M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM8 5v3.5M8 10.75v.01",
  minus: "M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM5.5 8h5",
  clock: "M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM8 4.75V8l2.25 1.5",
  play: "M5 3.5v9l7.5-4.5z",
  file: "M4 1.5h5l3.5 3.5v9.5H4zM9 1.5V5h3.5M6 8.5h4.5M6 11h4.5",
  users: "M6 7.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5ZM1.75 13.5c.35-2.25 1.9-3.5 4.25-3.5s3.9 1.25 4.25 3.5M10.5 3.2a2.25 2.25 0 0 1 0 4.1M12 10.2c1.2.45 2 1.55 2.25 3.3",
  "arrow-right": "M3 8h10M9 4l4 4-4 4",
  device: "M5 1.5h6a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1ZM7 12.5h2",
  list: "M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01",
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.3,
  className,
}: {
  name: IconName;
  /** Rendered size in px; the drawing scales from its 16px grid. */
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={cn("shrink-0", className)}
    >
      <path d={ICON_PATHS[name]} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
