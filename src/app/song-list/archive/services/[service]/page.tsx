import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Pill } from "@/components/admin/StatusPill";
import { SongLink } from "@/components/song-list/SongLink";
import { BackLink } from "@/components/ui/BackLink";
import { buttonClasses } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { servicePlannerContent } from "@/content/service-planner";
import { songListContent } from "@/content/song-list";
import { getViewer } from "@/lib/auth/session";
import { scheduleEnv } from "@/lib/schedule";
import { toArchive } from "@/lib/service-archive";
import { serviceFullDate, serviceTitle } from "@/lib/service-planner/format";
import { namesFor } from "@/lib/service-planner/load";
import { isInsert, isLocked, parseAnchor } from "@/lib/service-planner/model";
import { getPlan, listPlanEvents, plannerConfigured } from "@/lib/service-planner/store";
import { formatChurchTime, formatLongDate } from "@/lib/service-time";
import { loadPast } from "@/lib/song-archive";

const copy = songListContent.serviceArchive;
const history = servicePlannerContent.history;

export async function generateMetadata(props: PageProps<"/song-list/archive/services/[service]">): Promise<Metadata> {
  const { service } = await props.params;
  const where = parseAnchor(service);
  return {
    title: where ? `${copy.title} - ${where.date} ${where.slot}` : copy.title,
    alternates: { canonical: `/song-list/archive/services/${service}` },
  };
}

/**
 * /song-list/archive/services/2026-10-11-am - one past service, exactly as it
 * was sung: every song in order, with its number and key, as recorded at the
 * time (later changes to a song's details never rewrite it). Songs link to
 * their current Library pages.
 *
 * Those who manage service plans also see who planned and published it, and
 * what changed - the planner's audit record. Everyone else sees the plan.
 */
export default async function ArchivedServicePage(props: PageProps<"/song-list/archive/services/[service]">) {
  const { service: anchor } = await props.params;
  if (!parseAnchor(anchor)) notFound();

  const past = await loadPast();
  const services = past ? toArchive(past.past) : [];
  const index = services.findIndex((item) => item.anchor === anchor);
  if (index < 0) notFound();
  const service = services[index];
  const later = services[index - 1] ?? null;
  const earlier = services[index + 1] ?? null;

  const viewer = await getViewer().catch(() => null);
  const manages = viewer?.can("manage_service_plans") ?? false;
  const audit = manages && plannerConfigured() ? await loadAudit(service.date, service.slot) : null;

  return (
    <PageTransition>
      <Container size="narrow" className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <BackLink fallback="/song-list/archive/services" />

        <header className="mt-6">
          <p className="text-sm text-muted">
            {serviceFullDate(service.startsAt)} · {formatChurchTime(service.startsAt)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl text-ink sm:text-5xl">{serviceTitle(service)}</h1>
            {service.special ? <Pill tone="muted">{copy.special}</Pill> : null}
          </div>
        </header>

        <h2 className="sr-only">{copy.detail.songs}</h2>
        <ol className="mt-8 divide-y divide-line rounded-card border border-line bg-surface">
          {service.songs.map((song, position) => (
            <li key={position} className="flex items-baseline gap-4 px-5 py-4">
              <span className="w-5 shrink-0 text-sm tabular-nums text-muted">{position + 1}</span>
              <span className="w-10 shrink-0 text-sm tabular-nums text-muted">{song.number ?? ""}</span>
              <span className="min-w-0 flex-1 text-lg text-ink">
                <SongLink title={song.title} />
                {isInsert(song) ? (
                  <span className="ml-2 align-middle text-[0.7rem] uppercase tracking-wider text-gold-dark">{copy.insert}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-ink">{song.key ?? ""}</span>
            </li>
          ))}
        </ol>

        <nav className="mt-6 flex justify-between gap-4 text-sm" aria-label={copy.title}>
          {earlier ? (
            <Link href={`/song-list/archive/services/${earlier.anchor}`} className="text-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-ink hover:decoration-current">
              ← {copy.detail.before}
            </Link>
          ) : (
            <span />
          )}
          {later ? (
            <Link href={`/song-list/archive/services/${later.anchor}`} className="text-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-ink hover:decoration-current">
              {copy.detail.after} →
            </Link>
          ) : null}
        </nav>

        {audit ? (
          <section className="mt-10 rounded-card border border-line bg-surface px-5 py-4 text-sm">
            <ul className="space-y-1 text-muted">
              {audit.createdBy ? <li>{copy.detail.created.replace("{name}", audit.createdBy)}</li> : null}
              {audit.published ? (
                <li>
                  {copy.detail.published
                    .replace("{name}", audit.published.name ?? copy.detail.someone)
                    .replace("{date}", formatLongDate(audit.published.at))}
                </li>
              ) : null}
              <li>
                {copy.detail.updated
                  .replace("{name}", audit.updated.name ?? copy.detail.someone)
                  .replace("{date}", formatLongDate(audit.updated.at))}
              </li>
            </ul>
            {audit.events.length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-ink">{copy.detail.history}</summary>
                <ul className="mt-2 space-y-1 text-muted">
                  {audit.events.map((event, position) => (
                    <li key={position}>
                      {(history as Record<string, string>)[event.type] ?? event.type} ·{" "}
                      {history.by.replace("{name}", event.actorName ?? history.someone)} · {formatLongDate(event.at)}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {!audit.locked ? (
              <Link href={`/service-planner/${anchor}`} className={buttonClasses("secondary", "md", "mt-4")}>
                {copy.detail.planner}
              </Link>
            ) : null}
          </section>
        ) : null}
      </Container>
    </PageTransition>
  );
}

/** Who planned, published and changed a service - for those who manage plans only. */
async function loadAudit(date: string, slot: "AM" | "PM") {
  const env = scheduleEnv();
  const plan = await getPlan(env, date, slot).catch(() => null);
  if (!plan) return null;
  const events = await listPlanEvents(env, plan.id);
  const names = await namesFor([plan.created.by, plan.updated.by, plan.published?.by ?? null, ...events.map((event) => event.actor)]);
  const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  return {
    createdBy: name(plan.created.by),
    updated: { name: name(plan.updated.by), at: plan.updated.at },
    published: plan.published ? { name: name(plan.published.by), at: plan.published.at } : null,
    events: events.map((event) => ({ ...event, actorName: name(event.actor) })),
    locked: isLocked(plan.startsAt, Date.now()),
  };
}
