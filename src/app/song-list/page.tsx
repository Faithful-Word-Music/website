import type { Metadata } from "next";

import { SheetLink } from "@/components/song-list/SheetLink";
import { SongListError } from "@/components/song-list/SongListStates";
import { SongListView } from "@/components/song-list/SongListView";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { getSongList } from "@/lib/google-sheets";

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
 * Re-render at most once a minute, so an edit in Google Sheets reaches the site
 * within about 60 seconds without a rebuild or a redeploy.
 */
export const revalidate = 60;

export default async function SongListPage() {
  const result = await getSongList();

  return (
    <PageTransition>
      <Container className="py-14 sm:py-20">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            as="h1"
            eyebrow={siteConfig.church.shortName}
            title={songListContent.title}
            className="max-w-2xl"
          >
            <p className="text-base sm:text-lg">{songListContent.lead}</p>
          </SectionHeading>

          <div className="shrink-0">
            <SheetLink />
          </div>
        </div>

        <div className="mt-12">
          {result.ok ? (
            result.months.length > 0 ? (
              <SongListView months={result.months} />
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
