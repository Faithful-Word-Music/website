import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  MostSung,
  KeyChart,
  MonthChart,
  plural,
  RecapFacts,
  RecapLead,
} from "@/components/song-list/YearRecapView";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { getYearRecapData } from "@/lib/song-archive";

const { yearRecap: copy } = songListContent;

/** Same cadence as the archive (siteConfig.songList.revalidateSeconds). */
export const revalidate = 10;

/** "2026" -> 2026; anything that is not a plain four-digit year -> null. */
function readYear(value: string): number | null {
  return /^\d{4}$/.test(value) ? Number(value) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/song-list/year/[year]">): Promise<Metadata> {
  const { year: value } = await params;
  const year = readYear(value);
  const data = year === null ? null : await getYearRecapData(year);
  if (!data?.ok || !data.recap) return { title: copy.notFoundTitle };

  const { recap } = data;
  const title = copy.metaTitle.replace("{year}", String(recap.year));
  const description = `${plural(copy.songs, recap.songsSung)} in ${plural(copy.services, recap.services)} at ${siteConfig.church.name}: the most sung hymns, the keys and the months of ${recap.year}.`;

  return {
    title,
    description,
    alternates: { canonical: `/song-list/year/${recap.year}` },
    openGraph: {
      title: `${title} | ${siteConfig.name}`,
      description,
      url: `${siteConfig.url}/song-list/year/${recap.year}`,
    },
  };
}

/**
 * A year of singing: how much was sung, the most sung hymns, the months and
 * keys, and a few smaller findings - all from the song archive.
 */
export default async function YearRecapPage({ params }: PageProps<"/song-list/year/[year]">) {
  const { year: value } = await params;
  const year = readYear(value);
  if (year === null) notFound();

  const data = await getYearRecapData(year);
  if (data.ok && !data.recap) notFound();

  const previous = data.ok ? data.years.filter((other) => other < year).at(-1) : undefined;
  const next = data.ok ? data.years.find((other) => other > year) : undefined;

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <Link
          href="/song-list/archive"
          className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <span aria-hidden="true">←</span>
          {copy.backLabel}
        </Link>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            as="h1"
            eyebrow={copy.eyebrow}
            title={copy.title.replace("{year}", String(year))}
          />
          <nav aria-label="Years" className="flex gap-2">
            <YearLink year={previous} direction="previous" />
            <YearLink year={next} direction="next" />
          </nav>
        </div>

        {!data.ok || !data.recap ? (
          <Card className="mt-12 p-8 text-center sm:p-12">
            <h2 className="font-display text-xl text-ink sm:text-2xl">{copy.errorTitle}</h2>
            <p className="mx-auto mt-3 max-w-md text-muted">{copy.errorBody}</p>
          </Card>
        ) : (
          <>
            <div className="mt-8">
              <RecapLead recap={data.recap} />
            </div>

            <div className="mt-12">
              <MostSung songs={data.recap.topSongs} />
            </div>

            <div className="mt-8 grid gap-5 lg:grid-cols-[3fr_2fr] lg:gap-6">
              <MonthChart months={data.recap.months} busiest={data.recap.busiestMonths} />
              <KeyChart keys={data.recap.keys} />
            </div>

            <div className="mt-8">
              <RecapFacts recap={data.recap} />
            </div>
          </>
        )}
      </Container>
    </PageTransition>
  );
}

/** Previous/next year, or an empty space holder so the other keeps its place. */
function YearLink({ year, direction }: { year: number | undefined; direction: "previous" | "next" }) {
  const base =
    "inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-medium tnum";
  const arrow = direction === "previous" ? "←" : "→";

  if (year === undefined) {
    return (
      <span aria-hidden="true" className={`${base} border-line text-staff`}>
        {arrow}
      </span>
    );
  }

  const label = (direction === "previous" ? copy.previousYear : copy.nextYear).replace(
    "{year}",
    String(year),
  );
  return (
    <Link
      href={`/song-list/year/${year}`}
      aria-label={label}
      className={`${base} border-line bg-surface text-ink transition-colors hover:border-gold`}
    >
      {direction === "previous" ? (
        <>
          <span aria-hidden="true">{arrow}</span>
          {year}
        </>
      ) : (
        <>
          {year}
          <span aria-hidden="true">{arrow}</span>
        </>
      )}
    </Link>
  );
}
