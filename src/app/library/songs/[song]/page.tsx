import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SongSections } from "@/components/song-list/MemberSheetMusic";
import { AboutSong, SheetMusic } from "@/components/song-list/SheetMusic";
import { SongCapoSetting } from "@/components/song-list/SongCapoSetting";
import { SongLink } from "@/components/song-list/SongLink";
import { SongDetails, SongTimeline, StatBand } from "@/components/song-list/SongStats";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { getSongPage, type SongPlay } from "@/lib/song-archive";
import type { Companion } from "@/lib/song-history";
import { churchYear, formatChurchTime, formatDayDate } from "@/lib/service-time";
import { songPath } from "@/lib/song-list";

const { songPage, serviceMarkerLabels } = songListContent;

/** Same cadence as the schedule and archive (siteConfig.songList.revalidateSeconds). */
export const revalidate = 10;

export async function generateMetadata({
  params,
}: PageProps<"/library/songs/[song]">): Promise<Metadata> {
  const { song } = await params;
  const data = await getSongPage(song);
  if (!data) return { title: songPage.notFoundTitle };

  const description = `${data.title}: sung ${data.plays.length} ${
    data.plays.length === 1 ? "time" : "times"
  } at ${siteConfig.church.name}.`;

  return {
    title: `${data.title} | ${songListContent.archive.title}`,
    description,
    alternates: { canonical: songPath(song) },
  };
}

/**
 * One song's page: how often it has been sung, the keys it was sung in, any
 * services it is scheduled for, and every date it was sung.
 */
export default async function SongPage({ params }: PageProps<"/library/songs/[song]">) {
  const { song } = await params;
  const data = await getSongPage(song);
  if (!data) notFound();

  const { title, number, plays, upcoming, companions, stats, sheetMusic, loadedAt } = data;

  return (
    <PageTransition>
      <Container className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <BackLink fallback="/library" skipSongPages />

        <SectionHeading
          as="h1"
          eyebrow={
            number ? songPage.numberEyebrow.replace("{number}", number) : songPage.fallbackEyebrow
          }
          title={title}
          className="mt-6 max-w-2xl"
        />

        {/*
          What most visitors come for sits first: the sheet music whenever this
          visitor can open it (members' files included, once a member is
          known), then the song's details. When they can't, the details lead
          and the short "not available publicly" note follows them.
        */}
        {sheetMusic ? (
          <SongSections
            publicFiles={sheetMusic.available}
            membersFiles={sheetMusic.membersOnly}
            sheet={<SheetMusic music={sheetMusic} title={title} className="" />}
            about={<AboutSong music={sheetMusic} className="" />}
            className="mt-10"
          />
        ) : null}

        {/* For people who look after the sheet music only; nothing for anyone else. */}
        <SongCapoSetting title={title} number={number} className="mt-10" />

        {sheetMusic ? (
          <h2 id="singing" className="mt-12 font-display text-2xl text-ink">
            {songPage.statsTitle}
          </h2>
        ) : null}
        <StatBand
          stats={stats}
          loadedAt={loadedAt}
          upcoming={upcoming.length}
          className={sheetMusic ? "mt-4" : "mt-10"}
        />
        <div className="mt-5">
          <SongTimeline stats={stats} loadedAt={loadedAt} />
        </div>
        <SongDetails stats={stats} loadedAt={loadedAt} />

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
