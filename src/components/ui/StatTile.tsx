import type { ReactNode } from "react";

import { Card } from "./Card";

/**
 * A figure with a small label above it ("Services / 158"). Goes inside a
 * <dl>, since each tile is a term and its value.
 */
export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  /** An optional line under the figure, e.g. "3 weeks ago". */
  detail?: ReactNode;
}) {
  return (
    <Card className="px-4 py-4 sm:px-6 sm:py-5">
      <dt className="font-sans text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted sm:text-[0.7rem]">
        {label}
      </dt>
      <dd className="tnum mt-1 font-display text-2xl text-ink sm:text-3xl">{value}</dd>
      {detail ? <dd className="mt-0.5 text-xs text-muted">{detail}</dd> : null}
    </Card>
  );
}
