import { ContactCta } from "@/components/home/ContactCta";
import { Hero } from "@/components/home/Hero";
import { Purpose } from "@/components/home/Purpose";
import { SongListCta } from "@/components/home/SongListCta";
import { PageTransition } from "@/components/ui/PageTransition";
import { getSchedule } from "@/lib/schedule";
import { getTimeline } from "@/lib/service-time";
import type { Service } from "@/types/song-list";

/**
 * Re-render at most every 10 seconds (siteConfig.songList.revalidateSeconds),
 * like the song list, so the next service shown here stays current. Only the
 * sheet is read - no archive database - so the home page stays light.
 */
export const revalidate = 10;

export default async function HomePage() {
  const { services, loadedAt } = await loadNextService();

  return (
    <PageTransition>
      <Hero />
      <Purpose />
      <SongListCta services={services} serverNow={loadedAt} />
      <ContactCta />
    </PageTransition>
  );
}

/**
 * The visible months' services, or null when there is no service to show right
 * now (schedule unavailable, or nothing coming up). The browser then keeps the
 * card current against its own clock.
 */
async function loadNextService(): Promise<{ services: Service[] | null; loadedAt: number }> {
  const result = await getSchedule();
  const loadedAt = Date.now();
  if (!result.ok) return { services: null, loadedAt };

  const services = result.months.flatMap((month) => month.services);
  const timeline = getTimeline(services, loadedAt);
  const live = timeline.nowId !== null || timeline.nextId !== null;
  return { services: live ? services : null, loadedAt };
}
