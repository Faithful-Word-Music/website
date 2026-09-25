import { siteConfig } from "@/config/site";
import { songListContent } from "@/content/song-list";
import { formatChurchTime, splitDateLabel } from "@/lib/service-time";
import type { SongListMonth } from "@/types/song-list";

/**
 * The song list as it prints: the month laid out like the spreadsheet's own
 * printout, on one page.
 *
 *   - Every service in the month, in date order - earlier ones included.
 *   - Nothing live: no Next/Now, no hints, and no search or key filter even if
 *     one is active on screen. A printout is the month, not the moment.
 *   - Services run down the left column and then the right, as in the sheet.
 *
 * Only ever visible in print (`hidden print:block`). Sizes are in points, the
 * unit of a printed page. Its margins are its own padding (see the section).
 *
 * Row height adapts to the month so it always fills one page without
 * spilling; see fitToPage() below.
 */
export function PrintSchedule({ month }: { month: SongListMonth }) {
  const { columns, undatedServiceLabel } = songListContent;
  const { rowPt, gapPt } = fitToPage(month);
  const year = firstYear(month);

  return (
    // `page: song-list` selects the zero-margin @page in globals.css; the
    // padding is the page margin instead, so no print setting can remove it.
    <section className="hidden px-[0.5in] py-[0.4in] text-[#111] [page:song-list] print:block">
      <header className="mb-[16pt] border-b-[0.75pt] border-[#111] pb-[8pt] text-center">
        <h1 className="font-display text-[20pt] leading-tight">{month.heading ?? month.title}</h1>
        <p className="mt-[3pt] font-sans text-[7.5pt] uppercase tracking-[0.2em] text-[#666]">
          {siteConfig.church.name}
          {year ? ` · ${year}` : ""}
        </p>
      </header>

      <div className="columns-2 gap-x-[32pt] [column-rule:0.5pt_solid_#d4d4d4]">
        {month.services.map((service) => {
          const { weekday, day } = splitDateLabel(service.dateLabel);
          const date = weekday && day ? `${weekday}, ${day}` : service.dateLabel;

          return (
            <table
              key={service.id}
              className="w-full break-inside-avoid border-collapse font-sans text-[9.5pt]"
              style={{ lineHeight: `${rowPt}pt`, marginBottom: `${gapPt}pt` }}
            >
              <thead>
                <tr className="border-b-[0.75pt] border-[#111]">
                  <th colSpan={3} className="px-[3pt] pb-[2pt] text-left font-normal leading-[14pt]">
                    <span className="flex items-baseline gap-[6pt]">
                      {service.slot ? (
                        <span className="w-[16pt] text-[7.5pt] font-semibold tracking-[0.08em] text-[#666]">
                          {service.slot}
                        </span>
                      ) : null}
                      <span className="flex-1 font-semibold">
                        {date || undatedServiceLabel}
                      </span>
                      {service.startsAt ? (
                        <span className="text-[8pt] text-[#666]">
                          {formatChurchTime(service.startsAt)}
                        </span>
                      ) : null}
                    </span>
                  </th>
                </tr>
                {/* Column names for screen readers only; the printout doesn't need them. */}
                <tr className="sr-only">
                  <th scope="col">{columns.number}</th>
                  <th scope="col">{columns.title}</th>
                  <th scope="col">{columns.key}</th>
                </tr>
              </thead>
              {/* A little air between the service's rule and its first song. */}
              <tbody className="[&>tr:first-child>td]:pt-[3.5pt]">
                {service.songs.map((song, index) => (
                  <tr key={index} className="border-b-[0.5pt] border-[#e2e2e2] last:border-0">
                    <td className="tnum w-[28pt] pl-[3pt] align-top text-[#666]">
                      {song.number ?? ""}
                    </td>
                    <td className="pr-[8pt] align-top">{song.title}</td>
                    <td className="tnum w-[50pt] whitespace-nowrap pr-[3pt] text-right align-top font-medium">
                      {song.key ?? ""}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: service.pendingSongs }, (_, index) => (
                  <tr key={`pending-${index}`} className="border-b-[0.5pt] border-[#e2e2e2] last:border-0">
                    <td className="pl-[3pt]" />
                    <td className="italic text-[#777]">{songListContent.states.pendingSong}</td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })}
      </div>

      {month.note ? (
        <p className="mt-[10pt] border-t-[0.5pt] border-[#d4d4d4] pt-[8pt] text-center font-sans text-[8pt] italic text-[#666]">{month.note}</p>
      ) : null}
    </section>
  );
}

/**
 * Row height and gap between services that fill one page without spilling.
 *
 * The page's content area (Letter, with the margins in globals.css) leaves
 * about 610pt of column height once the heading and footnote are placed.
 * Services never split across columns, so the fuller column holds
 * ceil(services / 2) of them - and, on average, that share of all song rows.
 * Each service also costs a fixed header line and gap. What remains, divided
 * by the rows, is the row height: generous for a light month, snug for a
 * full one, and never taller than looks good.
 */
function fitToPage(month: SongListMonth): { rowPt: number; gapPt: number } {
  const COLUMN_PT = 610;
  const HEADER_PT = 20.5; // the date line, its rule, and the space under it
  const services = month.services.length || 1;
  const rows = month.services.reduce(
    (total, service) => total + service.songs.length + service.pendingSongs,
    0,
  );

  const servicesInColumn = Math.ceil(services / 2);
  const rowsInColumn = Math.max(1, Math.ceil((servicesInColumn * rows) / services));
  const gapPt = servicesInColumn >= 7 ? 6 : 10;
  const available = COLUMN_PT - servicesInColumn * (HEADER_PT + gapPt);
  const rowPt = Math.min(17, Math.max(12, available / rowsInColumn));

  return { rowPt: Math.round(rowPt * 4) / 4, gapPt };
}

/** The year the month's services fall in, for the subtitle ("... · 2026"). */
function firstYear(month: SongListMonth): string | null {
  const dated = month.services.find((service) => service.date);
  return dated?.date?.slice(0, 4) ?? null;
}
