import type { ReactNode } from "react";

import { ChartCard, formatGap, plural } from "@/components/song-list/YearRecapView";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { songListContent } from "@/content/song-list";
import { keySignature, type KeySignature } from "@/lib/key-signature";
import { churchMonth, churchYear, formatAgo, formatLongDate } from "@/lib/service-time";
import {
  HABIT_SHARE,
  RECENT_WITHIN,
  REGULAR_SERVICES,
  type Role,
  type SongStats,
  type WeeklyService,
} from "@/lib/song-stats";

const { songPage: copy } = songListContent;

const ROLES: Role[] = ["opener", "middle", "closer"];

const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const monthLetter = new Intl.DateTimeFormat("en-US", { month: "narrow", timeZone: "UTC" });

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const labelClasses =
  "font-sans text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted sm:text-[0.7rem]";

/**
 * The song at a glance: times sung, first and last sung, in one panel. On a
 * phone the count takes the whole top row and the two dates share the one
 * below, so a date never has to break across lines.
 */
export function StatBand({
  stats,
  loadedAt,
  upcoming,
  className = "mt-10",
}: {
  stats: SongStats;
  loadedAt: number;
  upcoming: number;
  className?: string;
}) {
  const details: string[] = [];
  if (stats.count > 0) {
    details.push(
      copy.stats.services
        .replace("{count}", stats.services.toLocaleString("en-US"))
        .replace("{total}", stats.servicesTotal.toLocaleString("en-US")),
    );
  }
  if (stats.rank) {
    details.push(
      (stats.rank.joint ? copy.stats.jointRank : copy.stats.rank).replace("{position}", String(stats.rank.position)),
    );
  } else if (stats.count === 1) {
    details.push(copy.stats.once);
  } else if (stats.count === 0 && upcoming > 0) {
    details.push(copy.stats.scheduledOnly);
  }

  return (
    <Card className={className}>
      <dl className="grid grid-cols-2 sm:grid-cols-3">
        <div className="col-span-2 border-b border-line px-5 py-5 sm:col-span-1 sm:border-b-0 sm:border-r sm:px-6">
          <dt className={labelClasses}>{copy.stats.count}</dt>
          <dd className="tnum mt-1.5 font-display text-5xl leading-none text-ink sm:text-4xl">{stats.count}</dd>
          {details.length > 0 ? (
            <dd className="mt-2.5 space-y-0.5 text-sm text-muted">
              {details.map((detail) => (
                <span key={detail} className="tnum block">
                  {detail}
                </span>
              ))}
            </dd>
          ) : null}
        </div>
        <DateCell label={copy.stats.first} at={stats.first} className="border-r border-line" />
        <DateCell
          label={copy.stats.last}
          at={stats.last}
          detail={stats.last ? capitalize(formatAgo(Date.parse(stats.last), loadedAt)) : null}
        />
      </dl>
    </Card>
  );
}

function DateCell({
  label,
  at,
  detail,
  className,
}: {
  label: string;
  at: string | null;
  detail?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 px-5 py-4 sm:px-6 sm:py-5", className)}>
      <dt className={labelClasses}>{label}</dt>
      <dd className="tnum mt-1.5 whitespace-nowrap font-display text-xl text-ink sm:text-2xl lg:text-3xl">
        {at ? formatLongDate(at) : copy.stats.none}
      </dd>
      {detail ? <dd className="mt-1 text-sm text-muted">{detail}</dd> : null}
    </div>
  );
}

/** Dots stacked per month; past this many, the month shows its number instead. */
const MAX_DOTS = 5;

/**
 * Month by month since records began: a filled dot for each time it was
 * sung, a ring for each service it is scheduled for.
 */
