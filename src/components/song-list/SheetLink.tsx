import { buttonClasses } from "@/components/ui/Button";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";

/**
 * Direct link to the original public spreadsheet. Shown prominently on the
 * page and repeated in every error state, so there is always a route to the
 * schedule even when the site cannot render it.
 */
export function SheetLink({ variant = "solid" }: { variant?: "solid" | "quiet" }) {
  const base =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors";

  return (
    <ExternalLink
      href={siteConfig.songList.spreadsheetUrl}
      showIcon
      className={
        variant === "solid"
          ? buttonClasses("secondary")
          : `${base} text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark`
      }
    >
      {songListContent.sheetLinkLabel}
    </ExternalLink>
  );
}
