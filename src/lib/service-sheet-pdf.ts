import "server-only";

import { PDFDocument, PDFHexString, PDFName, type PDFPage, type PDFRef } from "pdf-lib";

/**
 * One service's sheet music as a single PDF: each song's own PDF, untouched,
 * in service order - nothing added, so printing it prints only the music.
 *
 * Each song is also a bookmark (the viewer's sidebar or outline), which jumps
 * to its first page without ever being printed. How to print just some of
 * the songs is explained beside the Dashboard's button.
 */

export interface PacketSong {
  number: string | null;
  title: string;
  pdf: Uint8Array;
}

/** "143 · Blessed Assurance" bookmarks, in order, each to its song's first page. */
function addBookmarks(doc: PDFDocument, entries: Array<{ title: string; page: PDFPage }>) {
  const { context } = doc;
  const outlines = context.nextRef();
  const refs: PDFRef[] = entries.map(() => context.nextRef());

  entries.forEach((entry, index) => {
    context.assign(
      refs[index],
      context.obj({
        Title: PDFHexString.fromText(entry.title),
        Parent: outlines,
        Dest: [entry.page.ref, "XYZ", null, null, null],
        ...(index > 0 ? { Prev: refs[index - 1] } : {}),
        ...(index < refs.length - 1 ? { Next: refs[index + 1] } : {}),
      }),
    );
  });
  context.assign(
    outlines,
    context.obj({ Type: "Outlines", First: refs[0], Last: refs[refs.length - 1], Count: refs.length }),
  );
  doc.catalog.set(PDFName.of("Outlines"), outlines);
}

/**
 * The joined PDF, or null when none of the files would open. A file that will
 * not (damaged, or locked against copying) is left out rather than failing
 * the rest.
 */
export async function buildServicePacket(title: string, songs: PacketSong[]): Promise<Uint8Array | null> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("Faithful Word Music");

  const bookmarks: Array<{ title: string; page: PDFPage }> = [];
  for (const song of songs) {
    try {
      const source = await PDFDocument.load(song.pdf, { ignoreEncryption: true });
      const pages = await doc.copyPages(source, source.getPageIndices());
      if (pages.length === 0) continue;
      for (const page of pages) doc.addPage(page);
      bookmarks.push({ title: song.number ? `${song.number} · ${song.title}` : song.title, page: pages[0] });
    } catch {
      console.error("[sheet-music] A PDF in a service's sheet music could not be read.");
    }
  }

  if (bookmarks.length === 0) return null;
  addBookmarks(doc, bookmarks);
  return doc.save();
}
