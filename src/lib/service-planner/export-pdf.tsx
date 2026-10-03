import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";

import { SongListPdf } from "@/components/song-list/SongListPdf";
import type { SongListMonth } from "@/types/song-list";

/** The formatted PDF export: the song list's own PDF, for any months. */
export async function formattedPdf(months: SongListMonth[]): Promise<Buffer> {
  return renderToBuffer(<SongListPdf months={months} />);
}
