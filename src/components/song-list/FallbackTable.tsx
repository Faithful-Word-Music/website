import { Card } from "@/components/ui/Card";
import { songListContent } from "@/content/song-list";

/**
 * Shown only if the sheet's layout stops matching what the parser expects.
 * Displaying the rows plainly beats pretending the month has no songs.
 */
export function FallbackTable({ rows }: { rows: string[][] }) {
  return (
    <div>
      <p className="mb-4 rounded-card border border-line bg-surface px-4 py-3 text-sm text-muted">
        {songListContent.states.fallbackNotice}
      </p>
      <Card className="overflow-x-auto p-4">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-line last:border-0">
                {row.map((value, cellIndex) => (
                  <td key={cellIndex} className="py-2 pr-4 text-ink">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
