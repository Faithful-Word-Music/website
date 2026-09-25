import type { Metadata } from "next";

import { PrintButton } from "@/components/song-list/PrintButton";
import { SheetLink } from "@/components/song-list/SheetLink";
import { SongListError } from "@/components/song-list/SongListStates";
import { SongListView } from "@/components/song-list/SongListView";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { getScheduleData } from "@/lib/song-archive";

export const metadata: Metadata = {
  title: songListContent.title,
  description: songListContent.lead,
  alternates: { canonical: "/song-list" },
  openGraph: {
    title: `${songListContent.title} | ${siteConfig.name}`,
    description: songListContent.lead,
    url: `${siteConfig.url}/song-list`,
  },
};

/**
 * Re-render at most every 10 seconds (siteConfig.songList.revalidateSeconds), so
 * an edit in Google Sheets reaches the site within seconds, without a rebuild or
 * a redeploy. Which service is
 * "Next" does not depend on this: the browser works that out live.
 */
export const revalidate = 10;

export default async function SongListPage() {
  const { result, plays, loadedAt } = await getScheduleData();

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14 print:max-w-none print:p-0">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between print:hidden">
          <SectionHeading
            as="h1"
            eyebrow={siteConfig.name}
            title={songListContent.title}
            className="max-w-2xl"
          >
            <p className="text-base sm:text-lg">{songListContent.lead}</p>
          </SectionHeading>

          <div className="flex shrink-0 flex-wrap gap-3">
            {/* Only when there is a schedule to print. */}
            {result.ok && result.months.length > 0 ? <PrintButton /> : null}
            <SheetLink />
          </div>
        </div>

        <div className="mt-12 print:mt-0">
          {result.ok ? (
            result.months.length > 0 ? (
              <SongListView months={result.months} plays={plays} serverNow={loadedAt} />
            ) : (
              <SongListError reason="unavailable" />
            )
          ) : (
            <SongListError reason={result.reason} />
          )}
        </div>
      </Container>
    </PageTransition>
  );
}
