import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { brushUpRows, MusicList, newSheetRows } from "@/components/dashboard/MusicSections";
import { RecordingReminder } from "@/components/recordings/RecordingNotes";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { dashboardContent } from "@/content/dashboard";
import type { ComingUpService } from "@/lib/dashboard/coming-up";
import type { NewSheetSong } from "@/lib/dashboard/new-sheet-music";
import type { BrushUpSong } from "@/lib/dashboard/repertoire";
import { servicePlaylistHref } from "@/lib/dashboard/workspace";
import type { PreparationData } from "@/lib/recordings/load";
import { plural } from "@/lib/plural";
import { serviceDate } from "@/lib/service-planner/format";

const copy = dashboardContent.preparation;

type Playlists = Promise<PreparationData | null>;

/**
 * Preparation: the coming services' playlists to listen ahead with, then the
 * songs to work on - brush up, and new sheet music - as tabs when there are
 * both. Links only: the playlists play on their own pages.
 *
 * The playlist links stream in on their own (their data is the one read the
 * rest of the page does not wait for); the songs are there at once.
 */
export function Preparation({
  services,
  playlists,
  brushUp,
  recordsBegan,
  newSheet,
  now,
  className,
}: {
  /** The services to offer playlists for (the coming week's). */
  services: readonly ComingUpService[];
  playlists: Playlists;
  brushUp: BrushUpSong[];
  recordsBegan: string | null;
  newSheet: NewSheetSong[];
  now: number;
  className?: string;
}) {
  const listenable = services.filter((service) => service.slots.length > 0 && service.status !== "now");
  const tabs = [
    brushUp.length > 0
      ? {
          id: "brush-up",
          label: copy.brushUp,
          badge: brushUp.length,
          badgeLabel: plural(dashboardContent.hero.songs, brushUp.length),
          content: <TabList rows={brushUpRows(brushUp, recordsBegan)} title={dashboardContent.brushUp.title} lead={dashboardContent.brushUp.lead} showTitle={newSheet.length === 0} />,
        }
      : null,
    newSheet.length > 0
      ? {
          id: "new-sheet-music",
          label: copy.newSheet,
          badge: newSheet.length,
          badgeLabel: plural(dashboardContent.hero.songs, newSheet.length),
          content: <TabList rows={newSheetRows(newSheet, now)} title={dashboardContent.newSheet.title} lead={dashboardContent.newSheet.lead} showTitle={brushUp.length === 0} />,
        }
      : null,
  ].filter((tab) => tab !== null);

  if (listenable.length === 0 && tabs.length === 0) return null;

  return (
    <Panel
      title={copy.title}
      description={copy.lead}
      bare
      className={className}
      action={
        <Link href="/playlists" className="inline-flex min-h-9 items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
          {copy.allPlaylists}
          <Icon name="arrow-right" size={13} strokeWidth={1.6} />
        </Link>
      }
    >
      {listenable.length > 0 ? (
        <Suspense fallback={<PlaylistSkeleton count={Math.min(listenable.length, 2)} />}>
          <PlaylistLinks services={listenable} playlists={playlists} />
        </Suspense>
      ) : null}
      {tabs.length > 0 ? (
        <Tabs
          label={copy.tabsLabel}
          tabs={tabs}
          className={cn("[&>[role=tablist]]:px-5", listenable.length > 0 && "border-t border-line pt-1")}
          panelClassName="pt-0"
        />
      ) : null}
    </Panel>
  );
}

function TabList({ rows, title, lead, showTitle }: { rows: ReactNode[]; title: string; lead: string; showTitle: boolean }) {
  return (
    <div>
      <p className="px-5 pb-2 pt-3 text-xs text-muted">
        {/* With one list there is no tab row to name it. */}
        {showTitle ? <span className="mr-1.5 text-sm font-medium text-ink">{title}</span> : null}
        {lead}
      </p>
      <MusicList rows={rows} title={title} lead={lead} />
    </div>
  );
}

/** The services' playlists that exist, as wide links; nothing at all when none does. */
async function PlaylistLinks({ services, playlists }: { services: readonly ComingUpService[]; playlists: Playlists }) {
  const data = await playlists;
  const links = services.flatMap((service) => {
    const href = servicePlaylistHref(service, data);
    return href ? [{ service, href }] : [];
  });
  if (links.length === 0) return null;
  return (
    <div className="px-5 pb-4">
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        {links.map(({ service, href }) => (
          <li key={service.id}>
            <Link
              href={href}
              className="group flex min-h-14 items-center gap-3 rounded-xl border border-line bg-paper/60 px-3 py-2 transition-colors hover:border-gold"
            >
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-gold/15 text-gold-dark">
                <Icon name="play" size={13} strokeWidth={1.6} />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-medium text-ink">
                  {copy.listen.replace("{service}", serviceDate(service.startsAt))}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {service.serviceLabel ? `${service.serviceLabel} · ` : ""}
                  {copy.playlistDetail}
                </span>
              </span>
              <Icon name="chevron-right" size={14} className="text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </Link>
          </li>
        ))}
      </ul>
      <RecordingReminder className="mt-2.5" />
    </div>
  );
}

function PlaylistSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 px-5 pb-4 sm:grid-cols-2" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** The hero's Listen button: the next service's playlist, once the playlists are in, or nothing. */
export function HeroListen({ service, playlists }: { service: ComingUpService; playlists: Playlists }) {
  return (
    <Suspense fallback={null}>
      <HeroListenLink service={service} playlists={playlists} />
    </Suspense>
  );
}

async function HeroListenLink({ service, playlists }: { service: ComingUpService; playlists: Playlists }) {
  const href = servicePlaylistHref(service, await playlists);
  if (!href) return null;
  return (
    <Link href={href} className={buttonClasses("quiet", "md", "grow gap-1.5 sm:grow-0")}>
      <Icon name="headphones" size={15} />
      {dashboardContent.hero.secondary.listen}
    </Link>
  );
}
