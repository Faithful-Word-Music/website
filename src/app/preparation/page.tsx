import type { Metadata } from "next";
import Link from "next/link";

import { RecordingDisclaimer } from "@/components/recordings/RecordingNotes";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { recordingsContent } from "@/content/recordings";
import { getPreparation } from "@/lib/recordings/load";
import type { PlaylistService } from "@/lib/recordings/playlist";
import { catalogOf, playableRecording, resolveRecording, type RecordingCatalog } from "@/lib/recordings/resolve";

const copy = recordingsContent.preparation;

export const metadata: Metadata = {
  title: copy.metaTitle,
  description: copy.lead,
  alternates: { canonical: "/preparation" },
  openGraph: { title: `${copy.metaTitle} | ${siteConfig.name}`, description: copy.lead, url: `${siteConfig.url}/preparation` },
};

/**
 * Like the song list: rebuilt at most every five minutes, and at once when
 * the planner publishes or a recording changes. Built only from cached,
 * public data, so a visit never wakes the database.
 */
export const revalidate = 300;

/** Upcoming services, month by month, each with its own playlist. */
export default async function PreparationPage() {
  const data = await getPreparation();
  const catalog = catalogOf(data.recordings);

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow={copy.eyebrow} title={copy.title} className="max-w-2xl">
          <p className="text-base sm:text-lg">{copy.lead}</p>
        </SectionHeading>

        {!data.ok ? (
          <Notice body={copy.unavailable} />
        ) : data.months.length === 0 ? (
          <Notice body={copy.empty} />
        ) : (
          <div className="mt-10 space-y-10">
            {data.months.map((month) => (
              <section key={month.month} aria-labelledby={`month-${month.month}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 id={`month-${month.month}`} className="font-display text-2xl text-ink">
                    {month.title}
                  </h2>
                  <Link
                    href={`/preparation/${month.month}`}
                    className="text-sm font-medium text-ink underline decoration-gold/60 underline-offset-4 hover:text-gold-dark"
                  >
                    {copy.monthLink.replace("{month}", month.title)} →
                  </Link>
                </div>
                <Card className="mt-4">
                  <ul className="divide-y divide-line">
                    {month.services.map((service) => (
                      <ServiceRow key={service.id} service={service} month={month.month} catalog={catalog} />
                    ))}
                  </ul>
                </Card>
              </section>
            ))}
          </div>
        )}

        <RecordingDisclaimer className="mt-10 max-w-3xl" />
      </Container>
    </PageTransition>
  );
}

function ServiceRow({ service, month, catalog }: { service: PlaylistService; month: string; catalog: RecordingCatalog }) {
  const withRecordings = service.items.filter(
    (item) => playableRecording(resolveRecording(item.recordingSongId, item.selection, catalog)) !== null,
  ).length;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <p className="font-medium text-ink">{service.title}</p>
        <p className="text-sm text-muted">
          {service.dateLabel} · {copy.songs.replace("{count}", String(service.items.length))} ·{" "}
          {copy.withRecordings.replace("{count}", String(withRecordings))}
        </p>
      </div>
      <Link
        href={`/preparation/${month}/${service.id}`}
        className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-medium text-ink transition-colors hover:border-gold"
      >
        {copy.serviceLink}
      </Link>
    </li>
  );
}

function Notice({ body }: { body: string }) {
  return (
    <Card className="mt-10 p-8 text-center sm:p-12">
      <p className="mx-auto max-w-md text-muted">{body}</p>
    </Card>
  );
}
