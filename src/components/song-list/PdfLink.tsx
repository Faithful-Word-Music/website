"use client";

import { useActiveMonth } from "@/components/song-list/active-month";
import { songListContent } from "@/content/song-list";
import { monthPdfPath } from "@/lib/song-list-pdf";

/**
 * Opens the open month as a PDF in a new tab (see SongListPdf), where the
 * browser's PDF viewer offers print and download. A generated PDF prints the
 * same on every device, which the browser's own printing of the page did not.
 *
 * `months` lists each tab's title, or null for a tab with no schedule to lay
 * out; the link hides itself on those.
 */
export function PdfLink({ months }: { months: Array<string | null> }) {
  const { activeIndex } = useActiveMonth();
  const title = months[activeIndex];
  if (!title) return null;

  return (
    <a
      href={monthPdfPath(title)}
      target="_blank"
      rel="noopener"
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink transition-colors hover:border-gold hover:bg-white"
    >
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path
          d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5L9.5 1.5ZM9.5 1.5V5H13M5.5 8.5h5M5.5 11h5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {songListContent.pdfLabel}
      <span className="sr-only"> (PDF, opens in a new tab)</span>
    </a>
  );
}
