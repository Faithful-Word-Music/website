import { redirect } from "next/navigation";

import { churchYear } from "@/lib/service-time";
import { getYearRecapData } from "@/lib/song-archive";

/** Same cadence as the archive (siteConfig.songList.revalidateSeconds). */
export const revalidate = 10;

/**
 * /song-list/year goes to the latest year with songs recorded - this year,
 * except in the first days of January before anything has been sung.
 */
export default async function YearIndexPage() {
  const data = await getYearRecapData();
  const latest = data.ok ? data.years.at(-1) : undefined;
  redirect(`/song-list/year/${latest ?? churchYear(Date.now())}`);
}
