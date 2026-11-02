import type { Metadata } from "next";
import Link from "next/link";

import { PreparationPlayer } from "@/components/recordings/PreparationPlayer";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { recordingsContent } from "@/content/recordings";
import { getPreparation } from "@/lib/recordings/load";

const copy = recordingsContent.preparation;

/** See /preparation. */
export const revalidate = 300;

export function generateStaticParams(): Array<{ month: string; service: string }> {
  return [];
}

async function findService(month: string, anchor: string) {
  const data = await getPreparation();
  const entry = data.months.find((item) => item.month === month);
  const service = entry?.services.find((item) => item.id === anchor) ?? null;
  return service ? { service, recordings: data.recordings } : null;
}

export async function generateMetadata({ params }: PageProps<"/preparation/[month]/[service]">): Promise<Metadata> {
  const { month, service } = await params;
  const found = await findService(month, service);
  if (!found) return { title: copy.metaTitle, robots: { index: false } };
  const title = `${found.service.title} — ${found.service.dateLabel}`;
  return {
    title: `${title} | ${copy.metaTitle}`,
    description: copy.lead,
    alternates: { canonical: `/preparation/${month}/${service}` },
    openGraph: { title: `${title} | ${siteConfig.name}`, description: copy.lead, url: `${siteConfig.url}/preparation/${month}/${service}` },
  };
}

/** One upcoming service's playlist, in the order its songs will be sung. */
export default async function PreparationServicePage({ params }: PageProps<"/preparation/[month]/[service]">) {
  const { month, service: anchor } = await params;
  const found = await findService(month, anchor);

  return (
    <PageTransition>
      <Container size="wide" className="pb-28 pt-6 sm:pb-20 sm:pt-8">
        <BackLink fallback={`/preparation/${month}`} />
        {found ? (
          <>
            <SectionHeading as="h1" size="compact" eyebrow={found.service.dateLabel} title={found.service.title} className="mt-4" />
            <PreparationPlayer
              className="mt-6"
              recordings={found.recordings}
              sections={[{ id: found.service.id, title: copy.order, items: found.service.items }]}
            />
          </>
        ) : (
          <Card className="mt-8 p-8 text-center sm:p-12">
            <p className="mx-auto max-w-md text-muted">{copy.expired}</p>
            <Link href="/preparation" className="mt-4 inline-block text-sm font-medium text-ink underline decoration-gold/60 underline-offset-4">
              {copy.allMonths}
            </Link>
          </Card>
        )}
      </Container>
    </PageTransition>
  );
}
