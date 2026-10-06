/**
 * How a notification's time is written: "Just now", "5 min ago", "3 hr ago",
 * "Yesterday", "4 days ago", then the date. Pure - `now` is passed in - so it
 * is unit tested.
 */

import { siteConfig } from "@/config/site";
import { notificationsContent } from "@/content/notifications";
import { plural } from "@/lib/plural";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const { timeZone } = siteConfig.songList;
const sameYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone });
const otherYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
const yearOf = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone });

export function relativeTime(iso: string, now: number): string {
  const copy = notificationsContent.time;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  // A clock a little behind the server's must not read as the future.
  const elapsed = Math.max(0, now - then);

  if (elapsed < MINUTE) return copy.now;
  if (elapsed < HOUR) return plural(copy.minutes, Math.floor(elapsed / MINUTE));
  if (elapsed < DAY) return plural(copy.hours, Math.floor(elapsed / HOUR));
  if (elapsed < 2 * DAY) return copy.yesterday;
  if (elapsed < 7 * DAY) return plural(copy.days, Math.floor(elapsed / DAY));
  return (yearOf.format(then) === yearOf.format(now) ? sameYear : otherYear).format(then);
}
