import Link from "next/link";
import type { ReactNode } from "react";

import { NoAccess, Notice } from "@/components/account/Notices";
import { SectionLabel } from "@/components/account/ProfileView";
import { ActivateSheetAccess, RollbackSheetAccess } from "@/components/admin/SheetAccessPanel";
import { Pill } from "@/components/admin/StatusPill";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { adminContent } from "@/content/admin";
import { formatDateTime } from "@/lib/auth/format";
import { activationBlocker } from "@/lib/auth/membership-rules";
import { ADMIN_ROLE } from "@/lib/auth/permissions";
import { PROFILE_GATE_EXEMPT, requireAnyPermission } from "@/lib/auth/session";
import { loadSheetAccessReport } from "@/lib/auth/sheet-access";
import { songPath } from "@/lib/song-list";
import { songUrlSlug } from "@/lib/song-identity";

export const metadata = { title: "Sheet Access" };

const copy = adminContent.sheetAccess;
const SHOWN = 100;

/**
 * /admin/sheet-access - what activating the sheet music policy would change
 * here, the files waiting for review, and the Activate button. Everything is
 * for this Clerk environment only.
 */
export default async function SheetAccessPage() {
  const viewer = await requireAnyPermission("/admin/sheet-access", ["manage_sheet_music"], PROFILE_GATE_EXEMPT);
  if (!viewer) return <NoAccess />;

  const loaded = await loadSheetAccessReport(viewer.env);
  const environment = copy.environments[viewer.env];
  const heading = (
    <SectionHeading as="h1" title={copy.title}>
      <p className="text-base">{copy.lead.replace("{environment}", environment)}</p>
    </SectionHeading>
  );
  if (!loaded.ok) {
    return (
      <div className="space-y-8">
        {heading}
        <Notice tone="warning" title={copy.unavailableTitle}>
          {copy.problems[loaded.problem]}
        </Notice>
      </div>
    );
  }

  const { report } = loaded;
  const isAdmin = viewer.roleKeys.includes(ADMIN_ROLE);
  const blocker = activationBlocker(report);
  const reviewable = viewer.sheet.mayReviewWithheld;

  return (
    <div className="space-y-8">
      {heading}

      <Card className="p-6">
        <SectionLabel>{copy.status.title}</SectionLabel>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink">
          <Pill tone={report.activated ? "strong" : "muted"}>{report.activated ? copy.status.active : copy.status.inactive}</Pill>
          {report.activatedAt ? <span className="text-muted">{formatDateTime(report.activatedAt)}</span> : null}
          {report.rolledBack ? <Pill tone="warning">{copy.status.rolledBack}</Pill> : null}
        </p>
        {!report.activated ? <p className="mt-3 text-sm text-muted">{copy.status.inactiveHint}</p> : null}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title={copy.people.title}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label={copy.people.total} value={report.people.total} />
            <Stat label={copy.people.verified} value={report.verifiedMembers} />
            <Stat label={copy.people.keep} value={report.people.keep} />
            <Stat label={copy.people.without} value={report.people.unchangedWithout} />
          </dl>
          <PeopleList title={copy.people.lose} people={report.people.lose} />
          <PeopleList title={copy.people.gain} people={report.people.gain} />
        </Section>

        <Section title={copy.files.title}>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <Stat label={copy.files.public} value={report.files.public} />
            <Stat label={copy.files.restricted} value={report.files.restricted} />
            <Stat label={copy.files.withheld} value={report.files.withheld} />
          </dl>
          <p className="mt-4 text-xs text-muted">
            {copy.files.refreshHint}{" "}
            <Link href="/admin/configuration" className="underline decoration-gold underline-offset-4 hover:text-gold-dark">
              {copy.files.refreshLink}
            </Link>
            .
          </p>
        </Section>
      </div>

      {report.upcoming.length > 0 ? (
        <Section title={copy.upcoming.title}>
          <p className="text-sm text-muted">{copy.upcoming.lead}</p>
          <ul className="mt-3 divide-y divide-line">
            {report.upcoming.slice(0, SHOWN).map((item) => (
              <li key={`${item.date}-${item.title}`} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:justify-between sm:gap-4">
                <span className="text-ink">{item.title}</span>
                <span className="text-muted">{item.dateLabel}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {report.files.withheldFiles.length > 0 ? (
        <Section title={copy.review.title}>
          <p className="text-sm text-muted">{report.activated ? copy.review.lead : copy.review.leadBefore}</p>
          <ul className="mt-3 divide-y divide-line">
            {report.files.withheldFiles.slice(0, SHOWN).map((file) => {
              const href = `${songPath(songUrlSlug({ songId: file.songId, title: file.title, number: null }))}/sheet-music/${file.file}`;
              return (
                <li key={`${file.songId}/${file.file}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
                  <span className="min-w-0 text-ink">
                    {file.title} <span className="text-muted">· {file.label} · {copy.review.formats[file.format]}</span>
                  </span>
                  {reviewable ? (
                    <a href={href} target="_blank" rel="noreferrer" className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-dark">
                      {copy.review.open}
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {report.files.withheldFiles.length > SHOWN ? (
            <p className="mt-3 text-xs text-muted">
              {copy.review.more.replace("{count}", String(report.files.withheldFiles.length - SHOWN))}
            </p>
          ) : null}
        </Section>
      ) : null}

      {isAdmin ? (
        <Section title={copy.activation.title}>
          {report.activated ? (
            report.rolledBack ? (
              <p className="text-sm text-muted">{copy.activation.rolledBackNote}</p>
            ) : (
              <RollbackSheetAccess />
            )
          ) : (
            <ActivateSheetAccess
              reportHash={report.reportHash}
              environment={environment}
              blocked={blocker ? copy.activation.blocked[blocker] : null}
            />
          )}
        </Section>
      ) : (
        <p className="text-sm text-muted">{copy.activation.adminOnly}</p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-6">
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="text-lg text-ink">{value}</dd>
    </div>
  );
}

function PeopleList({ title, people }: { title: string; people: ReadonlyArray<{ id: string; name: string }> }) {
  if (people.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="text-xs text-muted">
        {title} ({people.length})
      </p>
      <ul className="mt-1 divide-y divide-line">
        {people.slice(0, SHOWN).map((person) => (
          <li key={person.id}>
            <Link href={`/admin/users/${person.id}`} className="block py-1.5 text-sm text-ink transition-colors hover:text-gold-dark">
              {person.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
