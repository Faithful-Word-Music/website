import type { Metadata } from "next";
import Link from "next/link";

import { ArchiveView } from "@/components/song-list/ArchiveView";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { getArchiveData } from "@/lib/song-archive";

const { archive } = songListContent;

export const metadata: Metadata = {
  title: archive.title,
  description: archive.lead,
  alternates: { canonical: "/song-list/archive" },
  openGraph: {
    title: `${archive.title} | ${siteConfig.name}`,
    description: archive.lead,
    url: `${siteConfig.url}/song-list/archive`,
  },
};

/**
 * The archive includes the sheet's services straight away (not only once the
 * nightly sync has stored them), so it refreshes on the same 10-second cadence
 * as the schedule (siteConfig.songList.revalidateSeconds). The database read
 * behind it is cached for an hour.
 */
export const revalidate = 10;

export default async function SongArchivePage() {
  const data = await getArchiveData();

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <Link
          href="/song-list"
          className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <span aria-hidden="true">←</span>
          {archive.backLabel}
        </Link>

        <SectionHeading
          as="h1"
          eyebrow={siteConfig.name}
          title={archive.title}
          className="mt-6 max-w-2xl"
        >
          <p className="text-base sm:text-lg">{archive.lead}</p>
        </SectionHeading>

        {data.ok && data.records.length > 0 ? (
          <Link href="/song-list/year" className={buttonClasses("secondary", "md", "group mt-6 px-6")}>
            {songListContent.yearRecap.linkLabel}
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        ) : null}

        <div className="mt-12">
          {!data.ok ? (
            <Notice title={archive.errorTitle} body={archive.errorBody} />
          ) : data.records.length === 0 ? (
            <Notice title={archive.emptyTitle} body={archive.emptyBody} />
          ) : (
            <ArchiveView
              records={data.records}
              serviceCount={data.serviceCount}
              since={data.since}
              serverNow={data.loadedAt}
            />
          )}
        </div>
      </Container>
    </PageTransition>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-8 text-center sm:p-12">
      <h2 className="font-display text-xl text-ink sm:text-2xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-muted">{body}</p>
    </Card>
  );
}
