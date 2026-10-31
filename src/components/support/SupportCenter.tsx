import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { Container } from "@/components/ui/Container";
import { PageTransition } from "@/components/ui/PageTransition";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { supportContent } from "@/content/support";
import type { Viewer } from "@/lib/auth/session";
import { MANAGE_PERMISSION, SUBMIT_PERMISSION } from "@/lib/support/access";
import { parseContextInput, type ContextInput } from "@/lib/support/context";
import { leadingChoices, resolveContext, serviceChoices } from "@/lib/support/context-load";
import { supportDeps } from "@/lib/support/deps";
import { contextLines, positionsText, serviceName } from "@/lib/support/display";
import { namesFor } from "@/lib/support/people";
import { CATEGORY_KEYS, PRIORITIES, isCategory, isPriority, isRequestType, typeOf, type Category, type RequestType } from "@/lib/support/model";
import { listMine, listQueue } from "@/lib/support/service";
import { QUEUE_VIEWS, type QueueView } from "@/lib/support/store";

import { RequestForm, type FormStart } from "./RequestForm";
import { RequestList } from "./RequestList";

type Params = Record<string, string | string[] | undefined>;
type Section = "new" | "mine" | "manage";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** When the page was put together: times on it ("updated 5 minutes ago") are measured from this. */
async function renderedAt(): Promise<number> {
  return Date.now();
}
const PAGE = 25;

/** "?view=manage&queue=unassigned" - keeping the other filters. */
function hrefWith(params: Params, changes: Record<string, string | null>): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = one(value);
    if (text && !["new", "category", "service", "place", "position", "song", "file", "leading", "page"].includes(key)) next.set(key, text);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `/contact?${query}` : "/contact";
}

/** The references a "Report a problem" link carried, in the shape the form sends. */
function linkedReferences(params: Params): ContextInput {
  const position = Number(one(params.position));
  return {
    service: one(params.service),
    placeId: one(params.place),
    position: Number.isInteger(position) ? position : undefined,
    songId: one(params.song),
    file: one(params.file),
    leadership: one(params.leading) === "1" ? true : undefined,
    page: one(params.page),
  };
}

/**
 * The Music Ministry Support Center: /contact for a signed-in member. One
 * page with three parts - a new request, the person's own requests and, for
 * whoever manages them, every request - chosen by `?view=`.
 */
export async function SupportCenter({ viewer, params }: { viewer: Viewer; params: Params }) {
  const manages = viewer.can(MANAGE_PERMISSION);
  const submits = viewer.can(SUBMIT_PERMISSION);
  const asked = one(params.view);
  const section: Section =
    asked === "manage" && manages ? "manage" : asked === "mine" && submits ? "mine" : submits ? "new" : "manage";
  const deps = supportDeps(viewer.env);
  const now = await renderedAt();
  const offset = Math.max(0, Number(one(params.offset)) || 0);

  const tabs: Array<{ key: Section; label: string }> = [
    ...(submits ? [{ key: "new" as const, label: supportContent.sections.new }, { key: "mine" as const, label: supportContent.sections.mine }] : []),
    ...(manages ? [{ key: "manage" as const, label: supportContent.sections.manage }] : []),
  ];

  return (
    <PageTransition>
      <Container size="narrow" className="pb-14 pt-10 sm:pb-20 sm:pt-14">
        <SectionHeading as="h1" eyebrow={supportContent.eyebrow} title={supportContent.title}>
          <p className="text-base sm:text-lg">{supportContent.lead}</p>
        </SectionHeading>

        <nav aria-label={supportContent.title} className="mt-8 flex flex-wrap gap-x-1 border-b border-line">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.key === "new" ? "/contact" : `/contact?view=${tab.key}`}
              aria-current={section === tab.key ? "page" : undefined}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                section === tab.key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="mt-8">
          {section === "new" ? <NewRequest viewer={viewer} params={params} now={now} /> : null}
          {section === "mine" ? <Mine viewer={viewer} params={params} offset={offset} now={now} deps={deps} /> : null}
          {section === "manage" ? <Manage viewer={viewer} params={params} offset={offset} now={now} deps={deps} /> : null}
        </div>

        <p className="mt-10 text-center text-sm text-muted">
          {supportContent.directLabel}{" "}
          <a
            href={`mailto:${supportContent.directEmail}`}
            className="text-ink underline decoration-gold underline-offset-4 transition-colors hover:text-gold-dark"
          >
            {supportContent.directEmail}
          </a>
        </p>
      </Container>
    </PageTransition>
  );
}

