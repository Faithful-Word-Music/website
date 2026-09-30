import Link from "next/link";

import { NoAccess } from "@/components/account/Notices";
import { StatusPill } from "@/components/admin/StatusPill";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { formatDate } from "@/lib/auth/format";
import { reconcileRequests } from "@/lib/auth/reconcile";
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS, isRequestStatus } from "@/lib/auth/request-status";
import { requireAnyPermission } from "@/lib/auth/session";
import { listRequests } from "@/lib/auth/store";

export const metadata = { title: "Account requests" };

/** /admin/requests - everyone who has asked for an account, pending first. */
export default async function RequestsPage({ searchParams }: PageProps<"/admin/requests">) {
  const viewer = await requireAnyPermission("/admin/requests", ["manage_users"]);
  if (!viewer) return <NoAccess />;

  const { status: statusParam } = await searchParams;
  const status = typeof statusParam === "string" && isRequestStatus(statusParam) ? statusParam : undefined;
  const requests = await reconcileRequests(viewer.env, await listRequests(viewer.env));
  const shown = status ? requests.filter((request) => request.status === status) : requests;

  const filters = [{ value: undefined, label: "All" }, ...REQUEST_STATUSES.map((value) => ({ value, label: REQUEST_STATUS_LABELS[value] }))];

  return (
    <div>
      <SectionHeading as="h1" title="Account requests">
        <p className="text-base">
          Requests stay pending until someone approves or declines them. Approving sends a Clerk invitation email.
        </p>
      </SectionHeading>

      <ul className="mt-8 flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active = filter.value === status;
          const count = filter.value ? requests.filter((request) => request.status === filter.value).length : requests.length;
          return (
            <li key={filter.label}>
              <Link
                href={filter.value ? `/admin/requests?status=${filter.value}` : "/admin/requests"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm transition-colors",
                  active ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:border-gold",
                )}
              >
                {filter.label}
                <span className={active ? "text-paper/70" : "text-muted"}>{count}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <Card className="mt-6 overflow-hidden">
        {shown.length === 0 ? (
          <p className="p-8 text-center text-muted">
            {status ? `No ${REQUEST_STATUS_LABELS[status].toLowerCase()} requests.` : "No one has asked for an account yet."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/admin/requests/${request.id}`}
                  className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-paper sm:flex-row sm:items-center sm:gap-6"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{request.name}</p>
                    <p className="truncate text-sm text-muted">{request.email}</p>
                  </div>
                  <p className="hidden min-w-0 flex-1 truncate text-sm text-muted lg:block">{request.message}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted">{formatDate(request.createdAt)}</span>
                    <StatusPill status={request.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
