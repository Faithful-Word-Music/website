import { siteConfig } from "@/config/site";

/** "Sep 30, 2026" in church time, for admin lists. */
export function formatDate(value: string | number | null): string {
  if (value === null) return "–";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: siteConfig.songList.timeZone,
  });
}

/** "Sep 30, 2026, 4:05 PM" in church time. */
export function formatDateTime(value: string | number | null): string {
  if (value === null) return "–";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: siteConfig.songList.timeZone,
  });
}
