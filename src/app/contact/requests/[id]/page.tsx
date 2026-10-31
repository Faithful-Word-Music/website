import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RequestBadges } from "@/components/support/Badges";
import { ManagePanel } from "@/components/support/ManagePanel";
import { ReplyBox } from "@/components/support/ReplyBox";
import { BackLink } from "@/components/ui/BackLink";
import { cn } from "@/components/ui/cn";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { supportContent } from "@/content/support";
import { requireViewer } from "@/lib/auth/session";
import { relativeTime } from "@/lib/notifications/format";
import { contextLinks, isEmptyContext, isRedacted } from "@/lib/support/context";
import { songSlugs } from "@/lib/support/context-load";
import { supportDeps } from "@/lib/support/deps";
import { contextLines } from "@/lib/support/display";
import { namesFor, supportManagers } from "@/lib/support/people";
import { requestHref } from "@/lib/support/model";
import { readRequest } from "@/lib/support/service";
import type { StoredEvent, StoredMessage } from "@/lib/support/store";

/** Nothing about a request ever reaches a title, a preview or a share card. */
export const metadata: Metadata = { title: supportContent.title, robots: { index: false, follow: false } };

const copy = supportContent.detail;

/** When the page was put together: its times are measured from this. */
async function renderedAt(): Promise<number> {
  return Date.now();
}

/**
 * One support request, for its submitter or for whoever manages requests -
 * the same page, with each one's own actions. Anyone else is told it does not
 * exist. Internal notes and management housekeeping never reach the
 * submitter (readRequest filters them, and the queries already did).
 */
