/**
 * The installed app (see src/lib/install.ts) runs without a browser's tabs,
 * address bar or reload button, so on phones and tablets it gets two things
 * a browser would otherwise give (src/components/app/InstalledApp.tsx):
 *   - PDFs open in the site's own viewer, with Close and Save or share. On an
 *     iPhone a "new tab" PDF otherwise fills the app with no way out but a
 *     swipe and no way to keep it.
 *   - Pulling down at the top of a page reloads it.
 * The pure parts are here.
 */

/** The site's PDFs: one sheet-music file, a service's sheet music, a month's song list. */
const PDF_PATHS = [
  /^\/library\/songs\/[^/]+\/sheet-music\/[^/]+\.pdf$/i,
  /^\/dashboard\/sheet-music\/[^/]+$/,
  /^\/song-list\/pdf\/[^/]+$/,
];

/** Whether a link to this path opens one of the site's PDFs. */
export function isPdfPath(pathname: string): boolean {
  return PDF_PATHS.some((pattern) => pattern.test(pathname));
}

/**
 * The file name a PDF route gives in its Content-Disposition header, preferring
 * the UTF-8 form (`filename*=UTF-8''...`), or null when there is none.
 */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // Malformed; fall back to the plain name.
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"/i.exec(header) ?? /filename\s*=\s*([^;]+)/i.exec(header);
  const name = plain?.[1].trim();
  return name ? name : null;
}

/** How far (in CSS pixels, after damping) the page must be pulled down to reload. */
export const PULL_THRESHOLD = 70;

/** The farthest the pull indicator travels. */
export const PULL_MAX = 110;

/** A finger's travel turned into the indicator's: it moves at half speed and stops at PULL_MAX. */
export function pullDistance(fingerTravel: number): number {
  return Math.max(0, Math.min(fingerTravel * 0.5, PULL_MAX));
}