export function SongTimeline({ stats, loadedAt }: { stats: SongStats; loadedAt: number }) {
  const { timeline } = stats;
  const last = timeline.length - 1;
  // Tall enough for the busiest month's dots, and never so short the strip looks empty.
  const rows = Math.min(MAX_DOTS, Math.max(2, ...timeline.map((cell) => cell.sung + cell.upcoming)));
  const height = 0.75 + rows * 1;
  const nowYear = churchYear(loadedAt);
  const nowMonth = churchMonth(loadedAt);
  const describe = (cell: SongStats["timeline"][number]) => {
    const parts = [
      cell.sung > 0 ? plural(copy.timeline.sung, cell.sung) : null,
      cell.upcoming > 0 ? plural(copy.timeline.upcoming, cell.upcoming) : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : copy.timeline.none;
  };
  const nameOf = (cell: SongStats["timeline"][number]) => monthYear.format(Date.UTC(cell.year, cell.month, 1));

  return (
    <ChartCard
      title={copy.timeline.title}
      caption={stats.timelineClipped ? copy.timeline.clippedCaption : copy.timeline.caption}
    >
      <div aria-hidden="true" className="mt-6">
        <div
          className="grid items-end border-b border-staff"
          style={{ gridTemplateColumns: `repeat(${timeline.length}, minmax(0, 1fr))`, height: `${height}rem` }}
        >
          {timeline.map((cell, index) => {
            const isNow = cell.year === nowYear && cell.month === nowMonth;
            const total = cell.sung + cell.upcoming;
            return (
              <div
                key={`${cell.year}-${cell.month}`}
                className={cn(
                  "group relative flex h-full flex-col-reverse items-center gap-[3px] pb-1.5",
                  isNow && "rounded-t-md bg-line/60",
                )}
              >
                {total > MAX_DOTS ? (
                  <>
                    <Dot filled={cell.sung > 0} />
                    <span className="tnum text-[0.65rem] font-semibold text-gold-dark">{total}</span>
                  </>
                ) : (
                  <>
                    {Array.from({ length: cell.sung }, (_, dot) => (
                      <Dot key={`s${dot}`} filled />
                    ))}
                    {Array.from({ length: cell.upcoming }, (_, dot) => (
                      <Dot key={`u${dot}`} filled={false} />
                    ))}
                  </>
                )}
                <span
                  className={cn(
                    "pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-paper opacity-0 transition-opacity group-hover:opacity-100",
                    // Anchored inward at the ends, so it never pokes past the card on a phone.
                    index < 3 ? "left-0" : index > last - 3 ? "right-0" : "left-1/2 -translate-x-1/2",
                  )}
                >
                  {copy.timeline.tooltip.replace("{month}", nameOf(cell)).replace("{detail}", describe(cell))}
                </span>
              </div>
            );
          })}
        </div>
        <div
          className="mt-1.5 grid text-center text-[0.65rem] text-muted sm:text-xs"
          style={{ gridTemplateColumns: `repeat(${timeline.length}, minmax(0, 1fr))` }}
        >
          {timeline.map((cell) => (
            <span key={`${cell.year}-${cell.month}`}>{monthLetter.format(Date.UTC(cell.year, cell.month, 1))}</span>
          ))}
        </div>
        {/* The year, under its first month on the strip. */}
        <div
          className="mt-0.5 grid text-[0.65rem] font-semibold text-gold-dark sm:text-xs"
          style={{ gridTemplateColumns: `repeat(${timeline.length}, minmax(0, 1fr))` }}
        >
          {timeline.map((cell, index) => (
            <span key={`${cell.year}-${cell.month}`} className="tnum overflow-visible whitespace-nowrap">
              {cell.month === 0 || (index === 0 && cell.month < 10) ? cell.year : ""}
            </span>
          ))}
        </div>
      </div>

      {/* sr-only on the table itself would not hold: a table grows to fit its cells. */}
      <div className="sr-only">
        <table>
          <caption>{copy.timeline.caption}</caption>
          <tbody>
            {timeline.map((cell) => (
              <tr key={`${cell.year}-${cell.month}`}>
                <th scope="row">{nameOf(cell)}</th>
                <td>{describe(cell)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

function Dot({ filled }: { filled: boolean }) {
  return (
    <span
      className={cn(
        "block size-2.5 shrink-0 rounded-full sm:size-3",
        filled ? "bg-gold" : "border-2 border-gold bg-transparent",
      )}
    />
  );
}

/**
 * The smaller cards under the timeline: how often it comes round, where it
 * falls in the service, its keys, and which services of the week. Each is left out when
 * there is too little to say, and the grid closes up around it.
 */
export function SongDetails({ stats, loadedAt }: { stats: SongStats; loadedAt: number }) {
  const cards = [
    stats.rhythm ? <Rhythm key="rhythm" stats={stats} loadedAt={loadedAt} /> : null,
    stats.placement.opener + stats.placement.middle + stats.placement.closer > 0 ? (
      <Placement key="placement" stats={stats} />
    ) : null,
    stats.keys.length > 0 ? <Keys key="keys" stats={stats} /> : null,
    stats.count > 0 ? <WeeklyServices key="weekly" stats={stats} /> : null,
  ].filter((card) => card !== null);
  if (cards.length === 0) return null;

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 sm:gap-5">
      {cards.map((card, index) => (
        <div key={card.key} className={cn(cards.length % 2 === 1 && index === cards.length - 1 && "sm:col-span-2")}>
          {card}
        </div>
      ))}
    </div>
  );
}

function DetailCard({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex h-full flex-col px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className={labelClasses}>{title}</h2>
        {aside}
      </div>
      {children}
    </Card>
  );
}

/** The usual gap between times sung, against how long it has been. */
function Rhythm({ stats, loadedAt }: { stats: SongStats; loadedAt: number }) {
  const rhythm = stats.rhythm!;
  // The track runs to twice the usual gap: the marker sits in the middle.
  const fill = Math.min(1, rhythm.sinceDays / (rhythm.medianDays * 2));

  return (
    <DetailCard
      title={copy.rhythm.title}
      aside={
        rhythm.status ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
              rhythm.status === "due" ? "bg-gold text-paper" : "border border-gold/60 text-gold-dark",
            )}
          >
            {copy.rhythm.status[rhythm.status]}
          </span>
        ) : null
      }
    >
      <p className="mt-2 font-display text-2xl leading-snug text-ink">
        {copy.rhythm.usually.replace("{gap}", formatGap(Math.round(rhythm.medianDays)))}
      </p>
      <p className="mt-1 text-sm text-muted">
        {copy.rhythm.since.replace("{ago}", formatAgo(Date.parse(stats.last!), loadedAt))}
      </p>

      <div aria-hidden="true" className="relative mt-5 h-2 rounded-full bg-line">
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            rhythm.sinceDays < rhythm.medianDays * RECENT_WITHIN ? "bg-staff" : "bg-gold",
          )}
          style={{ width: `${Math.max(fill * 100, 4)}%` }}
        />
        <span className="absolute -top-1 left-1/2 h-4 w-0.5 -translate-x-1/2 rounded-full bg-ink" />
      </div>

      <p className="mt-auto pt-4 text-xs text-muted">
        {copy.rhythm.longest.replace("{gap}", formatGap(rhythm.longestDays))}
      </p>
    </DetailCard>
  );
}

/** Opening song, somewhere in the middle, or closing song - and whether that is a habit. */
function Placement({ stats }: { stats: SongStats }) {
  const { placement } = stats;
  const placed = placement.opener + placement.middle + placement.closer;

  let headline: string = copy.placement.none;
  let share: string | null = null;
  if (stats.count === 1) {
    const role = ROLES.find((candidate) => placement[candidate] > 0)!;
    headline = copy.placement.single[role];
  } else if (placement.habit) {
    const count = placement[placement.habit];
    if (count === placed) {
      headline =
        placed === 2
          ? copy.placement.alwaysTwo[placement.habit]
          : copy.placement.always[placement.habit].replace("{count}", String(placed));
    } else {
      headline = copy.placement.habit[placement.habit];
      share = copy.placement.share.replace("{count}", String(count)).replace("{total}", String(placed));
    }
  }

  return (
    <DetailCard title={copy.placement.title}>
      <p className="mt-2 font-display text-2xl leading-snug text-ink">{headline}</p>
      {share ? <p className="tnum mt-1 text-sm text-muted">{share}</p> : null}

      {/* The service in order, first song to last. */}
      <CountBoxes
        items={ROLES.map((role) => ({
          id: role,
          label: copy.placement.labels[role],
          count: placement[role],
          active: placement.habit === role || (stats.count === 1 && placement[role] > 0),
        }))}
      />
    </DetailCard>
  );
}

/**
 * The keys it was sung in. The main key - if there is one - gets its key
 * signature and scale on a staff; several keys also get bars.
 */
function Keys({ stats }: { stats: SongStats }) {
  const { keys } = stats;
  const total = keys.reduce((sum, entry) => sum + entry.count, 0);
  const max = Math.max(1, ...keys.map((entry) => entry.count));
  const [top] = keys;
  const main = keys.length === 1 || top.count / total >= HABIT_SHARE ? top : null;
  const signature = main ? keySignature(main.key) : null;

  const headline =
    keys.length === 1
      ? copy.keysAlways.replace("{key}", top.key)
      : main
        ? copy.keysMostly.replace("{key}", main.key)
        : copy.keysMany.replace("{count}", String(keys.length));

  return (
    <DetailCard title={copy.keysTitle}>
      <p className="mt-2 font-display text-2xl leading-snug text-ink">{headline}</p>
      {signature ? <p className="mt-1 text-sm text-muted">{describeSignature(signature)}</p> : null}

      {signature ? (
        <div className="mt-auto pt-5">
          <Staff signature={signature} />
        </div>
      ) : null}

      {keys.length > 1 ? (
        <ul className={cn("space-y-[2px]", signature ? "pt-4" : "mt-auto pt-4")}>
          {keys.map((entry) => (
            <li key={entry.key} className="grid grid-cols-[3.5rem_1fr_2rem] items-center gap-3 py-1 text-sm">
              <span className="truncate font-medium text-ink">{entry.key}</span>
              <span aria-hidden="true" className="h-3">
                <span
                  className="block h-full rounded-r-[4px] bg-gold"
                  style={{ width: `${(entry.count / max) * 100}%` }}
                />
              </span>
              <span className="tnum text-right text-muted">
                {copy.keyCount.replace("{count}", String(entry.count))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </DetailCard>
  );
}

/** "3 flats: B♭ E♭ A♭ · relative major E♭" */
function describeSignature(signature: KeySignature): string {
  const { signature: words } = copy;
  const size =
    signature.count === 0
      ? words.none
      : `${plural(signature.count > 0 ? words.sharps : words.flats, Math.abs(signature.count))}: ${signature.accidentals.join(" ")}`;
  const relative = (
    signature.mode === "major" ? words.relativeMinor : signature.mode === "minor" ? words.relativeMajor : words.sameNotes
  ).replace("{key}", signature.relative);
  return `${size} · ${relative}`;
}

/**
 * Treble-clef staff positions, in steps up from the bottom line (E4): where
 * each sharp and flat of a key signature is written, in order.
 */
const SHARP_STEPS = [8, 5, 9, 6, 3, 7, 4];
const FLAT_STEPS = [4, 7, 3, 6, 2, 5, 1];
/** The distance between two staff lines, in the staff drawing's units. */
const SPACE = 10;
/** How far apart the key signature's accidentals sit, left to right. */
const ADVANCE = 11;
const STAFF_WIDTH = 320;
const STAFF_TOP = 24;
const STAFF_BOTTOM = STAFF_TOP + SPACE * 4;
/** Where each letter's lowest scale note sits, in steps up from the bottom line (E4). */
const LETTER_STEPS: Record<string, number> = { C: -2, D: -1, E: 0, F: 1, G: 2, A: 3, B: 4 };

const stepY = (step: number) => STAFF_BOTTOM - (step * SPACE) / 2;

/**
 * The main key on a treble staff: its key signature, then its scale from key
 * note to key note, named underneath. The accidentals are drawn rather than
 * typed, since the ♯ and ♭ characters are tiny and sit differently in every font.
 */
function Staff({ signature }: { signature: KeySignature }) {
  const accidentals = (signature.count >= 0 ? SHARP_STEPS : FLAT_STEPS).slice(0, Math.abs(signature.count));
  const firstNote = 16 + accidentals.length * ADVANCE + (accidentals.length > 0 ? 18 : 10);
  const noteGap = (STAFF_WIDTH - 16 - firstNote) / 7;
  const start = LETTER_STEPS[signature.letter];

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${STAFF_WIDTH} ${STAFF_BOTTOM + 30}`}
      className="block h-auto w-full max-w-md overflow-visible"
    >
      <g className="stroke-muted" strokeOpacity="0.55" strokeWidth="1">
        {[0, 1, 2, 3, 4].map((line) => (
          <line key={line} x1="0" x2={STAFF_WIDTH} y1={STAFF_TOP + line * SPACE} y2={STAFF_TOP + line * SPACE} />
        ))}
        <line x1="0.5" x2="0.5" y1={STAFF_TOP} y2={STAFF_BOTTOM} strokeWidth="1.5" />
        <line x1={STAFF_WIDTH - 0.75} x2={STAFF_WIDTH - 0.75} y1={STAFF_TOP} y2={STAFF_BOTTOM} strokeWidth="1.5" />
      </g>

      <g className="stroke-gold-dark" fill="none" strokeLinecap="round">
        {accidentals.map((step, index) => {
          const x = 16 + index * ADVANCE;
          return signature.count > 0 ? (
            <Sharp key={index} x={x} y={stepY(step)} />
          ) : (
            <Flat key={index} x={x} y={stepY(step)} />
          );
        })}
      </g>

      {signature.scale.map((name, degree) => {
        const step = start + degree;
        const x = firstNote + degree * noteGap;
        // Short extra lines for notes above or below the staff.
        const ledgers = [];
        for (let line = -2; line >= step; line -= 2) ledgers.push(line);
        for (let line = 10; line <= step; line += 2) ledgers.push(line);

        return (
          <g key={degree}>
            {ledgers.map((line) => (
              <line
                key={line}
                x1={x - 0.95 * SPACE}
                x2={x + 0.95 * SPACE}
                y1={stepY(line)}
                y2={stepY(line)}
                className="stroke-muted"
                strokeOpacity="0.55"
                strokeWidth="1"
              />
            ))}
            <ellipse
              cx={x}
              cy={stepY(step)}
              rx={0.64 * SPACE}
              ry={0.46 * SPACE}
              transform={`rotate(-20 ${x} ${stepY(step)})`}
              className="fill-gold"
            />
            <text
              x={x}
              y={STAFF_BOTTOM + 26}
              textAnchor="middle"
              fontSize="10"
              className="fill-muted"
            >
              {name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** A sharp centred on (x, y): two uprights and two heavier, rising crossbars. */
function Sharp({ x, y }: { x: number; y: number }) {
  const s = SPACE;
  return (
    <>
      <line x1={x + 0.28 * s} x2={x + 0.28 * s} y1={y - 1.05 * s} y2={y + 1.15 * s} strokeWidth="1.3" />
      <line x1={x + 0.62 * s} x2={x + 0.62 * s} y1={y - 1.15 * s} y2={y + 1.05 * s} strokeWidth="1.3" />
      <line x1={x} x2={x + 0.9 * s} y1={y - 0.2 * s} y2={y - 0.45 * s} strokeWidth="2.6" strokeLinecap="butt" />
      <line x1={x} x2={x + 0.9 * s} y1={y + 0.45 * s} y2={y + 0.2 * s} strokeWidth="2.6" strokeLinecap="butt" />
    </>
  );
}

/** A flat whose belly sits on (x, y): a tall stem and a rounded bowl at its foot. */
function Flat({ x, y }: { x: number; y: number }) {
  const s = SPACE;
  return (
    <>
      <line x1={x} x2={x} y1={y - 1.7 * s} y2={y + 0.5 * s} strokeWidth="1.4" />
      <path
        d={`M ${x} ${y - 0.05 * s} C ${x + 0.35 * s} ${y - 0.45 * s} ${x + 0.9 * s} ${y - 0.4 * s} ${x + 0.75 * s} ${y - 0.05 * s} C ${x + 0.6 * s} ${y + 0.25 * s} ${x + 0.25 * s} ${y + 0.4 * s} ${x} ${y + 0.5 * s}`}
        strokeWidth="1.7"
      />
    </>
  );
}

/**
 * Which of the week's services it is sung at. Songs sung at all three
 * services whenever they come round - the inserts, mostly - say so, rather
 * than looking like evening songs because a week has two evening services.
 */
function WeeklyServices({ stats }: { stats: SongStats }) {
  const { weekly, count } = stats;
  const words = copy.weekly;
  const kinds: WeeklyService[] = weekly.other > 0 ? [...REGULAR_SERVICES, "other"] : [...REGULAR_SERVICES];

  let headline: string = words.none;
  let detail: string | null = null;
  if (weekly.habit === "all") {
    headline = words.all;
    detail =
      weekly.fullWeeks === weekly.visits
        ? plural(words.allEvery, weekly.visits)
        : words.allDetail
            .replace("{count}", String(weekly.fullWeeks))
            .replace("{total}", String(weekly.visits));
  } else if (count === 1) {
    headline = words.single[kinds.find((kind) => weekly[kind] > 0)!];
  } else {
    const parts: string[] = [];
    if (weekly.habit) {
      const always = weekly[weekly.habit] === count;
      headline = (always ? words.always : words.mostly)[weekly.habit];
      if (!always) {
        parts.push(words.share.replace("{count}", String(weekly[weekly.habit])).replace("{total}", String(count)));
      }
    }
    // Whether it is a one-service song or one sung several times in a week.
    parts.push(
      weekly.visits === count
        ? words.oncePerWeek
        : words.acrossWeeks.replace("{count}", String(count)).replace("{weeks}", String(weekly.visits)),
    );
    detail = parts.join(" · ");
  }

  return (
    <DetailCard title={words.title}>
      <p className="mt-2 font-display text-2xl leading-snug text-ink">{headline}</p>
      {detail ? <p className="mt-1 text-sm text-muted">{detail}</p> : null}
      <CountBoxes
        items={kinds.map((kind) => ({
          id: kind,
          label: words.labels[kind],
          count: weekly[kind],
          active:
            weekly.habit === kind ||
            (weekly.habit === "all" && kind !== "other") ||
            (count === 1 && weekly[kind] > 0),
        }))}
      />
    </DetailCard>
  );
}

/** A row of counts in boxes, the ones that make the point outlined in gold. */
function CountBoxes({ items }: { items: Array<{ id: string; label: string; count: number; active: boolean }> }) {
  return (
    <ol
      className="mt-auto grid gap-2 pt-5"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "rounded-lg border px-2 py-2.5 text-center",
            item.active ? "border-gold bg-gold/10" : "border-line",
          )}
        >
          <span className="tnum block font-display text-xl text-ink">{item.count}</span>
          <span className="block text-[0.7rem] text-muted">{item.label}</span>
        </li>
      ))}
    </ol>
  );
}
