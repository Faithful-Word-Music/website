"use client";

import type { CSSProperties, ReactNode } from "react";

import { placeCards } from "@/lib/card-layout";
import type { Service } from "@/types/song-list";

/**
 * The service cards: one column on a phone, two on a large screen, placed by
 * placeCards() - so a part-planned month stacks its "not posted yet" cards
 * beside a full service instead of leaving a hole next to it, and the rows
 * still line up. DOM order (what a screen reader and the Tab key follow)
 * stays date order.
 */
export function CardGrid({
  services,
  renderCard,
}: {
  services: Service[];
  /** The card itself; `column` is 1 or 2, for staggering a reveal. */
  renderCard: (service: Service, column: 1 | 2) => ReactNode;
}) {
  const placements = placeCards(
    services.map((service) => ({
      full: !service.placeholder,
      rows: service.placeholder ? (service.plannedInserts?.length ?? 0) : service.songs.length + service.pendingSongs,
    })),
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
      {services.map((service, index) => {
        const { column, row, span } = placements[index];
        return (
          <div
            key={service.id}
            // Only from `lg` up; in one column the cards simply follow on.
            className="lg:[grid-column:var(--column)] lg:[grid-row:var(--row)]"
            style={{ "--column": column, "--row": `${row} / span ${span}` } as CSSProperties}
          >
            {renderCard(service, column)}
          </div>
        );
      })}
    </div>
  );
}
