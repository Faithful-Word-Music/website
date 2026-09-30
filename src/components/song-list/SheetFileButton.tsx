import { buttonClasses } from "@/components/ui/Button";
import { songListContent } from "@/content/song-list";
import type { SheetFormat } from "@/lib/sheet-music";

const { sheetMusic: copy } = songListContent.songPage;

function PdfIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path
        d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5L9.5 1.5ZM9.5 1.5V5H13M5.5 8.5h5M5.5 11h5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One file's button: "View PDF" (filled, opens in a new tab) or "Download
 * MuseScore" (outlined). Shared by the public list and the members' one, so
 * both look the same. No hooks, so it works on either side.
 */
export function SheetFileButton({ format, href }: { format: SheetFormat; href: string }) {
  return format === "pdf" ? (
    <a href={href} target="_blank" rel="noopener" className={buttonClasses("primary")}>
      <PdfIcon />
      {copy.viewPdf}
      <span className="sr-only">{copy.newTab}</span>
    </a>
  ) : (
    <a href={href} download title={copy.museScoreHint} className={buttonClasses("secondary")}>
      <DownloadIcon />
      {copy.downloadMuseScore}
    </a>
  );
}
