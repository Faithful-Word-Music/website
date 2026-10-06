import { NoAccess, Notice } from "@/components/account/Notices";
import { SectionLabel } from "@/components/account/ProfileView";
import { AiConnectionTest } from "@/components/admin/AiConnectionTest";
import { LibraryIndexProblems, LibraryIndexRefresh } from "@/components/admin/LibraryIndexRefresh";
import { Pill } from "@/components/admin/StatusPill";
import { Card } from "@/components/ui/Card";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { MoreList } from "@/components/ui/ShowMore";
import { StatTile } from "@/components/ui/StatTile";
import { aiContent } from "@/content/ai";
import { aiConfig } from "@/lib/ai/config";
import type { AiErrorCode } from "@/lib/ai/errors";
import { aiFeatureLabel } from "@/lib/ai/features";
import { formatDuration, formatShare, formatTokens, formatUsd } from "@/lib/ai/format";
import { backfillAiCosts } from "@/lib/ai/service";
import { getAiUsageSummary, listRecentAiUsage, type AiUsageRecord, type AiUsageSummary } from "@/lib/ai/store";
import { averageCostUsd, budgetStatus, monthWindow, type AiUsageGroup } from "@/lib/ai/usage";
import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { formatDateTime } from "@/lib/auth/format";
import { requireAnyPermission } from "@/lib/auth/session";
import { isGoogleConfigured } from "@/lib/google-auth";
import { getLibraryIndexStatus, type LibraryIndexStatus } from "@/lib/library-content/indexer";
import { plural } from "@/lib/plural";

export const metadata = { title: "AI" };

const content = aiContent.admin;

/**
 * /admin/ai - whether the AI system is connected, a button to prove it, and
 * the site's own record of what has been used this month (use_ai).
 *
 * The usage is read from ai_usage (src/lib/ai/store.ts). Vercel AI Gateway
 * holds the real budget and refuses requests past it; the budget here is only
 * shown beside the site's figures. A fuller usage page will grow from this one.
 */
export default async function AiPage() {
  const viewer = await requireAnyPermission("/admin/ai", ["use_ai"]);
  if (!viewer) return <NoAccess />;

  const config = aiConfig();
  const [usage, library] = await Promise.all([loadUsage(viewer.env), getLibraryIndexStatus(viewer)]);

  return (
    <div>
      <SectionHeading as="h1" title={content.title}>
        <p className="text-base">{content.intro}</p>
      </SectionHeading>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <Card className="h-full p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <SectionLabel>{content.status.heading}</SectionLabel>
              <Pill tone={config.configured ? "neutral" : "warning"}>
                {config.configured ? content.status.ready : content.status.notConfigured}
              </Pill>
            </div>
            {!config.configured ? <p className="mt-3 text-sm text-gold-dark">{content.status.notConfiguredBody}</p> : null}
            <dl className="mt-4 space-y-3 text-sm">
              <Row label={content.status.model}>
                <span className="break-all">{config.model}</span>
              </Row>
              {config.auth ? <Row label={content.status.credentials}>{content.status.credentialLabels[config.auth]}</Row> : null}
              <Row label={content.status.budget}>
                {config.monthlyBudgetUsd === null ? content.status.noBudget : formatUsd(config.monthlyBudgetUsd)}
              </Row>
            </dl>
            <p className="mt-4 text-sm text-muted">{content.status.enforcement}</p>
            <p className="mt-3 text-sm">
              <ExternalLink
                href={config.dashboardUrl}
                showIcon
                className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark"
              >
                {content.status.dashboard}
              </ExternalLink>
            </p>
          </Card>
        </section>

        <section className="min-w-0">
          <Card className="h-full p-4 sm:p-6">
            <SectionLabel>{content.test.heading}</SectionLabel>
            <p className="mt-1 mb-5 text-sm text-muted">{content.test.body}</p>
            <AiConnectionTest disabled={!config.configured} />
          </Card>
        </section>
      </div>

      <LibraryIndex status={library} canRefresh={isGoogleConfigured()} />

      {usage ? (
        <Usage {...usage} budgetUsd={config.monthlyBudgetUsd} />
      ) : (
        <Notice tone="warning" title={content.unavailable.title} className="mt-10">
          {content.unavailable.body}
        </Notice>
      )}
    </div>
  );
}

