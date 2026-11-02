import type { RecordingProviderId } from "./model";

/**
 * Where playable recordings may come from. A provider is listed here only
 * once the site can control its official embedded player: start it, notice
 * when a recording has finished, and go on to the next. YouTube's IFrame
 * Player API does all three. Anything else - a Drive file, a Rumble video
 * until its player has been checked - is a MediaLink (links.ts), opened on
 * its own site and never played here.
 *
 * Only addresses are accepted, never pasted embed HTML: the site builds the
 * player itself from the provider's media ID.
 */
export interface RecordingProvider {
  id: RecordingProviderId;
  label: string;
  /** The media ID and a clean address for it, or null when the address is not this provider's. */
  parse(url: string): { mediaId: string; canonicalUrl: string } | null;
  /** Whether Preparation Playlists can play it one after another. */
  playlistCapable: boolean;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

function parseUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** A YouTube video's ID from any of the addresses YouTube gives out. */
export function youtubeId(input: string): string | null {
  const url = parseUrl(input);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    const [, first, second] = url.pathname.split("/");
    if (first === "watch") id = url.searchParams.get("v");
    else if (first === "shorts" || first === "embed" || first === "live" || first === "v") id = second ?? null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

export const youtube: RecordingProvider = {
  id: "youtube",
  label: "YouTube",
  playlistCapable: true,
  parse(input) {
    const mediaId = youtubeId(input);
    return mediaId ? { mediaId, canonicalUrl: `https://www.youtube.com/watch?v=${mediaId}` } : null;
  },
};

export const PROVIDERS: Record<RecordingProviderId, RecordingProvider> = { youtube };

/** The provider an address belongs to, and its media, or null when no supported provider plays it. */
export function parseRecordingUrl(input: string): { provider: RecordingProvider; mediaId: string; canonicalUrl: string } | null {
  for (const provider of Object.values(PROVIDERS)) {
    const parsed = provider.parse(input);
    if (parsed) return { provider, ...parsed };
  }
  return null;
}

export function providerLabel(id: RecordingProviderId): string {
  return PROVIDERS[id]?.label ?? id;
}

export function isPlaylistCapable(id: RecordingProviderId): boolean {
  return PROVIDERS[id]?.playlistCapable === true;
}
