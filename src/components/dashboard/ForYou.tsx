import Link from "next/link";
import type { ReactNode } from "react";

import { Disclosure } from "@/components/dashboard/Disclosure";
import { InPageLink } from "@/components/dashboard/InPageLink";
import { cn } from "@/components/ui/cn";
import { CountBadge } from "@/components/ui/CountBadge";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { dashboardContent } from "@/content/dashboard";
import type { AttentionItem } from "@/lib/dashboard/attention";
import type { ForYouModel } from "@/lib/dashboard/workspace";
import { plural } from "@/lib/plural";

const copy = dashboardContent.forYou;
const HEADING_ID = "dashboard-for-you";

/**
 * "For you": what this person should do something about, most pressing
 * first - five at a time, the rest a click away, in the same order. Urgent
 * items say so in words as well as with their mark. With nothing to do it
 * is one quiet line; when a source could not be read it says that instead
 * of claiming an all-clear.
 */
export function ForYou({ model, className }: { model: ForYouModel; className?: string }) {
  const total = model.shown.length + model.rest.length;

  if (total === 0) {
    return (
      <section aria-labelledby={HEADING_ID} className={className}>
        <h2 id={HEADING_ID} className="sr-only">
          {copy.title}
        </h2>
        {model.complete ? (
          <Notice compact tone="success" title={copy.clear.title} className="h-full shadow-none">
            {copy.clear.body}
          </Notice>
        ) : (
          <Notice compact tone="neutral" title={copy.incomplete.title} className="h-full shadow-none">
            {copy.incomplete.body}
          </Notice>
        )}
      </section>
    );
  }

  return (
    <section
      aria-labelledby={HEADING_ID}
      className={cn("flex min-w-0 flex-col rounded-card border border-line bg-surface shadow-card", className)}
    >
      <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
        <h2 id={HEADING_ID} className="flex items-center gap-2.5 font-display text-xl text-ink">
          {copy.title}
          <CountBadge count={total} label={plural(copy.count, total)} />
        </h2>
      </header>
      <ul className="divide-y divide-line border-t border-line">
        {model.shown.map((item) => (
          <ForYouRow key={item.id} item={item} />
        ))}
      </ul>
      {model.rest.length > 0 ? (
        <Disclosure
          className="border-t border-line"
          buttonClassName="px-5"
          buttonAfter
          showLabel={copy.seeAll.replace("{count}", String(total))}
          hideLabel={copy.seeFewer}
        >
          <ul className="divide-y divide-line border-b border-line">
            {model.rest.map((item) => (
              <ForYouRow key={item.id} item={item} />
            ))}
          </ul>
        </Disclosure>
      ) : null}
      {!model.complete ? (
        <p className="mt-auto flex items-start gap-2 border-t border-line px-5 py-3 text-xs text-muted">
          <Icon name="minus" size={14} className="mt-px" />
          {copy.incomplete.title}
        </p>
      ) : null}
    </section>
  );
}

const rowClass =
  "group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-paper focus-visible:-outline-offset-2";

function ForYouRow({ item }: { item: AttentionItem }) {
  const urgent = item.priority === "urgent";
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "mt-[0.45rem] size-2 shrink-0 rounded-full",
          urgent ? "bg-danger" : item.priority === "low" ? "border border-staff" : "bg-gold",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[0.95rem] leading-snug text-ink", urgent && "font-medium")}>
          {urgent ? <span className="sr-only">{copy.urgent}: </span> : null}
          {item.title}
        </span>
        {item.detail ? <span className="mt-0.5 block text-sm leading-snug text-muted">{item.detail}</span> : null}
        <span className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-ink-soft transition-colors group-hover:text-ink">
          {item.action}
          <Icon name="arrow-right" size={13} strokeWidth={1.6} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      </span>
      {urgent ? (
        <span className="shrink-0 rounded-full bg-danger-bg px-2 py-0.5 text-[0.7rem] font-semibold text-danger" aria-hidden="true">
          {copy.urgent}
        </span>
      ) : null}
    </>
  );
  return <li>{link(item.href, body)}</li>;
}

function link(href: string, children: ReactNode) {
  if (href.startsWith("#")) {
    return (
      <InPageLink href={href as `#${string}`} className={rowClass}>
        {children}
      </InPageLink>
    );
  }
  return (
    <Link href={href} className={rowClass}>
      {children}
    </Link>
  );
}
