"use client";

import { songListContent } from "@/content/song-list";

/**
 * Opens the browser's print dialog. What prints is the sheet-style layout in
 * PrintSchedule, for whichever month tab is open.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink transition-colors hover:border-gold hover:bg-white"
    >
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path
          d="M4 6V2h8v4M4 12H2.5A1 1 0 0 1 1.5 11V7a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H12M4 9.5h8V14H4z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
      {songListContent.printLabel}
    </button>
  );
}