export default async function SupportRequestPage({ params }: PageProps<"/contact/requests/[id]">) {
  const { id } = await params;
  const viewer = await requireViewer(requestHref(id.toUpperCase()));
  const result = await readRequest(viewer, id, supportDeps(viewer.env));
  if (!result.ok) notFound();
  const { access, request, messages, events } = result.view;
  const manager = access === "manager";
  const now = await renderedAt();

  const people = [request.submitterId, request.assigneeId, ...messages.map((message) => message.authorId), ...events.map((event) => event.actorId), ...events.map((event) => (event.kind === "assigned" ? event.to : null))];
  const [names, managers, slugFor] = await Promise.all([
    namesFor(people.filter((item): item is string => Boolean(item))),
    manager ? supportManagers(viewer.env) : Promise.resolve([]),
    songSlugs().catch(() => () => null),
  ]);
  const nameOf = (userId: string | null) => {
    if (!userId) return copy.formerPerson;
    if (userId === viewer.userId) return copy.you;
    // A submitter is never told which manager did what: replies come from the music ministry.
    if (!manager && userId !== request.submitterId) return copy.music;
    return names.get(userId) || copy.formerPerson;
  };

  const lines = contextLines(request.context);
  const links = contextLinks(request.context, viewer.can, slugFor);
  const timeline = [
    ...messages.map((message) => ({ at: message.createdAt, message })),
    // A reply is shown as its message; "created" is the header.
    ...events.filter((event) => event.kind !== "replied" && event.kind !== "created").map((event) => ({ at: event.createdAt, event })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <PageTransition>
      <Container size="wide" className="pb-14 pt-8 sm:pb-20 sm:pt-12">
        <BackLink fallback={manager ? "/contact?view=manage" : "/contact?view=mine"} />

        <header className="mt-4">
          <p className="text-sm text-muted">
            {request.publicId} · {supportContent.categories[request.category]}
          </p>
          <h1 className="mt-1 text-balance font-display text-3xl text-ink sm:text-4xl">{request.title}</h1>
          <RequestBadges className="mt-3" status={request.status} waitingOn={request.waitingOn} priority={manager ? request.priority : "normal"} forManager={manager} />
          <p className="mt-3 text-sm text-muted">
            {copy.sent.replace("{time}", relativeTime(request.createdAt, now)).replace("{name}", nameOf(request.submitterId))}
            {manager && request.assigneeId ? ` · ${supportContent.list.assigned.replace("{name}", nameOf(request.assigneeId))}` : null}
          </p>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-6">
            <section className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
              <p className="whitespace-pre-wrap break-words text-ink">{request.description}</p>
              {request.links.length > 0 ? (
                <div className="mt-4 border-t border-line pt-4">
                  <h2 className="text-sm font-medium text-ink">{copy.links}</h2>
                  <ul className="mt-1 space-y-1">
                    {request.links.map((link) => (
                      <li key={link} className="break-all text-sm">
                        {/* Shown, never fetched by the site; opened without telling the other site where from. */}
                        <a href={link} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark">
                          {link}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section aria-labelledby="conversation">
              <h2 id="conversation" className="font-display text-2xl text-ink">
                {copy.conversation}
              </h2>
              {timeline.length === 0 ? <p className="mt-3 text-sm text-muted">{copy.noMessages}</p> : null}
              <ol className="mt-4 space-y-3">
                {timeline.map((item) =>
                  "message" in item && item.message ? (
                    <Message key={item.message.id} message={item.message} name={nameOf(item.message.authorId)} time={relativeTime(item.at, now)} />
                  ) : "event" in item && item.event ? (
                    <EventLine key={item.event.id} event={item.event} name={nameOf(item.event.actorId)} to={item.event.kind === "assigned" ? nameOf(item.event.to) : null} time={relativeTime(item.at, now)} />
                  ) : null,
                )}
              </ol>
            </section>

            <ReplyBox publicId={request.publicId} status={request.status} manager={manager} />
          </div>

          <aside className="space-y-6">
            {!isEmptyContext(request.context) ? (
              <section className="rounded-card border border-line bg-surface p-5 shadow-card">
                <h2 className="font-display text-xl text-ink">{copy.about}</h2>
                <p className="mt-1 text-xs text-muted">{copy.reportedAs}</p>
                <ul className="mt-3 space-y-1 text-sm text-ink">
                  {lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {isRedacted(request.context) ? <p className="mt-3 text-sm text-muted">{copy.redacted}</p> : null}
                {links.length > 0 ? (
                  <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
                    {links.map((link) => (
                      <li key={link.href}>
                        <Link href={link.href} className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark">
                          {link.kind === "service" ? copy.openService : link.kind === "planner" ? copy.openPlanner : link.kind === "song" ? copy.openSong : copy.openPage}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
            {manager ? (
              <ManagePanel
                key={request.revision}
                publicId={request.publicId}
                revision={request.revision}
                status={request.status}
                priority={request.priority}
                waitingOn={request.waitingOn}
                assigneeId={request.assigneeId}
                managers={managers}
                viewerId={viewer.userId}
              />
            ) : null}
          </aside>
        </div>
      </Container>
    </PageTransition>
  );
}

function Message({ message, name, time }: { message: StoredMessage; name: string; time: string }) {
  const internal = message.visibility === "internal";
  return (
    <li className={cn("rounded-card border p-4 sm:p-5", internal ? "border-gold bg-gold/10" : "border-line bg-surface")}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="font-medium text-ink">{name}</span>
        <span>{time}</span>
        {internal ? <span className="rounded-full border border-gold-dark px-2 py-0.5 font-medium text-ink">{copy.internalBadge}</span> : null}
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words text-ink">{message.body}</p>
    </li>
  );
}

function EventLine({ event, name, to, time }: { event: StoredEvent; name: string; to: string | null; time: string }) {
  const words = supportContent.events;
  const value = (raw: string | null) => {
    if (!raw) return "";
    if (event.kind === "priority_changed") return supportContent.priorities[raw as keyof typeof supportContent.priorities] ?? raw;
    if (event.kind === "status_changed") return supportContent.statuses[raw as keyof typeof supportContent.statuses] ?? raw;
    if (event.kind === "waiting_changed") return supportContent.manage.waitingOptions[raw as keyof typeof supportContent.manage.waitingOptions] ?? raw;
    return raw;
  };
  const template =
    event.kind === "assigned" ? (event.to ? words.assigned : words.unassigned) : event.kind in words ? words[event.kind as keyof typeof words] : null;
  if (!template) return null;
  return (
    <li className="px-1 text-sm text-muted">
      {template.replace("{name}", name).replace("{to}", event.kind === "assigned" ? (to ?? "") : value(event.to))} · {time}
    </li>
  );
}
