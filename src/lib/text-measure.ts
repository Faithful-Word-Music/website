/**
 * Where a line of Inter will wrap, without loading the font - for layouts
 * that must know their height before they are drawn: the song list PDF
 * (song-list-pdf.ts) and the shared service picture (song-list/image).
 */

/**
 * Advance widths of Inter Regular's printable ASCII characters (space to "~"),
 * in thousandths of an em - read from assets/fonts/Inter-Regular.ttf.
 */
const INTER_WIDTHS = [
  281, 288, 466, 633, 642, 982, 644, 300, 365, 365, 501, 662, 288, 460, 288, 360, 631, 407, 610,
  618, 646, 593, 620, 566, 619, 620, 288, 302, 662, 662, 662, 511, 966, 690, 654, 730, 722, 601,
  590, 746, 743, 269, 571, 672, 565, 903, 753, 765, 639, 765, 644, 642, 646, 744, 690, 985, 682,
  679, 629, 365, 360, 365, 471, 456, 323, 562, 612, 571, 612, 583, 370, 613, 591, 242, 242, 549,
  242, 876, 591, 600, 612, 612, 376, 528, 327, 591, 562, 818, 546, 562, 552, 426, 333, 426, 662,
];

/**
 * Width of `text` set in Inter at `size`. Other characters count as a
 * wide-ish letter. A little slack for kerning and rounding, so a layout is
 * never planned tighter than it draws.
 */
export function interWidth(text: string, size: number): number {
  let units = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    units += code >= 32 && code < 127 ? INTER_WIDTHS[code - 32] : 650;
  }
  return (units / 1000) * size * 1.02;
}

/** How many lines `text` takes in a box `maxWidth` wide, wrapping between words. */
export function interLines(text: string, size: number, maxWidth: number): number {
  const space = interWidth(" ", size);
  let lines = 1;
  let line = 0;
  for (const word of text.trim().split(/\s+/)) {
    const width = interWidth(word, size);
    if (line > 0 && line + space + width > maxWidth) {
      lines++;
      line = width;
    } else {
      line += (line > 0 ? space : 0) + width;
    }
  }
  return lines;
}
