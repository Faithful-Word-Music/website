import type { Metadata } from "next";

import { SongIndex } from "@/components/library/SongIndex";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { libraryContent } from "@/content/library";
import { getLibraryData } from "@/lib/song-archive";

export const metadata: Metadata = {
  title: libraryContent.metaTitle,
  description: libraryContent.lead,
  alternates: { canonical: "/library" },
  openGraph: {
    title: `${libraryContent.metaTitle} | ${siteConfig.name}`,
    description: libraryContent.lead,
    url: `${siteConfig.url}/library`,
  },
};

/**
 * Songs scheduled for the first time appear straight away, so the Library
 * refreshes on the same cadence as the schedule and the archive
 * (siteConfig.songList.revalidateSeconds).
 */
export const revalidate = 10;

/**
 * The Library: every song with a page, A-Z. Each kind of resource gets its
 * own section here - songs for now, with audio and the like to follow.
 */
export default async function LibraryPage() {
  const data = await getLibraryData();

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow={siteConfig.name} title={libraryContent.title} className="max-w-2xl">
          <p className="text-base sm:text-lg">{libraryContent.lead}</p>
        </SectionHeading>

        {/* Songs are the Library's only section for now; audio and the like will sit beside it. */}
        <section aria-labelledby="songs" className="mt-10">
          <h2 id="songs" className="sr-only">
            {libraryContent.songsTitle}
          </h2>

          {!data.ok ? (
            <Notice title={libraryContent.errorTitle} body={libraryContent.errorBody} />
          ) : data.songs.length === 0 ? (
            <Notice title={libraryContent.emptyTitle} body={libraryContent.emptyBody} />
          ) : (
            <SongIndex songs={data.songs} />
          )}
        </section>
      </Container>
    </PageTransition>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-8 text-center sm:p-12">
      <h3 className="font-display text-xl text-ink sm:text-2xl">{title}</h3>
      <p className="mx-auto mt-3 max-w-md text-muted">{body}</p>
    </Card>
  );
}
