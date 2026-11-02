import type { MediaLinkSource } from "./model";

/**
 * Supplementary media links: a Drive folder of practice audio, a video file,
 * any other page worth opening for a song. They open on their own site, in a
 * new tab. They are never played here and never join a Preparation Playlist -
 * nothing can be known about when a Drive preview has finished.
 */

/** The address made safe to store and link to, or null. Only https (http is upgraded). */
export function safeLinkUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:") return null;
  if (!url.hostname.includes(".") || url.username || url.password) return null;
  return url.toString();
}

/** Where a link leads, for its label. */
export function linkSource(url: string): MediaLinkSource {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (host === "drive.google.com" || host === "docs.google.com") return "google-drive";
  if (host === "youtu.be" || host.endsWith("youtube.com")) return "youtube";
  return "other";
}

export const LINK_SOURCE_LABELS: Record<MediaLinkSource, string> = {
  "google-drive": "Google Drive",
  youtube: "YouTube",
  other: "External site",
};
