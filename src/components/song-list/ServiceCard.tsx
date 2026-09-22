import { Card } from "@/components/ui/Card";
import { songListContent } from "@/content/song-list";
import type { Service } from "@/types/song-list";

/**
 * One service: a date, an optional Morning/Evening label, and its songs.
 *
 * The songs are a real <table> - they are genuinely tabular (number, title,
 * key). The column headers are visually hidden because repeating "No. / Song /
 * Key" on every card is noise for sighted readers, while screen reader users
 * still get the column name announced with each cell.
 */
export function ServiceCard({ service }: { service: Service }) {
  const headingId = `service-${service.id}`;
  const { columns, undatedServiceLabel } = songListContent;

  return (
    <Card barline className="p-5 sm:p-6">
      <div className="mb-4 border-b border-line pb-3">
        <h3 id={headingId} className="font-display text-lg text-ink sm:text-xl">
          {service.dateLabel || undatedServiceLabel}
        </h3>
        {service.serviceLabel ? (
          <p className="mt-1 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-gold-dark">
            {service.serviceLabel}
          </p>
        ) : null}
      </div>

      <table aria-labelledby={headingId} className="w-full table-fixed border-collapse">
        {/* table-fixed takes its column widths from the first row, and the
            first row here is the visually hidden header - so the widths are
            declared on <col> instead of on the cells. */}
        <colgroup>
          <col className="w-10 sm:w-12" />
          <col />
          <col className="w-16 sm:w-20" />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th scope="col">{columns.number}</th>
            <th scope="col">{columns.title}</th>
            <th scope="col">{columns.key}</th>
          </tr>
        </thead>
        <tbody>
          {service.songs.map((song, index) => (
            <tr
              key={`${service.id}-${index}`}
              className="align-baseline border-line [&:not(:last-child)]:border-b"
            >
              <td className="tnum py-2 pr-3 text-sm text-muted sm:text-base">
                {song.number ?? ""}
              </td>
              <td className="py-2 pr-3 text-sm text-ink sm:text-base">
                {song.title}
              </td>
              <td className="tnum whitespace-nowrap py-2 text-right text-sm text-gold-dark sm:text-base">
                {song.key ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
