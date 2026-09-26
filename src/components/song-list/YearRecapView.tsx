import Link from "next/link";
import type { ReactNode } from "react";

import { MoreSongs } from "@/components/song-list/MoreSongs";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { songListContent } from "@/content/song-list";
import { churchMonth, formatDayDate, formatLongDate } from "@/lib/service-time";
import { songSlug } from "@/lib/song-list";
import { ONCE_EXAMPLES, type RecapSong, type YearRecap } from "@/lib/year-recap";

const { yearRecap: copy } = songListContent;

/** "{count} songs", choosing the singular or plural form. */
export function plural(forms: readonly [string, string], count: number): string {
  return forms[count === 1 ? 0 : 1].replace("{count}", count.toLocaleString("en-US"));
}

const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
const monthLetter = new Intl.DateTimeFormat("en-US", { month: "narrow", timeZone: "UTC" });
const nameOfMonth = (month: number) => monthName.format(Date.UTC(2000, month, 1));
/** "May and August" */
const listFormat = new Intl.ListFormat("en-US", { type: "conjunction" });

/** A gap in days as people say it: "3 weeks", "5 months", "2 years". */
function formatGap(days: number): string {
  if (days < 14) return `${days} days`;
  if (days < 63) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30.44)} months`;
  return `${Math.round(days / 365.25)} years`;
}

const songHref = (song: RecapSong) => `/song-list/archive/${songSlug(song.title)}`;

/** The opening sentence: the year's size in words, in the display face. */
export function RecapLead({ recap }: { recap: YearRecap }) {
  const lead =
    recap.partial === "in-progress"
      ? copy.leadInProgress
      : recap.partial === "records-began"
        ? copy.leadRecordsBegan
        : copy.leadFull;

  return (
    <div className="max-w-3xl">
      <p className="font-display text-2xl leading-snug text-ink sm:text-3xl sm:leading-snug">
        <span className="tnum">
          {lead
            .replace("{year}", String(recap.year))
            .replace("{month}", `${nameOfMonth(churchMonth(Date.parse(recap.from)))} ${recap.year}`)
            .replace("{songs}", plural(copy.songs, recap.songsSung))
            .replace("{services}", plural(copy.services, recap.services))}{" "}
          {copy.leadDetail
            .replace("{different}", plural(copy.different, recap.differentSongs))
            .replace("{hymns}", recap.differentHymns.toLocaleString("en-US"))}
        </span>
      </p>
      <p className="mt-3 text-sm text-muted">
        {copy.range
          .replace("{from}", formatLongDate(recap.from))
          .replace("{to}", formatLongDate(recap.to))}
      </p>
    </div>
  );
}

/**
 * The most sung songs, laid out like the songs on a service card: hymn
 * number, title, key - plus how many times it was sung.
 */
export function MostSung({ songs }: { songs: YearRecap["topSongs"] }) {
  return (
    <Card barline className="px-5 py-5 sm:px-7 sm:py-6">
      <h2 className="font-display text-xl text-ink sm:text-2xl">{copy.board.title}</h2>
      <p className="mt-1 text-sm text-muted">{copy.board.caption}</p>
      <ol className="mt-4 border-t border-line">
        {songs.map((song) => (
          <li key={song.id} className="border-b border-line last:border-b-0">
            <Link
              href={songHref(song)}
              className="group grid grid-cols-[2.75rem_1fr_auto_auto] items-baseline gap-x-3 py-2.5 sm:grid-cols-[3rem_1fr_auto_5.5rem]"
            >
              <span className="tnum text-sm font-medium text-muted sm:text-base">
                {song.number ?? <span aria-hidden="true">·</span>}
              </span>
              <span className="min-w-0 text-[0.95rem] leading-snug text-ink decoration-gold underline-offset-4 group-hover:underline sm:text-base">
                {song.title}
              </span>
              <span className="tnum hidden whitespace-nowrap text-right text-sm font-medium text-gold-dark sm:block sm:text-base">
                {song.key ?? ""}
              </span>
              <span className="tnum whitespace-nowrap text-right text-sm text-muted">
                {plural(copy.board.times, song.count)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Songs per month as columns. Unrecorded months are a faint dashed stub, not a zero. */
export function MonthChart({ months, busiest }: { months: YearRecap["months"]; busiest: number[] }) {
  const max = Math.max(1, ...months.map((count) => count ?? 0));

  return (
    <ChartCard title={copy.months.title} caption={copy.months.caption}>
      {/* The picture, for sighted readers; the table below carries the same figures. */}
      <div aria-hidden="true" className="mt-6 grid h-44 grid-cols-12 items-end gap-[2px] border-b border-staff">
        {months.map((count, month) => (
          <div key={month} className="group relative flex h-full flex-col justify-end px-[2px]">
            {count === null ? (
              <div className="h-1 border-t border-dashed border-staff" />
            ) : (
              <>
                {busiest.includes(month) ? (
                  <span className="tnum mb-1 text-center text-xs font-medium text-ink">{count}</span>
                ) : null}
                <div
                  className="rounded-t-[4px] bg-gold transition-colors group-hover:bg-gold-dark"
                  style={{ height: `${(count / max) * 100}%`, minHeight: count > 0 ? 2 : 0 }}
                />
              </>
            )}
            {/* Hover tooltip, sitting above the column's hit area. */}
            <span
              className={cn(
                "pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap",
                // Anchored inward at the ends, so it never pokes past the card on a phone.
                month < 2 ? "left-0" : month > 9 ? "right-0" : "left-1/2 -translate-x-1/2",
                " rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-paper opacity-0 transition-opacity group-hover:opacity-100",
              )}
            >
              {count === null
                ? `${nameOfMonth(month)}: ${copy.months.unrecorded}`
                : copy.months.tooltip
                    .replace("{month}", nameOfMonth(month))
                    .replace("{count}", plural(copy.songs, count))}
            </span>
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-2 grid grid-cols-12 text-center text-xs text-muted">
        {months.map((_, month) => (
          <span key={month}>{monthLetter.format(Date.UTC(2000, month, 1))}</span>
        ))}
      </div>

      <table className="sr-only">
        <caption>{copy.months.caption}</caption>
        <tbody>
          {months.map((count, month) => (
            <tr key={month}>
              <th scope="row">{nameOfMonth(month)}</th>
              <td>{count === null ? copy.months.unrecorded : plural(copy.songs, count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartCard>
  );
}

/** Keys by use, as bars with their counts beside them; "others" in grey. */
export function KeyChart({ keys }: { keys: YearRecap["keys"] }) {
  const max = Math.max(1, ...keys.map((entry) => entry.count));

  return (
    <ChartCard title={copy.keys.title} caption={copy.keys.caption}>
      <ul className="mt-5 space-y-[2px]">
        {keys.map((entry) => (
          <li key={entry.key} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3 py-1 text-sm">
            <span className={cn("truncate", entry.other ? "text-muted" : "font-medium text-ink")}>
              {entry.key}
            </span>
            <span aria-hidden="true" className="h-3.5">
              <span
                className={cn("block h-full rounded-r-[4px]", entry.other ? "bg-staff" : "bg-gold")}
                style={{ width: `${(entry.count / max) * 100}%` }}
              />
            </span>
            <span className="tnum text-right text-muted">{entry.count}</span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

function ChartCard({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-7">
      <h2 className="font-display text-xl text-ink sm:text-2xl">{title}</h2>
      <p className="mt-1 text-sm text-muted">{caption}</p>
      {children}
    </Card>
  );
}

/** The smaller findings: favourites, the longest wait, the first song, the busiest month. */
export function RecapFacts({ recap }: { recap: YearRecap }) {
  const { facts } = copy;
  const items: Array<{ label: string; song?: RecapSong; value?: string; detail: string }> = [];

  const { AM, PM } = recap.favourites;
  if (AM) items.push({ label: facts.morning, song: AM, detail: plural(facts.timesSung, AM.count) });
  if (PM) items.push({ label: facts.evening, song: PM, detail: plural(facts.timesSung, PM.count) });
  if (recap.longestWait) {
    items.push({
      label: facts.welcomeBack,
      song: recap.longestWait,
      detail: facts.welcomeBackDetail
        .replace("{date}", formatDayDate(recap.longestWait.after))
        .replace("{time}", formatGap(recap.longestWait.days)),
    });
  }
  if (recap.firstSong) {
    items.push({ label: facts.firstSong, song: recap.firstSong, detail: formatDayDate(recap.firstSong.startsAt) });
  }
  const [busiest] = recap.busiestMonths;
  if (busiest !== undefined) {
    items.push({
      label: plural(facts.busiestMonth, recap.busiestMonths.length),
      value: listFormat.format(recap.busiestMonths.map(nameOfMonth)),
      detail: facts.busiestDetail.replace(
        "{count}",
        plural(copy.songs, recap.months[busiest] ?? 0),
      ),
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label} className="flex flex-col px-5 py-5 sm:px-6">
          <h3 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">
            {item.label}
          </h3>
          <p className="mt-2 font-display text-xl leading-snug text-ink">
            {item.song ? (
              <Link href={songHref(item.song)} className="decoration-gold underline-offset-4 hover:underline">
                {item.song.number ? <span className="tnum text-gold-dark">{item.song.number} </span> : null}
                {item.song.title}
              </Link>
            ) : (
              item.value
            )}
          </p>
          <p className="mt-auto pt-1 text-sm text-muted">{item.detail}</p>
        </Card>
      ))}

      {recap.once.length > 0 ? (
        <Card className="px-5 py-5 sm:col-span-2 sm:px-6 lg:col-span-3">
          <h3 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">
            {facts.once}
          </h3>
          <p className="mt-2 text-sm text-muted">{plural(facts.onceDetail, recap.once.length)}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {recap.once.slice(0, ONCE_EXAMPLES).map((song) => (
              <li key={song.id}>
                <Link
                  href={songHref(song)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-paper px-3.5 text-sm text-ink transition-colors hover:border-gold"
                >
                  {song.number ? <span className="tnum text-gold-dark">{song.number}</span> : null}
                  {song.title}
                </Link>
              </li>
            ))}
            {recap.once.length > ONCE_EXAMPLES ? (
              <li>
                <MoreSongs songs={recap.once.slice(ONCE_EXAMPLES)} />
              </li>
            ) : null}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
