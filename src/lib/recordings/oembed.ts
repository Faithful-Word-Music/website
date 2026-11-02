import "server-only";

/**
 * What YouTube says about a video, through its public oEmbed endpoint (no
 * API key): its title and channel, to fill in the attribution, and whether it
 * can be embedded at all. A private, removed or embed-disabled video is
 * refused before it is ever saved. When YouTube cannot be reached the
 * recording may still be added by hand - the player will report a problem if
 * there is one.
 */

export type OembedResult =
  | { ok: true; title: string; authorName: string | null }
  | { ok: false; reason: "not-found" | "not-embeddable" | "unreachable" };

export async function youtubeOembed(canonicalUrl: string): Promise<OembedResult> {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalUrl)}`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    // 401/403: private, or its owner turned embedding off. 400/404: no such video.
    if (response.status === 401 || response.status === 403) return { ok: false, reason: "not-embeddable" };
    if (response.status === 400 || response.status === 404) return { ok: false, reason: "not-found" };
    if (!response.ok) return { ok: false, reason: "unreachable" };
    const body = (await response.json()) as { title?: unknown; author_name?: unknown };
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    const authorName = typeof body.author_name === "string" ? body.author_name.trim().slice(0, 120) : "";
    return { ok: true, title: title || "YouTube video", authorName: authorName || null };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