async function NewRequest({ viewer, params, now }: { viewer: Viewer; params: Params; now: number }) {
  const entry = one(params.new);
  const asked = one(params.category);
  const category: Category | null = isCategory(asked) ? asked : null;
  const type: RequestType | null = category ? typeOf(category) : isRequestType(entry) ? entry : null;

  // Choices fail soft: without them the form still takes a request about nothing in particular.
  const [services, leading] = await Promise.all([
    serviceChoices(now).catch(() => []),
    viewer.can("lead_songs") || viewer.can("manage_service_plans") ? leadingChoices(viewer.env, viewer.userId, now).catch(() => []) : Promise.resolve([]),
  ]);

  let start: FormStart = { type, category, context: {}, contextLines: null, contextProblem: null };
  const linkedService = one(params.service);
  if (!category && linkedService && /^\d{4}-\d{2}-\d{2}-(am|pm)$/.test(linkedService)) {
    // A service, with the kind still to choose: it is offered in the form's service list, and checked when sent.
    start = { ...start, context: { service: linkedService } };
  }
  if (category) {
    const references = parseContextInput(category, linkedReferences(params));
    if (Object.keys(references).length > 0) {
      const resolved = await resolveContext(viewer.env, viewer, category, references, now).catch(() => ({ ok: false as const, reason: "missing" as const }));
      start = resolved.ok
        ? { ...start, context: references, contextLines: contextLines(resolved.context) }
        : { ...start, contextProblem: resolved.reason === "changed" ? "changed" : "context" };
    }
  }

  const serviceList = services.map((service) => ({ anchor: service.anchor, name: serviceName(service) }));
  const linked = start.context.service;
  if (linked && !serviceList.some((service) => service.anchor === linked)) {
    // Linked from an older card: offered too (whether it may be reported on is checked when sent).
    const [, date, slot] = /^(\d{4}-\d{2}-\d{2})-(am|pm)$/.exec(linked) ?? [];
    if (date) serviceList.unshift({ anchor: linked, name: serviceName({ date, slot: slot === "am" ? "AM" : "PM", label: null, startsAt: null }) });
  }

  return (
    <RequestForm
      start={start}
      choices={{
        services: serviceList,
        leading: leading.map((service) => ({ anchor: service.anchor, name: serviceName(service), positions: positionsText(service.positions) })),
      }}
    />
  );
}

async function Mine({ viewer, params, offset, now, deps }: { viewer: Viewer; params: Params; offset: number; now: number; deps: ReturnType<typeof supportDeps> }) {
  const page = await listMine(viewer, offset, deps);
  if (!page.ok) return null;
  return (
    <RequestList
      items={page.items}
      names={new Map()}
      forManager={false}
      now={now}
      empty={supportContent.list.empty}
      moreHref={page.more ? hrefWith(params, { offset: String(offset + PAGE) }) : null}
    />
  );
}

async function Manage({ viewer, params, offset, now, deps }: { viewer: Viewer; params: Params; offset: number; now: number; deps: ReturnType<typeof supportDeps> }) {
  const askedView = one(params.queue);
  const view: QueueView = (QUEUE_VIEWS as readonly string[]).includes(askedView ?? "") ? (askedView as QueueView) : "needs_action";
  const askedCategory = one(params.kind);
  const category = isCategory(askedCategory) ? askedCategory : null;
  const askedPriority = one(params.priority);
  const priority = isPriority(askedPriority) ? askedPriority : null;
  const page = await listQueue(viewer, { view, category, priority, offset }, deps);
  if (!page.ok) return null;
  const names = await namesFor(page.items.flatMap((item) => [item.submitterId, ...(item.assigneeId ? [item.assigneeId] : [])]));
  const queue = supportContent.queue;
  const selectClasses = "min-h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="list">
        {QUEUE_VIEWS.map((item) => (
          <Link
            key={item}
            role="listitem"
            href={hrefWith(params, { view: "manage", queue: item, offset: null })}
            aria-current={view === item ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-4 text-sm transition-colors",
              view === item ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:border-gold",
            )}
          >
            {queue.views[item]}
          </Link>
        ))}
      </div>

      {/* A plain GET form: the filters are part of the address, so the page can be shared and reloaded. */}
      <form action="/contact" method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value="manage" />
        <input type="hidden" name="queue" value={view} />
        <label className="text-sm text-ink">
          <span className="mb-1 block font-medium">{queue.category}</span>
          <select name="kind" defaultValue={category ?? ""} className={selectClasses}>
            <option value="">{queue.any}</option>
            {CATEGORY_KEYS.map((key) => (
              <option key={key} value={key}>
                {supportContent.categories[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink">
          <span className="mb-1 block font-medium">{queue.priority}</span>
          <select name="priority" defaultValue={priority ?? ""} className={selectClasses}>
            <option value="">{queue.any}</option>
            {PRIORITIES.map((key) => (
              <option key={key} value={key}>
                {supportContent.priorities[key]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="min-h-10 rounded-full border border-line bg-surface px-4 text-sm text-ink hover:border-gold">
          {queue.apply}
        </button>
      </form>

      <RequestList
        items={page.items}
        names={names}
        forManager
        now={now}
        empty={supportContent.list.emptyQueue}
        moreHref={page.more ? hrefWith(params, { offset: String(offset + PAGE) }) : null}
      />
    </div>
  );
}