/**
 * This month's usage and the latest requests, or null when the log cannot be
 * read - which must not take the page (or the test button) with it.
 */
async function loadUsage(env: ClerkEnv): Promise<{ summary: AiUsageSummary; recent: AiUsageRecord[]; monthLabel: string } | null> {
  const month = monthWindow(Date.now());
  try {
    // Costs the Gateway had not worked out when their requests were logged.
    await backfillAiCosts(env);
    const [summary, recent] = await Promise.all([getAiUsageSummary(env, month.start, month.end), listRecentAiUsage(env)]);
    return { summary, recent, monthLabel: month.label };
  } catch (error) {
    console.error("[ai] Could not load usage:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

/**
 * The library index: how many songs have their lyrics read and embedded, what
 * a refresh would do now, and the button that refreshes it. Read from Neon
 * and the cached Drive listing - loading the page opens no file.
 */
function LibraryIndex({ status, canRefresh }: { status: LibraryIndexStatus; canRefresh: boolean }) {
  const text = content.library;
  const count = (value: number) => value.toLocaleString("en-US");

  return (
    <>
      <h2 className="mt-12 font-display text-2xl text-ink">{text.heading}</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">{text.intro}</p>

      {status.ok ? (
        <>
          <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile label={text.songs} value={count(status.counts.songs)} />
            <StatTile
              label={text.indexed}
              value={count(status.counts.indexed)}
              detail={[
                plural(text.sections, status.counts.sections),
                status.counts.awaitingEmbedding > 0 ? plural(text.awaitingEmbedding, status.counts.awaitingEmbedding) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <StatTile
              label={text.outOfDate}
              value={status.outOfDate === null ? content.month.none : count(status.outOfDate)}
              detail={status.outOfDate === 0 ? text.upToDate : text.outOfDateDetail}
            />
            <StatTile label={text.noSource} value={count(status.counts.noSource)} detail={text.noSourceDetail} />
            <StatTile label={text.noLyrics} value={count(status.counts.noLyrics)} detail={text.noLyricsDetail} />
            <StatTile label={text.failed} value={count(status.counts.failed)} detail={text.failedDetail} />
          </dl>

          <Card className="mt-6 p-4 sm:p-6">
            <SectionLabel>{text.refreshHeading}</SectionLabel>
            <p className="mt-1 mb-5 max-w-3xl text-sm text-muted">{text.refreshBody}</p>
            <LibraryIndexRefresh disabled={!canRefresh} />
            <dl className="mt-6 space-y-3 border-t border-line pt-4 text-sm">
              <Row label={text.refreshed}>
                <span className="tnum">{status.counts.refreshedAt ? formatDateTime(status.counts.refreshedAt) : text.never}</span>
              </Row>
              <Row label={text.embeddingModel}>
                <span className="break-all">{status.embeddingModel}</span>
              </Row>
            </dl>
            <LibraryIndexProblems problems={status.problems} />
          </Card>
        </>
      ) : (
        <Notice tone="warning" title={text.unavailable.title} className="mt-5">
          {text.unavailable.body}
        </Notice>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-ink sm:text-right">{children}</dd>
    </div>
  );
}

function Usage({
  summary,
  recent,
  monthLabel,
  budgetUsd,
}: {
  summary: AiUsageSummary;
  recent: AiUsageRecord[];
  monthLabel: string;
  budgetUsd: number | null;
}) {
  const { totals } = summary;
  const budget = budgetStatus(totals.costUsd, budgetUsd);
  const average = averageCostUsd(totals);
  const text = content.month;

  return (
    <>
      <h2 className="mt-12 font-display text-2xl text-ink">{text.heading}</h2>
      <p className="mt-1 text-sm text-muted">{text.period.replace("{month}", monthLabel)}</p>

      {budget ? (
        <div className="mt-5">
          <div
            role="progressbar"
            aria-label={text.barLabel.replace("{used}", formatShare(budget.used))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(budget.used * 100))}
            className="h-1.5 overflow-hidden rounded-full bg-line"
          >
            <div
              className={budget.over ? "h-full bg-gold-dark" : "h-full bg-gold"}
              style={{ width: `${Math.min(100, budget.used * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label={text.cost}
          value={formatUsd(totals.costUsd)}
          detail={budget ? text.ofBudget.replace("{budget}", formatUsd(budget.budgetUsd)) : undefined}
        />
        {budget ? (
          <StatTile
            label={text.remaining}
            value={formatUsd(budget.remainingUsd)}
            detail={budget.over ? text.overBudget : text.used.replace("{share}", formatShare(budget.used))}
          />
        ) : null}
        <StatTile
          label={text.requests}
          value={totals.requests.toLocaleString("en-US")}
          detail={totals.errors > 0 ? plural(text.errors, totals.errors) : undefined}
        />
        <StatTile
          label={text.tokens}
          value={formatTokens(totals.inputTokens + totals.outputTokens)}
          detail={[
            text.tokenSplit
              .replace("{input}", formatTokens(totals.inputTokens))
              .replace("{output}", formatTokens(totals.outputTokens)),
            totals.reasoningTokens > 0 ? text.reasoning.replace("{count}", formatTokens(totals.reasoningTokens)) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <StatTile label={text.average} value={average === null ? text.none : formatUsd(average)} detail={text.averageDetail} />
        <StatTile
          label={text.latency}
          value={totals.averageDurationMs === null ? text.none : formatDuration(totals.averageDurationMs)}
          detail={text.latencyDetail}
        />
      </dl>

      {totals.requests > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Breakdown heading={content.breakdown.byFeature} groups={summary.byFeature} name={aiFeatureLabel} />
          <Breakdown heading={content.breakdown.byModel} groups={summary.byModel} name={(key) => key} />
        </div>
      ) : null}
      {totals.requests > 0 ? <p className="mt-4 max-w-3xl text-sm text-muted">{content.requestsNote}</p> : null}

      <h2 className="mt-12 font-display text-2xl text-ink">{content.recent.heading}</h2>
      {recent.length === 0 ? (
        <p className="mt-4 text-muted">{content.recent.empty}</p>
      ) : (
        // The newest few; the rest on request.
        <MoreList
          cardClassName="mt-4 overflow-hidden"
          className="divide-y divide-line"
          rows={recent.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-ink">
                    {aiFeatureLabel(item.feature)}
                    {item.action ? <span className="text-muted"> · {item.action}</span> : null}
                  </p>
                  <p className="tnum text-xs text-muted">
                    {formatDateTime(item.at)} · <span className="break-all">{item.model}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 sm:justify-end">
                  <p className="tnum text-xs text-muted">
                    {[
                      item.totalTokens === null ? null : plural(content.breakdown.tokens, item.totalTokens),
                      // A failure costs nothing known, and neither does an answer stopped before the model had replied.
                      item.status === "error" || (item.finishReason === "aborted" && item.costUsd === null)
                        ? null
                        : item.costUsd === null
                          ? content.recent.costPending
                          : formatUsd(item.costUsd),
                      item.durationMs === null ? null : formatDuration(item.durationMs),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {item.status === "success" ? (
                    <Pill tone="muted">{item.finishReason === "aborted" ? content.recent.stopped : content.recent.answered}</Pill>
                  ) : (
                    <Pill tone="warning">
                      {aiContent.errorLabels[item.errorCode as AiErrorCode] ?? aiContent.errorLabels.unknown}
                    </Pill>
                  )}
                </div>
              </li>
          ))}
        />
      )}

      <p className="mt-6 text-sm text-muted">{content.environment}</p>
    </>
  );
}

function Breakdown({ heading, groups, name }: { heading: string; groups: AiUsageGroup[]; name: (key: string) => string }) {
  return (
    <section className="min-w-0">
      <Card className="h-full p-4 sm:p-6">
        <SectionLabel>{heading}</SectionLabel>
        <ul className="mt-3 divide-y divide-line">
          {groups.map((group) => (
            <li key={group.key} className="flex items-baseline justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <p className="break-words text-ink">{name(group.key)}</p>
                <p className="tnum text-xs text-muted">
                  {plural(content.breakdown.requests, group.requests)} ·{" "}
                  {plural(content.breakdown.tokens, group.tokens)}
                </p>
              </div>
              <p className="tnum shrink-0 font-display text-lg text-ink">{formatUsd(group.costUsd)}</p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
