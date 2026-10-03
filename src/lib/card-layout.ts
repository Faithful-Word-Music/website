/**
 * Where each service card sits in the two-column grid on a large screen.
 *
 * Cards go two to a row, in date order. The exception is a full service card
 * beside a "not posted yet" placeholder: a placeholder is a third the height,
 * so one alone would leave a hole beside the full card. Instead the full card
 * spans several grid rows and the placeholders that follow stack beside it -
 * as many as its height roughly holds. The grid stretches the stack to end
 * exactly where the full card ends (or the card to the stack, if the guess is
 * short), so the rows below still line up side by side.
 *
 * Pure: no measuring, so the server renders the final layout.
 */

export interface CardSlot {
  /** A full card (songs or slots), rather than a short placeholder. */
  full: boolean;
  /** Song rows on the card, which sets its height. A placeholder's planned insert is one. */
  rows: number;
}

export interface CardPlacement {
  column: 1 | 2;
  /** Grid row line to start on, from 1. */
  row: number;
  span: number;
}

/** A full card's rough height: its header plus ~50px a song row. */
function fullHeight(rows: number): number {
  return 170 + 50 * Math.max(rows, 1);
}

/** A placeholder's, gap included: ~125px, and ~50px more for a planned insert. */
function placeholderHeight(rows: number): number {
  return 125 + 50 * rows;
}

/** How many plain placeholders (no planned insert) fit beside a full card. */
export function stackSize(rows: number): number {
  return Math.max(1, Math.floor(fullHeight(rows) / placeholderHeight(0)));
}

export function placeCards(cards: CardSlot[]): CardPlacement[] {
  const placements: CardPlacement[] = [];
  let row = 1;
  let index = 0;

  while (index < cards.length) {
    const left = cards[index];
    const right = cards[index + 1];

    if (!right) {
      placements[index] = { column: 1, row, span: 1 };
      break;
    }

    // Alike - two full cards or two placeholders - share a row as usual.
    if (left.full === right.full) {
      placements[index] = { column: 1, row, span: 1 };
      placements[index + 1] = { column: 2, row, span: 1 };
      row += 1;
      index += 2;
      continue;
    }

    // A full card and a placeholder: the placeholder, and those right after
    // it, stack beside the full card - as many as its height holds.
    const fullIndex = left.full ? index : index + 1;
    const fullColumn = left.full ? 1 : 2;
    const first = left.full ? index + 1 : index;
    const stack = [first];
    const room = fullHeight(cards[fullIndex].rows);
    let used = placeholderHeight(cards[first].rows);
    let next = index + 2;
    while (next < cards.length && !cards[next].full && used + placeholderHeight(cards[next].rows) <= room) {
      used += placeholderHeight(cards[next].rows);
      stack.push(next);
      next += 1;
    }

    placements[fullIndex] = { column: fullColumn, row, span: stack.length };
    stack.forEach((cardIndex, offset) => {
      placements[cardIndex] = { column: fullColumn === 1 ? 2 : 1, row: row + offset, span: 1 };
    });
    row += stack.length;
    index = next;
  }

  return placements;
}
