import type { Metadata } from "next";
import Link from "next/link";

import { PreparationPlayer } from "@/components/recordings/PreparationPlayer";
import { ShareLinkButton } from "@/components/recordings/ShareLinkButton";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { recordingsContent } from "@/content/recordings";
import { getPreparation } from "@/lib/recordings/load";

const copy = recordingsContent.preparation;

/** See /playlists. */
export const revalidate = 300;

/** No month is built ahead; each is kept once visited and refreshed with the schedule. */
export function generateStaticParams(): Array<{ month: string }> {
  return [];
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

async function findMonth(value: string) {
  if (!MONTH.test(value)) return null;
  const data = await getPreparation();
  const month = data.months.find((entry) => entry.month === value) ?? null;
  return month ? { month, recordings: data.recordings } : null;
}

export async function generateMetadata({ params }: PageProps<"/playlists/[month]">): Promise<Metadata> {
  const { month } = await params;
  const found = await findMonth(month);
  if (!found) return { title: copy.metaTitle, robots: { index: false } };
  const title = copy.monthTitle.replace("{month}", found.month.title);
  return {
    title,
    description: copy.lead,
    alternates: { canonical: `/playlists/${month}` },
    openGraph: { title: `${title} | ${siteConfig.name}`, description: copy.lead, url: `${siteConfig.url}/playlists/${month}` },
  };
}

/** One month's Preparation Playlist: every upcoming published service, in order. */
export default async function PreparationMonthPage({ params }: PageProps<"/playlists/[month]">) {
  const { month } = await params;
  const found = await findMonth(month);

  return (
    <PageTransition>
      {/* overflow-x-clip: nothing (the phone's edge-to-edge video included) can make the page pan sideways. Clip, not hidden, so the video can still stick. */}
      <Container size="wide" className="overflow-x-clip pb-28 pt-6 sm:pb-20 sm:pt-8">
        <BackLink fallback="/playlists" />
        {found ? (
          <>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <SectionHeading
                as="h1"
                size="compact"
                eyebrow={copy.title}
                title={copy.monthTitle.replace("{month}", found.month.title)}
              >
                <p className="text-base">{copy.lead}</p>
              </SectionHeading>
              <ShareLinkButton
                url={`${siteConfig.url}/playlists/${month}`}
                title={copy.monthTitle.replace("{month}", found.month.title)}
                className="shrink-0 self-start sm:self-auto"
              />
            </div>
            <PreparationPlayer
              className="mt-6"
              recordings={found.recordings}
              sections={found.month.services.map((service) => ({
                id: service.id,
                title: service.title,
                subtitle: service.dateLabel,
                href: `/playlists/${month}/${service.id}`,
                items: service.items,
              }))}
            />
          </>
        ) : (
          <Ended />
        )}
      </Container>
    </PageTransition>
  );
}

/**
 * A month with nothing left to come - its services have all happened, or it
 * was never published. Not an error: the link was shared and has run its course.
 */
function Ended() {
  return (
    <Card className="mt-8 p-8 text-center sm:p-12">
      <p className="mx-auto max-w-md text-muted">{copy.expired}</p>
      <Link href="/playlists" className="mt-4 inline-block text-sm font-medium text-ink underline decoration-gold/60 underline-offset-4">
        {copy.allMonths}
      </Link>
    </Card>
  );
}
