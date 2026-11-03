import type { ReactNode } from "react";

/**
 * One row of a Dashboard list: the main line, an optional right-hand note,
 * and a second line - every row two lines, so rows line up. Lists of these
 * show five and keep the rest behind "Show all" (MusicList, ExpandableList).
 */
export function ListRow({
  main,
  aside,
  detail,
}: {
  main: ReactNode;
  aside?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <li className="px-5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate">{main}</span>
        {aside ? <span className="shrink-0 text-xs text-muted">{aside}</span> : null}
      </div>
      {detail ? <div className="mt-1 min-w-0 truncate text-xs text-muted">{detail}</div> : null}
    </li>
  );
}
