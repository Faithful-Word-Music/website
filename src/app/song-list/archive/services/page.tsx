import type { Metadata } from "next";

import { ArchiveSwitch } from "@/components/song-list/ArchiveSwitch";
import { ServiceArchiveView } from "@/components/song-list/ServiceArchiveView";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { toArchive } from "@/lib/service-archive";
import { loadPast } from "@/lib/song-archive";

const copy = songListContent.serviceArchive;

export const metadata: Metadata = {
  title: copy.title,
  description: copy.lead,
  alternates: { canonical: "/song-list/archive/services" },
  openGraph: {
    title: `${copy.title} | ${siteConfig.name}`,
    description: copy.lead,
    url: `${siteConfig.url}/song-list/archive/services`,
  },
};

/** As fresh as the song archive beside it (siteConfig.songList.revalidateSeconds). */
export const revalidate = 10;

/**
 * /song-list/archive/services - every past service as a complete song list:
 * the same history as the song archive, seen service by service. Public, like
 * the song list it records; the Service Planner's Archive section opens here.
 */
export default async function ServiceArchivePage() {
  const history = await loadPast();
  const services = history ? toArchive(history.past) : null;

  return (
    <PageTransition>
      <Container size="wide" className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <BackLink fallback="/song-list/archive" />
        <SectionHeading as="h1" eyebrow={siteConfig.name} title={copy.title} className="mt-6 max-w-2xl">
          <p className="text-base sm:text-lg">{copy.lead}</p>
        </SectionHeading>

        <div className="mt-10">
          <ArchiveSwitch />
        </div>

        <div className="mt-10">
          {!services ? (
            <Message title={copy.errorTitle} body={copy.errorBody} />
          ) : services.length === 0 ? (
            <Message title={copy.emptyTitle} body={copy.emptyBody} />
          ) : (
            <ServiceArchiveView services={services} />
          )}
        </div>
      </Container>
    </PageTransition>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-8 text-center sm:p-12">
      <h2 className="font-display text-xl text-ink sm:text-2xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-muted">{body}</p>
    </Card>
  );
}
