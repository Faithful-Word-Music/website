import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SongLink } from "@/components/song-list/SongLink";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { StatTile } from "@/components/ui/StatTile";
import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { normalizeKey } from "@/lib/song-list";
import { getSongPage, type SongPlay } from "@/lib/song-archive";
import type { Companion } from "@/lib/song-history";
import {
  churchYear,
  formatAgo,
  formatChurchTime,
  formatDayDate,
  formatLongDate,
} from "@/lib/service-time";

const { songPage, serviceMarkerLabels } = songListContent;

/** Same cadence as the schedule and archive (siteConfig.songList.revalidateSeconds). */
export const revalidate = 10;

export async function generateMetadata({
  params,
}: PageProps<"/song-list/archive/[song]">): Promise<Metadata> {
  const { song } = await params;
  const data = await getSongPage(song);
  if (!data) return { title: songPage.notFoundTitle };

  const description = `${data.title}: sung ${data.plays.length} ${
    data.plays.length === 1 ? "time" : "times"
  } at ${siteConfig.church.name}.`;

  return {
    title: `${data.title} | ${songListContent.archive.title}`,
    description,
    alternates: { canonical: `/song-list/archive/${song}` },
  };
}

/**
 * One song's page: how often it has been sung, the keys it was sung in, any
 * services it is scheduled for, and every date it was sung.
 */
export default async function SongPage({ params }: PageProps<"/song-list/archive/[song]">) {
  const { song } = await params;
  const data = await getSongPage(song);
  if (!data) notFound();

  const { title, number, plays, upcoming, companions, loadedAt } = data;
  const last = plays[0];
  const first = plays[plays.length - 1];

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <Link
          href="/song-list/archive"
          className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <span aria-hidden="true">←</span>
          {songPage.backLabel}
        </Link>

        <SectionHeading
          as="h1"
          eyebrow={
            number ? songPage.numberEyebrow.replace("{number}", number) : songPage.fallbackEyebrow
          }
          title={title}
          className="mt-6 max-w-2xl"
        />

        <dl className="mt-10 grid grid-cols-3 gap-3 sm:gap-5">
          <StatTile label={songPage.stats.count} value={plays.length} />
          <StatTile
            label={songPage.stats.first}
            value={first ? formatLongDate(first.startsAt) : songPage.stats.none}
          />
          <StatTile
            label={songPage.stats.last}
            value={last ? formatLongDate(last.startsAt) : songPage.stats.none}
            detail={last ? capitalize(formatAgo(Date.parse(last.startsAt), loadedAt)) : null}
          />
        </dl>

        <KeysUsed plays={plays} />

        <Companions companions={companions} />

        {upcoming.length > 0 ? (
          <section aria-labelledby="coming-up" className="mt-12">
            <h2 id="coming-up" className="font-display text-2xl text-ink">
              {songPage.upcomingTitle}
            </h2>
            <Card barline className="mt-4">
              <PlayList plays={upcoming} />
            </Card>
          </section>
        ) : null}

        <section aria-labelledby="history" className="mt-12">
          <h2 id="history" className="font-display text-2xl text-ink">
            {songPage.historyTitle}
          </h2>
          {plays.length === 0 ? (
            <p className="mt-4 text-muted">{songPage.noHistory}</p>
          ) : (
            groupByYear(plays).map(([year, yearPlays]) => (
              <div key={year} className="mt-6">
                <h3 className="mb-2 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">
                  {year}
                </h3>
                <Card>
                  <PlayList plays={yearPlays} />
                </Card>
              </div>
            ))
          )}
        </section>
      </Container>
    </PageTransition>
  );
}

/**
 * The keys it has been sung in, most used first, with how many times each.
 * Here the counts are the point: "F 3×, Ab 3×" is what a musician wants.
 */
function KeysUsed({ plays }: { plays: SongPlay[] }) {
  const counts = new Map<string, { key: string; count: number }>();
  for (const play of plays) {
    if (!play.key) continue;
    const id = normalizeKey(play.key);
    const entry = counts.get(id) ?? { key: play.key.trim(), count: 0 };
    entry.count += 1;
    counts.set(id, entry);
  }
  const keys = [...counts.values()].sort((a, b) => b.count - a.count);
  if (keys.length === 0) return null;

  return (
    <section aria-labelledby="keys" className="mt-8">
      <h2
        id="keys"
        className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted"
      >
        {songPage.keysTitle}
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {keys.map((entry) => (
          <li
            key={entry.key}
            className="tnum rounded-md border border-line bg-surface px-2.5 py-1 text-sm font-medium text-ink"
          >
            {entry.key}
            <span className="ml-1.5 text-muted">
              {songPage.keyCount.replace("{count}", String(entry.count))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Songs habitually sung in the same service as this one. Most songs have
 * none, and then the section is left out entirely rather than shown empty.
 */
function Companions({ companions }: { companions: Companion[] }) {
  if (companions.length === 0) return null;

  return (
    <section aria-labelledby="companions" className="mt-12">
      <h2 id="companions" className="font-display text-2xl text-ink">
        {songPage.companionsTitle}
      </h2>
      <Card className="mt-4">
        <ul className="divide-y divide-line">
          {companions.map((companion) => (
            <li
              key={companion.id}
              className="flex items-baseline justify-between gap-4 px-5 py-3 sm:px-6"
            >
              <span className="min-w-0">
                <SongLink title={companion.title} className="block text-ink" />
                {companion.number ? (
                  <span className="tnum block text-xs text-muted">
                    {songPage.numberEyebrow.replace("{number}", companion.number)}
                  </span>
                ) : null}
              </span>
              <span className="tnum shrink-0 text-sm font-medium text-gold-dark">
                {songPage.togetherCount.replace("{count}", String(companion.together))}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** A list of services: the day, Morning/Evening and time, and the key. */
function PlayList({ plays }: { plays: SongPlay[] }) {
  return (
    <ul className="divide-y divide-line">
      {plays.map((play) => (
        <li
          key={`${play.startsAt}-${play.slot}`}
          className="flex items-baseline justify-between gap-4 px-5 py-3 sm:px-6"
        >
          <span className="min-w-0">
            <time dateTime={play.startsAt} className="block text-ink">
              {formatDayDate(play.startsAt)}
            </time>
            <span className="block text-xs text-muted">
              {serviceMarkerLabels[play.slot]} · {formatChurchTime(play.startsAt)}
            </span>
          </span>
          {play.key ? (
            <span className="tnum shrink-0 text-sm font-medium text-gold-dark">{play.key}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Newest year first, keeping each year's plays in the order given. */
function groupByYear(plays: SongPlay[]): Array<[number, SongPlay[]]> {
  const groups = new Map<number, SongPlay[]>();
  for (const play of plays) {
    const year = churchYear(Date.parse(play.startsAt));
    groups.set(year, [...(groups.get(year) ?? []), play]);
  }
  return [...groups.entries()];
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
